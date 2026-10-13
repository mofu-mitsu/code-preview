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
  if (!/^cp-[0-9a-f-]{36}$/.test(id)) return send(res, 400, { error: "不正なセッションIDです" });
  try {
    const sandbox = await Sandbox.get({ name: id });
    const result = await sandbox.runCommand("bash", ["-c", "cat /vercel/sandbox/.code-preview-status.json 2>/dev/null || echo '{\\"state\\":\\"starting\\",\\"message\\":\\"起動状態を確認中です\\"}; echo __LOG__; tail -n 18 /vercel/sandbox/.code-preview-build.log /vercel/sandbox/.code-preview-server.log 2>/dev/null"], { cwd: "/vercel/sandbox" });
    const output = await result.stdout();
    const parts = output.split("__LOG__");
    let state = { state: "starting", message: "起動状態を確認中です" };
    try { state = JSON.parse(parts[0].trim()); } catch {}
    return send(res, 200, { ...state, logs: (parts[1] || "").trim().slice(-8000) });
  } catch (error) {
    return send(res, 200, { state: "error", message: "実行環境に接続できません: " + (error?.message || "unknown") });
  }
}