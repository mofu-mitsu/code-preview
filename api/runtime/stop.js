import { Sandbox } from "@vercel/sandbox";

export const config = { maxDuration: 15 };
function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}
export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "POST only" });
  const id = String(req.body?.id || "");
  if (!/^cp-[0-9a-f-]{36}$/.test(id)) return send(res, 400, { error: "不正なセッションIDです" });
  try {
    const sandbox = await Sandbox.get({ name: id });
    await sandbox.stop();
    return send(res, 200, { stopped: true });
  } catch (error) {
    return send(res, 200, { stopped: true, note: error?.message || "already stopped" });
  }
}