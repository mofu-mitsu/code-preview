import { randomUUID } from "node:crypto";
import { Sandbox } from "@vercel/sandbox";

export const config = { maxDuration: 30 };
const MAX_FILES = 200;
const MAX_TOTAL_BYTES = 2_000_000;
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
function quote(value) {
  return "'" + String(value).replace(/'/g, "'\\''") + "'";
}
export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "POST only" });
  let sandbox;
  try {
    const body = req.body || {};
    const language = String(body.language || "");
    const files = body.files;
    if (!files || typeof files !== "object" || Array.isArray(files)) return send(res, 400, { error: "files が必要です" });
    const entries = Object.entries(files);
    if (!entries.length || entries.length > MAX_FILES) return send(res, 400, { error: "ファイル数は1〜200件にしてください" });
    let total = 0;
    const safeFiles = entries.map(([name, value]) => {
      const path = safePath(name);
      const content = toBuffer(value);
      total += content.length;
      return { path, content };
    });
    if (total > MAX_TOTAL_BYTES) return send(res, 413, { error: "プロジェクト全体は2MB以内にしてください" });
    const paths = safeFiles.map(file => file.path);
    const active = String(body.activePath || paths[0]);
    if (!paths.includes(active)) return send(res, 400, { error: "実行対象ファイルが見つかりません" });
    const has = suffix => paths.some(path => path.toLowerCase().endsWith(suffix.toLowerCase()));
    let install = "", command = "";
    if (language === "python") command = "python3 " + quote(active);
    else if (language === "php") { install = "sudo dnf install -y php-cli"; command = "php " + quote(active); }
    else if (language === "ruby") { install = "sudo dnf install -y ruby"; command = "ruby " + quote(active); }
    else if (language === "go") {
      install = "sudo dnf install -y golang";
      command = has("go.mod") ? "go run ." : "go run " + quote(active);
    } else if (language === "rust") {
      install = "sudo dnf install -y rust cargo";
      command = has("cargo.toml") ? "cargo run" : "rustc " + quote(active) + " -o /tmp/code-preview-rust && /tmp/code-preview-rust";
    } else if (language === "c" || language === "cpp") {
      install = "sudo dnf install -y gcc gcc-c++";
      command = (language === "c" ? "gcc " : "g++ ") + quote(active) + " -o /tmp/code-preview-bin && /tmp/code-preview-bin";
    } else return send(res, 400, { error: "この言語のリモート実行には未対応です: " + language });

    const id = "cp-" + randomUUID();
    sandbox = await Sandbox.create({ name: id, teamId: process.env.VERCEL_TEAM_ID || "team_q6z73x6vrTY4W6mHF0BjpWwJ", projectId: process.env.VERCEL_PROJECT_ID, token: process.env.VERCEL_TOKEN || req.headers["x-vercel-oidc-token"], persistent: true, timeout: 280_000, resources: { vcpus: 1 }, networkPolicy: "allow-all" });
    await sandbox.writeFiles(safeFiles);
    const script = `#!/usr/bin/env bash
cd /vercel/sandbox
printf '%s' '{"state":"running","message":"隔離環境でコードを実行しています"}' > .code-preview-status.json
: > .code-preview-stdout.txt
: > .code-preview-stderr.txt
${install ? install + " > .code-preview-install.log 2>&1\nINSTALL_CODE=$?\nif [ \"$INSTALL_CODE\" -ne 0 ]; then cp .code-preview-install.log .code-preview-stderr.txt; printf '%s' '{\"state\":\"done\",\"exitCode\":$INSTALL_CODE}' > /tmp/cp-result.tmp; fi\nif [ \"$INSTALL_CODE\" -ne 0 ]; then RUN_CODE=$INSTALL_CODE; else\n" : ""}
${command} > .code-preview-stdout.txt 2> .code-preview-stderr.txt
RUN_CODE=$?
${install ? "fi\n" : ""}
printf '%s' "$RUN_CODE" > .code-preview-exit-code.txt
python3 -c 'import json,pathlib; p=pathlib.Path("/vercel/sandbox"); code=int((p/".code-preview-exit-code.txt").read_text()); data={"state":"done","message":"実行が完了しました","exitCode":code,"stdout":(p/".code-preview-stdout.txt").read_text(errors="replace")[-12000:],"stderr":(p/".code-preview-stderr.txt").read_text(errors="replace")[-12000:]}; (p/".code-preview-result.json").write_text(json.dumps(data,ensure_ascii=False)); (p/".code-preview-status.json").write_text(json.dumps({"state":"done","message":"実行が完了しました"},ensure_ascii=False))'
`;
    await sandbox.writeFiles([{ path: ".code-preview-execute.sh", content: Buffer.from(script), mode: 0o755 }]);
    await sandbox.runCommand({ cmd: "bash", args: ["/vercel/sandbox/.code-preview-execute.sh"], cwd: "/vercel/sandbox", detached: true });
    return send(res, 200, { id, state: "running", message: "隔離環境でコードを実行しています" });
  } catch (error) {
    if (sandbox) { try { await sandbox.stop(); } catch {} }
    return send(res, 500, { error: error?.message || "コードを実行できませんでした" });
  }
}