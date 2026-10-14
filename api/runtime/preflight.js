export const config = { maxDuration: 10 };

const MAX_FILES = 200;
const MAX_TOTAL_BYTES = 3_000_000;

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

export default function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "POST only" });
  try {
    const files = req.body?.files;
    if (!Array.isArray(files)) return send(res, 400, { error: "files の一覧が必要です" });
    if (!files.length || files.length > MAX_FILES) {
      return send(res, 400, { error: "ファイル数は1〜200件にしてください" });
    }
    let totalBytes = 0;
    for (const file of files) {
      if (!file || typeof file.path !== "string" || !file.path.trim()) {
        return send(res, 400, { error: "ファイルパスが不正です" });
      }
      const bytes = Number(file.bytes);
      if (!Number.isFinite(bytes) || bytes < 0) {
        return send(res, 400, { error: "ファイルサイズが不正です: " + file.path });
      }
      totalBytes += bytes;
    }
    if (totalBytes > MAX_TOTAL_BYTES) {
      return send(res, 413, { error: "プロジェクト全体は3MB以内にしてください" });
    }
    return send(res, 200, { ok: true, fileCount: files.length, totalBytes });
  } catch (error) {
    return send(res, 400, { error: error?.message || "事前検証に失敗しました" });
  }
}
