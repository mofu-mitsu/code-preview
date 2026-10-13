package handler

import (
	"encoding/json"
	"net/http"
	"path"
	"strings"
)

const (
	maxManifestBytes = 256 * 1024
	maxFiles         = 100
	maxFileBytes     = 500_000
	maxTotalBytes    = 1_800_000
)

type fileEntry struct {
	Path  string `json:"path"`
	Bytes int64  `json:"bytes"`
}

type requestBody struct {
	Files []fileEntry `json:"files"`
}

type responseBody struct {
	OK         bool   `json:"ok"`
	Runtime    string `json:"runtime,omitempty"`
	FileCount  int    `json:"fileCount,omitempty"`
	TotalBytes int64  `json:"totalBytes,omitempty"`
	Error      string `json:"error,omitempty"`
	Message    string `json:"message,omitempty"`
}

func writeJSON(w http.ResponseWriter, status int, body responseBody) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

// Handler validates a lightweight project manifest before the larger source payload
// is sent to the JavaScript Sandbox API. This keeps oversized projects from failing
// later with an opaque Vercel 413 response.
func Handler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		writeJSON(w, http.StatusMethodNotAllowed, responseBody{Error: "POST only"})
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxManifestBytes)
	defer r.Body.Close()

	var input requestBody
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, responseBody{Error: "プロジェクト情報を読み取れませんでした"})
		return
	}
	if len(input.Files) == 0 || len(input.Files) > maxFiles {
		writeJSON(w, http.StatusBadRequest, responseBody{Error: "ファイル数は1〜100件にしてください"})
		return
	}

	var total int64
	hasPackageJSON := false
	seen := make(map[string]struct{}, len(input.Files))
	for _, file := range input.Files {
		name := strings.ReplaceAll(file.Path, "\\", "/")
		clean := path.Clean(name)
		if name == "" || strings.HasPrefix(name, "/") || clean == "." || clean == ".." ||
			strings.HasPrefix(clean, "../") || strings.ContainsRune(name, 0) {
			writeJSON(w, http.StatusBadRequest, responseBody{Error: "不正なファイルパス: " + file.Path})
			return
		}
		if _, exists := seen[clean]; exists {
			writeJSON(w, http.StatusBadRequest, responseBody{Error: "ファイルパスが重複しています: " + clean})
			return
		}
		seen[clean] = struct{}{}

		if file.Bytes < 0 || file.Bytes > maxFileBytes {
			writeJSON(w, http.StatusRequestEntityTooLarge, responseBody{Error: clean + " は500KBを超えています"})
			return
		}
		total += file.Bytes
		if total > maxTotalBytes {
			writeJSON(w, http.StatusRequestEntityTooLarge, responseBody{Error: "プロジェクトのテキスト合計は1.8MB以内にしてください"})
			return
		}
		if strings.EqualFold(path.Base(clean), "package.json") {
			hasPackageJSON = true
		}
	}
	if !hasPackageJSON {
		writeJSON(w, http.StatusBadRequest, responseBody{Error: "package.json が見つかりません"})
		return
	}

	writeJSON(w, http.StatusOK, responseBody{
		OK:         true,
		Runtime:    "go",
		FileCount:  len(input.Files),
		TotalBytes: total,
		Message:    "プロジェクトの構成とサイズを確認しました",
	})
}
