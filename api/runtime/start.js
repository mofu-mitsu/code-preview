import { randomUUID } from "node:crypto";
import { Sandbox } from "@vercel/sandbox";

export const config = { maxDuration: 30 };

const MAX_FILES = 200;
const MAX_FILE_BYTES = 500_000;
const MAX_TOTAL_BYTES = 3_000_000;

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}
function safePath(input) {
  const path = String(input || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!path || path.split("/").some(part => part === ".." || part === "." || part === "")) throw new Error("不正なファイルパス: " + input);
  return path;
}
function toBuffer(value) {
  if (typeof value !== "string") return Buffer.from(String(value ?? ""));
  const match = value.match(/^data:[^,]*?(;base64)?,([\s\S]*)$/);
  if (!match) return Buffer.from(value, "utf8");
  return match[1] ? Buffer.from(match[2], "base64") : Buffer.from(decodeURIComponent(match[2]), "utf8");
}
function shellQuote(value) {
  return "'" + String(value).replace(/'/g, "'\\''") + "'";
}
export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "POST only" });
  let sandbox;
  try {
    const body = req.body || {};
    const files = body.files;
    if (!files || typeof files !== "object" || Array.isArray(files)) return send(res, 400, { error: "files が必要です" });
    const entries = Object.entries(files);
    if (!entries.length || entries.length > MAX_FILES) return send(res, 400, { error: "ファイル数は1〜100件にしてください" });
    let total = 0;
    const safeFiles = entries.map(([name, value]) => {
      const path = safePath(name);
      const content = toBuffer(value);
      if (content.length > MAX_FILE_BYTES) throw new Error(path + " が500KBを超えています");
      total += content.length;
      return { path, content };
    });
    if (total > MAX_TOTAL_BYTES) return send(res, 413, { error: "プロジェクト全体は3MB以内にしてください" });
    const packageEntry = safeFiles.find(file => /(^|\/)package\.json$/i.test(file.path));
    if (!packageEntry) return send(res, 400, { error: "package.json が見つかりません" });
    let packageData;
    try { packageData = JSON.parse(packageEntry.content.toString("utf8")); }
    catch { return send(res, 400, { error: "package.json のJSONを解析できません" }); }
    const allPaths = safeFiles.map(file => file.path);
    const nextProject = !!(packageData.dependencies?.next || packageData.devDependencies?.next || allPaths.some(path => /(^|\/)next\.config\.(js|mjs|ts|cjs)$/i.test(path)));
    const port = 3000;
    const id = "cp-" + randomUUID();
    sandbox = await Sandbox.create({ name: id, teamId: process.env.VERCEL_TEAM_ID || "team_q6z73x6vrTY4W6mHF0BjpWwJ", projectId: process.env.VERCEL_PROJECT_ID, token: process.env.VERCEL_TOKEN || req.headers["x-vercel-oidc-token"], persistent: true, ports: [port], timeout: 2_700_000, resources: { vcpus: 2 }, networkPolicy: "allow-all" });
    const runtimeId = sandbox.name || id;
    await sandbox.writeFiles(safeFiles);
    const script = `#!/usr/bin/env bash
set +e
cd /vercel
STARTED_AT=$(date +%s)
export STARTED_AT
printf '{"state":"installing","stage":"install","startedAt":%s,"message":"依存関係をインストールしています"}' "$STARTED_AT" > .code-preview-status.json
if [ -f package-lock.json ]; then
  echo "[Code Preview] package-lock.json を検出: npm ci で再現可能な依存関係を準備します" > .code-preview-build.log
  npm ci --no-audit --no-fund --progress=false --loglevel=info >> .code-preview-build.log 2>&1
else
  echo "[Code Preview] lockfile がないため npm install を実行します" > .code-preview-build.log
  npm install --no-audit --no-fund --progress=false --loglevel=info >> .code-preview-build.log 2>&1
fi
INSTALL_CODE=$?
if [ "$INSTALL_CODE" -ne 0 ]; then
  printf '{"state":"error","stage":"install","startedAt":%s,"message":"依存関係のインストールに失敗しました。ログの末尾を確認してください"}' "$STARTED_AT" > .code-preview-status.json
  exit "$INSTALL_CODE"
fi
printf '{"state":"starting","stage":"server","startedAt":%s,"message":"依存関係の準備が完了。開発サーバーを起動しています"}' "$STARTED_AT" > .code-preview-status.json
if [ "${nextProject ? "next" : "other"}" = "next" ]; then
  npm run dev -- --hostname 0.0.0.0 --port 3000 >> .code-preview-server.log 2>&1 &
else
  npm run dev -- --host 0.0.0.0 --port 3000 >> .code-preview-server.log 2>&1 &
fi
SERVER_PID=$!
server_process_alive() {
  kill -0 "$SERVER_PID" 2>/dev/null && return 0
  ps -eo args= | grep -Eq '[n]ext dev|[v]ite|[a]stro dev|[n]uxt dev|[r]eact-scripts start|[w]ebpack serve|[p]arcel|node .*server\.(js|mjs|cjs)'
}
write_diagnostics() {
  {
    echo "=== Code Preview startup diagnostics ==="
    date -u
    echo "--- processes ---"
    ps -eo pid,ppid,stat,rss,args
    echo "--- memory ---"
    free -m
    for f in /sys/fs/cgroup/memory.events /sys/fs/cgroup/memory.current /sys/fs/cgroup/memory.max; do
      if [ -r "$f" ]; then echo "--- $f ---"; cat "$f"; fi
    done
    echo "--- recent server log ---"
    tail -n 60 .code-preview-server.log 2>/dev/null
  } > .code-preview-diagnostics.log 2>&1
}
for i in $(seq 1 120); do
  HTTP_CODE=$(curl --max-time 2 -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3000 2>/dev/null || true)
  if [ "$HTTP_CODE" -ge 200 ] 2>/dev/null && [ "$HTTP_CODE" -lt 400 ] 2>/dev/null; then
    printf '{"state":"ready","stage":"ready","startedAt":%s,"message":"プレビューを起動しました"}' "$STARTED_AT" > .code-preview-status.json
    exit 0
  fi
  if grep -Eq 'Module not found:|Failed to compile|Build Error|SyntaxError:|Parsing ecmascript source code failed|Cannot find module' .code-preview-server.log 2>/dev/null; then
    write_diagnostics
    ERROR_DETAILS=$(grep -E 'Module not found:|Failed to compile|Build Error|SyntaxError:|Parsing ecmascript source code failed|Cannot find module' .code-preview-server.log | tail -n 3 | tr '\\n' ' ' | cut -c1-500)
    export ERROR_DETAILS
    python3 -c 'import json,os; print(json.dumps({"state":"error","stage":"compile","startedAt":int(os.environ["STARTED_AT"]),"message":"コンパイルエラー: " + os.environ.get("ERROR_DETAILS", "ソースコードを確認してください")},ensure_ascii=False), file=open(".code-preview-status.json","w"))'
    exit 1
  fi
  if ! server_process_alive; then
    sleep 2
    if ! curl --max-time 2 -fsS http://127.0.0.1:3000 >/dev/null 2>&1 && ! server_process_alive; then
      write_diagnostics
      if grep -Eq '^oom_kill [1-9]' /sys/fs/cgroup/memory.events 2>/dev/null; then
        ERROR_MESSAGE="メモリ不足で開発サーバーが強制終了しました（OOM）。メモリを増やして再試行してください"
        export ERROR_MESSAGE
      else
        ERROR_MESSAGE="開発サーバーのプロセスが終了しました。診断ログを確認してください"
        export ERROR_MESSAGE
      fi
      python3 -c 'import json,os; print(json.dumps({"state":"error","stage":"server","startedAt":int(os.environ["STARTED_AT"]),"message":os.environ["ERROR_MESSAGE"]},ensure_ascii=False), file=open(".code-preview-status.json","w"))'
      exit 1
    fi
  fi
  sleep 1
done
write_diagnostics
printf '{"state":"error","stage":"server","startedAt":%s,"message":"起動がタイムアウトしました。診断ログを確認してください"}' "$STARTED_AT" > .code-preview-status.json
exit 1
`;
    await sandbox.writeFiles([{ path: ".code-preview-start.sh", content: Buffer.from(script), mode: 0o755 }]);
    await sandbox.runCommand({ cmd: "bash", args: ["/vercel/.code-preview-start.sh"], cwd: "/vercel", detached: true });
    return send(res, 200, { id: runtimeId, previewUrl: sandbox.domain(port), state: "installing", message: "依存関係をインストールしています" });
  } catch (error) {
    if (sandbox) { try { await sandbox.stop(); } catch {} }
    return send(res, 500, { error: error?.message || "リモート実行環境を起動できませんでした" });
  }
}