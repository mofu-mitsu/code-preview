import { Sandbox } from "@vercel/sandbox";

export const config = { maxDuration: 20 };
function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}
export default async function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { error: "GET only" });
  const id = String(req.query?.id || "");
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) return send(res, 400, { error: "不正なセッションIDです" });
  try {
    const sandbox = await Sandbox.get({ name: id });
    const result = await sandbox.runCommand({
      cmd: "bash",
      args: ["-c", "cat /vercel/.code-preview-status.json 2>/dev/null || printf '{}'; echo __LOG__; tail -n 18 /vercel/.code-preview-build.log /vercel/.code-preview-server.log /vercel/.code-preview-install.log /vercel/.code-preview-diagnostics.log 2>/dev/null; echo __RESULT__; cat /vercel/.code-preview-result.json 2>/dev/null || true"],
      cwd: "/vercel"
    });
    const output = await result.stdout();
    const parts = output.split("__LOG__");
    const resultParts = (parts[1] || "").split("__RESULT__");
    let state = { state: "starting", message: "起動状態を確認中です" };
    let execution = null;
    try { state = JSON.parse(parts[0].trim()); } catch {}
    try { execution = JSON.parse((resultParts[1] || "").trim()); } catch {}
    const payload = { ...state, logs: (resultParts[0] || "").trim().slice(-8000) };
    if (state.startedAt) payload.elapsedSeconds = Math.max(0, Math.floor(Date.now() / 1000 - Number(state.startedAt)));
    if (execution) payload.result = execution;
    if (state.state === "done") { try { await sandbox.stop(); } catch {} }
    return send(res, 200, payload);
  } catch (error) {
    const code = error?.status ?? error?.statusCode ?? error?.response?.status;
    if (code === 404 || /status code 404/i.test(error?.message || "")) {
      return send(res, 200, { state: "starting", message: "ランタイム登録を確認中です。再接続しています…" });
    }
    return send(res, 200, { state: "error", message: "実行環境に接続できません: " + (error?.message || "unknown") });
  }
}