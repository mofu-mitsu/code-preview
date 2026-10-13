import { Sandbox } from "@vercel/sandbox";

export const config = { maxDuration: 300 };
const MAX_FILES = 100;
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
export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "POST only" });
  let sandbox;
  try {
    const body = req.body || {};
    const language = String(body.language || "");
    const files = body.files;
    if (!files || typeof files !== "object" || Array.isArray(files)) return send(res, 400, { error: "files が必要です" });
    const entries = Object.entries(files);
    if (!entries.length || entries.length > MAX_FILES) return send(res, 400, { error: "ファイル数は1〜100件にしてください" });
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
    const root = "/vercel/sandbox";
    const has = suffix => paths.some(path => path.toLowerCase().endsWith(suffix.toLowerCase()));
    let command = "", args = [], install = "";
    if (language === "python") { command = "python3"; args = [active]; }
    else if (language === "php") { install = "apt-get update -qq && apt-get install -y -qq php-cli"; command = "php"; args = [active]; }
    else if (language === "ruby") { install = "apt-get update -qq && apt-get install -y -qq ruby"; command = "ruby"; args = [active]; }
    else if (language === "go") {
      install = "apt-get update -qq && apt-get install -y -qq golang-go";
      command = "bash"; args = ["-lc", has("go.mod") ? "go run ." : "go run " + JSON.stringify(active)];
    } else if (language === "rust") {
      install = "apt-get update -qq && apt-get install -y -qq rustc cargo";
      command = "bash"; args = ["-lc", has("cargo.toml") ? "cargo run" : "rustc " + JSON.stringify(active) + " -o /tmp/code-preview-rust && /tmp/code-preview-rust"];
    } else if (language === "c" || language === "cpp") {
      install = "apt-get update -qq && apt-get install -y -qq build-essential";
      const compiler = language === "c" ? "gcc" : "g++";
      command = "bash"; args = ["-lc", compiler + " " + JSON.stringify(active) + " -o /tmp/code-preview-bin && /tmp/code-preview-bin"];
    } else return send(res, 400, { error: "この言語のリモート実行には未対応です: " + language });
    sandbox = await Sandbox.create({ persistent: false, timeout: 280_000, resources: { vcpus: 1 }, networkPolicy: "allow-all" });
    await sandbox.writeFiles(safeFiles);
    if (install) {
      const installed = await sandbox.runCommand({ cmd: "bash", args: ["-lc", install], sudo: true, cwd: root });
      if (installed.exitCode !== 0) return send(res, 200, { exitCode: installed.exitCode, stdout: "", stderr: (await installed.stderr()).slice(-12000) || "ランタイムのインストールに失敗しました" });
    }
    const result = await sandbox.runCommand({ cmd: command, args, cwd: root });
    return send(res, 200, { exitCode: result.exitCode, stdout: (await result.stdout()).slice(-12000), stderr: (await result.stderr()).slice(-12000) });
  } catch (error) {
    return send(res, 500, { error: error?.message || "コードを実行できませんでした" });
  } finally {
    if (sandbox) { try { await sandbox.stop(); } catch {} }
  }
}