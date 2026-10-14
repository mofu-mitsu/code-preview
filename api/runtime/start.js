import { randomUUID } from "node:crypto";
import { Sandbox } from "@vercel/sandbox";

export const config = { maxDuration: 30 };

const MAX_FILES = 100;
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
    sandbox = await Sandbox.create({ name: id, teamId: process.env.VERCEL_TEAM_ID || "team_q6z73x6vrTY4W6mHF0BjpWwJ", projectId: process.env.VERCEL_PROJECT_ID, token: process.env.VERCEL_TOKEN || req.headers["x-vercel-oidc-token"], persistent: true, ports: [port], timeout: 2_700_000, resources: { vcpus: 1 }, networkPolicy: "allow-all" });
    const runtimeId = sandbox.name || id;
    await sandbox.writeFiles(safeFiles);
    const script = `#!/usr/bin/env bash
set +e
cd /vercel
STARTED_AT=$(date +%s)
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
for i in $(seq 1 120); do
  if curl -fsS http://127.0.0.1:3000 >/dev/null 2>&1; then
    printf '{"state":"ready","stage":"ready","startedAt":%s,"message":"プレビューを起動しました"}' "$STARTED_AT" > .code-preview-status.json
    exit 0
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    printf '{"state":"error","stage":"server","startedAt":%s,"message":"開発サーバーが終了しました"}' "$STARTED_AT" > .code-preview-status.json
    exit 1
  fi
  sleep 1
done
printf '{"state":"error","stage":"server","startedAt":%s,"message":"起動がタイムアウトしました"}' "$STARTED_AT" > .code-preview-status.json
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