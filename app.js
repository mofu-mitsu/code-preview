const defaults = {
  html: '<!doctype html>\n<html lang="ja">\n<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="style.css"></head>\n<body><main><h1>Hello, Code Preview!</h1><p>左のファイル一覧からファイルを切り替えられます。</p></main><script src="app.js"></script></body>\n</html>',
  css: 'body { font-family: system-ui; display: grid; place-items: center; height: 100vh; margin: 0; }\n.card { padding: 24px; border-radius: 16px; background: #f4eaff; }',
  javascript: 'document.body.innerHTML = \'<div class="card">Hello from JavaScript!</div>\';\ndocument.body.style.cssText = "font-family:system-ui;display:grid;place-items:center;height:100vh";',
  jsx: 'function App() {\n  return <main style={{fontFamily:"system-ui", padding:40}}>\n    <h1>Hello JSX 👋</h1><p>React is running in your browser.</p>\n  </main>;\n}\nReactDOM.createRoot(document.getElementById("root")).render(<App />);',
  tsx: 'type Props = { name: string };\nfunction App({ name }: Props) {\n  return <main style={{fontFamily:"system-ui", padding:40}}><h1>Hello, {name}!</h1><p>TSX preview without a build server.</p></main>;\n}\nReactDOM.createRoot(document.getElementById("root")).render(<App name="Mitsuki" />);',
  php: '<?php\necho "Hello from PHP!";\n',
  python: 'print("Hello from Python!")\n',
  c: '#include <stdio.h>\nint main(void) { printf("Hello from C!\\n"); return 0; }\n',
  cpp: '#include <iostream>\nint main() { std::cout << "Hello from C++!\\n"; return 0; }\n',
  csharp: 'using System;\nclass Program { static void Main() { Console.WriteLine("Hello from C#!"); } }\n',
  ruby: 'puts "Hello from Ruby!"\n',
  go: 'package main\nimport "fmt"\nfunc main() { fmt.Println("Hello from Go!") }\n',
  rust: 'fn main() { println!("Hello from Rust!"); }\n'
};
const TEXT_EXT = /\.(html?|css|[cm]?js|jsx|tsx?|json|md|txt|svg|xml|ya?ml|toml|php|py|go|rs|rb|sh|sql|vue|svelte|c|h|hpp|cc|cpp|cxx|cs|java|kt|swift|dart|lua|r|pl|ex|exs|scala|clj)$/i;
const MIME = {png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",gif:"image/gif",webp:"image/webp",svg:"image/svg+xml",ico:"image/x-icon",woff:"font/woff",woff2:"font/woff2",ttf:"font/ttf",mp3:"audio/mpeg",mp4:"video/mp4"};
let editor, activePath = "index.html", projectFiles = {}, explicitFolders = new Set(), collapsedFolders = new Set(), currentPreview = "", sourceKind = "sample", githubMeta = null, lastGithubUrl = "", consoleFontSize = 11;
const consoleCounts = {error:0, warn:0, info:0, log:0};
const language = document.getElementById("language");
const status = document.getElementById("status");
const consoleEl = document.getElementById("console");
const frame = document.getElementById("preview");
const fileList = document.getElementById("file-list");
const projectStatus = document.getElementById("project-status");
const activeLabel = document.getElementById("active-file-label");

function setStatus(message) { projectStatus.textContent = message; }
function confirmAction(message, title = "確認") {
  const dialog = document.getElementById("confirm-dialog");
  if (!dialog) return Promise.resolve(true);
  document.getElementById("confirm-dialog-title").textContent = title;
  document.getElementById("confirm-dialog-message").textContent = message;
  dialog.showModal();
  return new Promise(resolve => {
    const yes = document.getElementById("confirm-dialog-yes");
    const no = document.getElementById("confirm-dialog-no");
    const cleanup = value => {
      yes.removeEventListener("click", onYes);
      no.removeEventListener("click", onNo);
      dialog.removeEventListener("close", onClose);
      if (dialog.open) dialog.close();
      resolve(value);
    };
    const onYes = () => cleanup(true);
    const onNo = () => cleanup(false);
    const onClose = () => cleanup(false);
    yes.addEventListener("click", onYes);
    no.addEventListener("click", onNo);
    dialog.addEventListener("close", onClose);
  });
}
function toast(message, kind = "info") {
  const region = document.getElementById("toast-region");
  if (!region) return;
  const node = document.createElement("div");
  node.className = "toast toast-" + kind;
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.innerHTML = kind === "error" ? '<path d="M12 3 22 21H2L12 3Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 9v5m0 3h.01" stroke="currentColor" stroke-width="1.8"/>' : '<path d="m5 12 4 4L19 6" fill="none" stroke="currentColor" stroke-width="2"/>';
  const textNode = document.createElement("span"); textNode.textContent = message;
  node.append(icon, textNode); region.appendChild(node);
  requestAnimationFrame(() => node.classList.add("show"));
  setTimeout(() => { node.classList.remove("show"); setTimeout(() => node.remove(), 250); }, 3200);
}
function updateConsoleSummary() {
  const errors = document.getElementById("console-error-count-value");
  const warnings = document.getElementById("console-warning-count-value");
  const total = document.getElementById("console-total-count");
  if (errors) { errors.textContent = String(consoleCounts.error); errors.parentElement.classList.toggle("has-count", consoleCounts.error > 0); }
  if (warnings) { warnings.textContent = String(consoleCounts.warn); warnings.parentElement.classList.toggle("has-count", consoleCounts.warn > 0); }
  if (total) total.textContent = String(consoleCounts.error + consoleCounts.warn + consoleCounts.info + consoleCounts.log);
}
function clearConsole() {
  consoleEl.textContent = "";
  Object.keys(consoleCounts).forEach(key => consoleCounts[key] = 0);
  updateConsoleSummary();
}
function log(message, type) {
  const kind = String(type || "log").toLowerCase();
  if (kind === "error") consoleCounts.error++;
  else if (kind === "warn" || kind === "warning") consoleCounts.warn++;
  else if (kind === "info" || kind === "debug") consoleCounts.info++;
  else consoleCounts.log++;
  const line = document.createElement("div");
  line.className = "console-line console-" + (kind === "warning" ? "warn" : kind);
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  if (kind === "error") icon.innerHTML = '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="m9 9 6 6m0-6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
  else if (kind === "warn" || kind === "warning") icon.innerHTML = '<path d="M12 3 22 21H2L12 3Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 9v5m0 3h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
  else if (kind === "info") icon.innerHTML = '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 11v5m0-8h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
  else icon.innerHTML = '<path d="M5 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
  icon.classList.add("console-line-icon");
  const text = document.createElement("span");
  const displayMessage = (type ? "[" + type + "] " : "") + String(message);
  const urlPattern = /https:\/\/[^\s<>"']+/g;
  let cursor = 0, match;
  while ((match = urlPattern.exec(displayMessage)) !== null) {
    let urlText = match[0];
    let trailing = "";
    while (/[),.!?;:]$/.test(urlText)) {
      trailing = urlText.slice(-1) + trailing;
      urlText = urlText.slice(0, -1);
    }
    if (match.index > cursor) text.appendChild(document.createTextNode(displayMessage.slice(cursor, match.index)));
    try {
      const parsed = new URL(urlText);
      if (parsed.protocol === "https:") {
        const anchor = document.createElement("a");
        anchor.href = parsed.href;
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        anchor.textContent = urlText;
        anchor.className = "console-link";
        text.appendChild(anchor);
      } else {
        text.appendChild(document.createTextNode(urlText));
      }
    } catch (_) {
      text.appendChild(document.createTextNode(urlText));
    }
    text.appendChild(document.createTextNode(trailing));
    cursor = match.index + match[0].length;
  }
  if (cursor < displayMessage.length) text.appendChild(document.createTextNode(displayMessage.slice(cursor)));
  line.append(icon, text);
  consoleEl.appendChild(line);
  consoleEl.scrollTop = consoleEl.scrollHeight;
  updateConsoleSummary();
}
function extension(path) { return (path.split(".").pop() || "").toLowerCase(); }
function editorLanguage(path) {
  const ext = extension(path);
  return ({htm:"html",html:"html",css:"css",js:"javascript",mjs:"javascript",cjs:"javascript",jsx:"javascript",ts:"typescript",tsx:"typescript",json:"json",md:"markdown",py:"python",php:"php",go:"go",rs:"rust",rb:"ruby",sql:"sql",xml:"xml",svg:"xml",yml:"yaml",yaml:"yaml",c:"c",h:"c",hpp:"cpp",cc:"cpp",cpp:"cpp",cxx:"cpp",cs:"csharp",java:"java",kt:"kotlin",swift:"swift",dart:"dart",lua:"lua",r:"r",pl:"perl",ex:"elixir",exs:"elixir",scala:"scala",clj:"clojure"})[ext] || "plaintext";
}
function renderFileList() {
  fileList.textContent = "";
  const paths = Object.keys(projectFiles).sort((a,b) => a.localeCompare(b));
  const tree = { folders: new Map(), files: [] };
  const allFolders = new Set(explicitFolders);
  paths.forEach(path => {
    const parts = path.split("/"); let node = tree;
    for (let i = 0; i < parts.length - 1; i++) {
      const folderPath = parts.slice(0, i + 1).join("/"); allFolders.add(folderPath);
      if (!node.folders.has(parts[i])) node.folders.set(parts[i], { folders: new Map(), files: [], path: folderPath });
      node = node.folders.get(parts[i]);
    }
    node.files.push(path);
  });
  allFolders.forEach(folderPath => {
    let node = tree; const parts = folderPath.split("/");
    parts.forEach((part, i) => {
      const p = parts.slice(0, i + 1).join("/");
      if (!node.folders.has(part)) node.folders.set(part, { folders: new Map(), files: [], path: p });
      node = node.folders.get(part);
    });
  });
  function renderNode(node, container, depth = 0) {
    [...node.folders.entries()].sort((a,b)=>a[0].localeCompare(b[0])).forEach(([name, folder]) => {
      const row = document.createElement("div"); row.className = "folder-row"; row.style.paddingLeft = (6 + depth * 12) + "px";
      const toggle = document.createElement("button"); toggle.type = "button"; toggle.className = "folder-toggle";
      toggle.textContent = (collapsedFolders.has(folder.path) ? "▸ " : "▾ ") + "📁 " + name; toggle.title = folder.path;
      toggle.addEventListener("click", () => { if (collapsedFolders.has(folder.path)) collapsedFolders.delete(folder.path); else collapsedFolders.add(folder.path); renderFileList(); });
      const remove = document.createElement("button"); remove.type = "button"; remove.className = "file-delete"; remove.textContent = "×"; remove.title = "フォルダと中のファイルを削除";
      remove.addEventListener("click", async event => {
        event.stopPropagation();
        const count = Object.keys(projectFiles).filter(p => p.startsWith(folder.path + "/")).length;
        if (!(await confirmAction("フォルダ「" + folder.path + "」" + (count ? "と中の " + count + " ファイル" : "") + "を削除しますか？", "フォルダを削除"))) return;
        syncEditor();
        Object.keys(projectFiles).filter(p => p.startsWith(folder.path + "/")).forEach(p => delete projectFiles[p]);
        [...explicitFolders].filter(p => p === folder.path || p.startsWith(folder.path + "/")).forEach(p => explicitFolders.delete(p));
        [...collapsedFolders].filter(p => p === folder.path || p.startsWith(folder.path + "/")).forEach(p => collapsedFolders.delete(p));
        if (!projectFiles[activePath]) { activePath = Object.keys(projectFiles)[0] || "index.html"; if (projectFiles[activePath] === undefined) projectFiles[activePath] = ""; if (editor) { editor.setValue(projectFiles[activePath]); monaco.editor.setModelLanguage(editor.getModel(), editorLanguage(activePath)); } activeLabel.textContent = activePath; }
        renderFileList(); setStatus("フォルダを削除しました"); run();
      });
      row.append(toggle, remove); container.appendChild(row);
      if (!collapsedFolders.has(folder.path)) renderNode(folder, container, depth + 1);
    });
    node.files.sort((a,b)=>a.localeCompare(b)).forEach(path => {
      const row = document.createElement("div"); row.className = "file-row"; row.style.paddingLeft = (8 + depth * 12) + "px";
      const button = document.createElement("button"); button.type = "button"; button.className = "file-item" + (path === activePath ? " active" : ""); button.title = path;
      const icon = document.createElement("span"); icon.className = "file-icon"; icon.textContent = ({html:"<>",css:"#",js:"JS",jsx:"⚛",tsx:"TS",json:"{}",png:"▧",jpg:"▧",svg:"◇",php:"PHP",go:"GO",rs:"RS"})[extension(path)] || "·";
      const name = document.createElement("span"); name.className = "file-name"; name.textContent = path.split("/").pop();
      button.append(icon,name); button.addEventListener("click", () => openFile(path));
      const remove = document.createElement("button"); remove.type = "button"; remove.className = "file-delete"; remove.textContent = "×"; remove.title = "ファイルを削除";
      remove.addEventListener("click", async event => {
        event.stopPropagation();
        if (!(await confirmAction("ファイル「" + path + "」を削除しますか？", "ファイルを削除"))) return;
        syncEditor(); delete projectFiles[path];
        if (activePath === path) { activePath = Object.keys(projectFiles)[0] || "index.html"; if (projectFiles[activePath] === undefined) projectFiles[activePath] = ""; if (editor) { editor.setValue(projectFiles[activePath]); monaco.editor.setModelLanguage(editor.getModel(), editorLanguage(activePath)); } activeLabel.textContent = activePath; }
        renderFileList(); setStatus("ファイルを削除しました"); run();
      });
      row.append(button,remove); container.appendChild(row);
    });
  }
  if (!paths.length && !explicitFolders.size) { fileList.innerHTML = '<div class="empty-files">ファイルがありません。<br>GitHub・ZIP・フォルダから読み込むか、＋ 追加から作成できます。</div>'; return; }
  renderNode(tree, fileList);
}
function syncEditor() {
  if (!editor || projectFiles[activePath] === undefined) return;
  projectFiles[activePath] = editor.getValue();
}
function openFile(path) {
  syncEditor(); activePath = path;
  if (!projectFiles[path]) projectFiles[path] = "";
  if (editor) {
    editor.setValue(projectFiles[path]);
    monaco.editor.setModelLanguage(editor.getModel(), editorLanguage(path));
  }
  activeLabel.textContent = path;
  renderFileList();
}
function setProject(files, label) {
  projectFiles = files; explicitFolders = new Set(); collapsedFolders = new Set(); hideImportProgress(); if (sourceKind !== "github") sourceKind = "project";
  const paths = Object.keys(files);
  activePath = paths.includes("index.html") ? "index.html" : paths.find(p => /(^|\/)index\.html?$/i.test(p)) || paths.find(p => /\.(html?)$/i.test(p)) || paths[0] || "index.html";
  if (!projectFiles[activePath]) projectFiles[activePath] = "";
  if (editor) {
    editor.setValue(projectFiles[activePath]);
    monaco.editor.setModelLanguage(editor.getModel(), editorLanguage(activePath));
  }
  activeLabel.textContent = activePath;
  renderFileList(); setStatus(label + " · " + Object.keys(projectFiles).length + " files");
  run();
}
function showImportProgress(total = 0, current = 0, path = "") {
  const panel = document.getElementById("preview-import-progress");
  if (!panel) return;
  panel.hidden = false;
  const label = document.getElementById("preview-import-label");
  const count = document.getElementById("preview-import-count");
  const bar = document.getElementById("preview-import-bar");
  const percent = total ? Math.round(current / total * 100) : 0;
  label.textContent = total ? "GitHub ファイル取得中" + (path ? " · " + path : "") : "GitHub のファイル一覧を確認中…";
  count.textContent = total ? current + " / " + total + " 件 · " + percent + "%" : "準備中…";
  bar.style.width = percent + "%";
}
function hideImportProgress() {
  const panel = document.getElementById("preview-import-progress");
  if (panel) panel.hidden = true;
}
function resetSample() {
  setProject({"index.html":defaults.html,"style.css":defaults.css,"app.js":defaults.javascript}, "サンプル");
  sourceKind = "sample";
}
if (!window.__codePreviewMonacoStarted) {
  window.__codePreviewMonacoStarted = true;
  require.config({paths:{vs:"https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs"}});
  require(["vs/editor/editor.main"], () => {
  editor = monaco.editor.create(document.getElementById("editor"), {
    value: defaults.html, language:"html", theme:"vs", automaticLayout:true,
    minimap:{enabled:false}, fontSize:13, tabSize:2, padding:{top:12}, wordWrap:"on"
  });
  editor.onDidChangeModelContent(() => {
    if (!projectFiles[activePath]) return;
    projectFiles[activePath] = editor.getValue();
    status.textContent = "Modified";
  });
  resetSample();
  });
}
language.addEventListener("change", () => {
  const lang = language.value;
  const file = ({html:"index.html",css:"style.css",javascript:"app.js",jsx:"App.jsx",tsx:"App.tsx",php:"index.php",python:"main.py",c:"main.c",cpp:"main.cpp",csharp:"Program.cs",ruby:"main.rb",go:"main.go",rust:"main.rs"})[lang];
  if (projectFiles[file] !== undefined) { openFile(file); return; }
  projectFiles[file] = defaults[lang]; openFile(file); run();
});
document.getElementById("run").addEventListener("click", run);
document.getElementById("undo").addEventListener("click", () => { if (!editor) return; editor.focus(); editor.trigger("toolbar", "undo", null); toast("編集を元に戻しました", "info"); });
document.getElementById("redo").addEventListener("click", () => { if (!editor) return; editor.focus(); editor.trigger("toolbar", "redo", null); toast("編集をやり直しました", "info"); });
document.getElementById("refresh").addEventListener("click", async () => {
  if (sourceKind === "github" && lastGithubUrl) {
    if (!(await confirmAction("GitHub からファイル一覧と内容を再取得します。エディタ内の変更は破棄されます。続けますか？", "GitHubから再読み込み"))) return;
    document.getElementById("github-url").value = lastGithubUrl;
    document.getElementById("github-form").requestSubmit();
  } else run();
});
document.getElementById("reset").addEventListener("click", async () => {
  if (!(await confirmAction("エディタ内の全ファイルを削除します。よろしいですか？", "すべてのファイルを削除"))) return;
  projectFiles = {}; activePath = "index.html"; sourceKind = "empty"; githubMeta = null; lastGithubUrl = ""; currentPreview = "";
  if (editor) { editor.setValue(""); monaco.editor.setModelLanguage(editor.getModel(), "html"); }
  activeLabel.textContent = "ファイルなし";
  fileList.innerHTML = '<div class="empty-files">ファイルはありません。<br>GitHub・ZIP・フォルダから読み込むか、＋ファイルで追加してください。</div>';
  frame.srcdoc = '<!doctype html><html lang="ja"><body style="font:14px system-ui;color:#9a8da2;display:grid;place-items:center;height:100vh;margin:0"><p>プレビューするファイルがありません</p></body></html>';
  setStatus("全ファイルを削除しました"); status.textContent = "Empty"; clearConsole(); toast("エディタ内のファイルをすべて削除しました", "success");
});
const consolePanel = document.getElementById("console-panel");
document.getElementById("console-toggle").addEventListener("click", () => {
  const willOpen = consolePanel.hidden;
  consolePanel.hidden = !willOpen;
  document.getElementById("console-resizer").hidden = !willOpen;
  document.getElementById("console-toggle").setAttribute("aria-expanded", String(willOpen));
  document.getElementById("console-toggle").classList.toggle("active", willOpen);
});
const aboutDialog = document.getElementById("about-dialog");
document.getElementById("about-open").addEventListener("click", () => aboutDialog.showModal());
aboutDialog.addEventListener("click", event => { if (event.target === aboutDialog) aboutDialog.close(); });
document.getElementById("about-close").addEventListener("click", () => aboutDialog.close());
document.getElementById("clear-console").addEventListener("click", clearConsole);
document.getElementById("console-details").addEventListener("click", () => { consolePanel.hidden = false; document.getElementById("console-resizer").hidden = false; document.getElementById("console-toggle").setAttribute("aria-expanded", "true"); document.getElementById("console-toggle").classList.add("active"); consoleEl.scrollTop = consoleEl.scrollHeight; });
document.getElementById("console-smaller").addEventListener("click", () => { consoleFontSize = Math.max(8, consoleFontSize - 1); consoleEl.style.fontSize = consoleFontSize + "px"; });
document.getElementById("console-larger").addEventListener("click", () => { consoleFontSize = Math.min(20, consoleFontSize + 1); consoleEl.style.fontSize = consoleFontSize + "px"; });

const consoleResizer = document.getElementById("console-resizer");
function setConsoleHeight(height) {
  const min = 90;
  const max = Math.max(min, Math.floor(window.innerHeight * 0.65));
  const value = Math.max(min, Math.min(max, Math.round(height)));
  consolePanel.style.height = value + "px";
  consoleResizer.setAttribute("aria-valuenow", String(value));
}
consoleResizer.addEventListener("pointerdown", event => {
  if (event.button !== 0 && event.pointerType === "mouse") return;
  event.preventDefault();
  const startY = event.clientY;
  const startHeight = consolePanel.getBoundingClientRect().height;
  consoleResizer.setPointerCapture(event.pointerId);
  const move = e => setConsoleHeight(startHeight + startY - e.clientY);
  const end = () => {
    consoleResizer.removeEventListener("pointermove", move);
    consoleResizer.removeEventListener("pointerup", end);
    consoleResizer.removeEventListener("pointercancel", end);
  };
  consoleResizer.addEventListener("pointermove", move);
  consoleResizer.addEventListener("pointerup", end);
  consoleResizer.addEventListener("pointercancel", end);
});
consoleResizer.addEventListener("keydown", event => {
  if (event.key === "ArrowUp") { event.preventDefault(); setConsoleHeight(consolePanel.getBoundingClientRect().height + 24); }
  if (event.key === "ArrowDown") { event.preventDefault(); setConsoleHeight(consolePanel.getBoundingClientRect().height - 24); }
  if (event.key === "Home") { event.preventDefault(); setConsoleHeight(90); }
  if (event.key === "End") { event.preventDefault(); setConsoleHeight(window.innerHeight * 0.65); }
});
window.addEventListener("resize", () => {
  if (!consolePanel.hidden && consolePanel.style.height) setConsoleHeight(parseFloat(consolePanel.style.height));
});

document.getElementById("console-height-smaller").addEventListener("click", () => { const panel = document.getElementById("console-panel"); panel.style.height = Math.max(65, panel.getBoundingClientRect().height - 30) + "px"; });
document.getElementById("console-height-larger").addEventListener("click", () => { const panel = document.getElementById("console-panel"); panel.style.height = Math.min(window.innerHeight * .55, panel.getBoundingClientRect().height + 30) + "px"; });
document.getElementById("open-new").addEventListener("click", () => {
  if (!currentPreview) return;
  const blob = new Blob([currentPreview], {type:"text/html"});
  window.open(URL.createObjectURL(blob), "_blank", "noopener");
});
document.getElementById("github-form").addEventListener("submit", async event => {
  event.preventDefault();
  const value = document.getElementById("github-url").value.trim();
  const match = value.match(/github\.com\/([^/]+)\/([^/#?]+)(?:\/tree\/([^/]+)(?:\/(.+))?)?/i);
  if (!match) { log("公開GitHubリポジトリのURLを入力してください。", "error"); return; }
  const owner = match[1], repo = match[2].replace(/\.git$/,""), branchFromUrl = match[3], subdir = match[4] || "";
  const button = document.getElementById("import-github"); button.disabled = true; button.textContent = "読み込み中…";
  setStatus("GitHubを読み込み中…"); clearConsole(); showImportProgress();
  try {
    const cacheBust = Date.now().toString();
    const meta = await fetch("https://api.github.com/repos/" + owner + "/" + repo + "?_=" + cacheBust, { cache: "no-store" });
    if (!meta.ok) throw new Error(meta.status === 404 ? "リポジトリが見つからないか、非公開です。" : "GitHub API error: " + meta.status);
    const repoData = await meta.json(), branch = branchFromUrl || repoData.default_branch;
    githubMeta = {owner, repo, branch, subdir: subdir.replace(/\/$/,"")}; lastGithubUrl = value; sourceKind = "github";
    const treeRes = await fetch("https://api.github.com/repos/" + owner + "/" + repo + "/git/trees/" + encodeURIComponent(branch) + "?recursive=1&_=" + cacheBust, { cache: "no-store" });
    if (!treeRes.ok) throw new Error("ファイル一覧を取得できませんでした。ブランチ名を確認してください。");
    const treeData = await treeRes.json();
    if (treeData.truncated) log("リポジトリが大きいため、取得できる範囲だけ読み込みます。", "info");
    const candidates = (treeData.tree || [])
      .filter(x => x.type === "blob" && (!subdir || x.path.startsWith(subdir.replace(/\/$/,"") + "/")) && !/(^|\/)(node_modules|\.git|dist|build|\.next|coverage)(\/|$)/.test(x.path) && (TEXT_EXT.test(x.path) || /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|mp4|mp3)$/i.test(x.path)) && x.size < 500000)
      .sort((a, b) => {
        const priority = filePath => {
          const p = (subdir ? filePath.slice(subdir.replace(/\/$/, "").length + 1) : filePath).toLowerCase();
          const base = p.split("/").pop();
          if (/^(package\.json|package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|tsconfig\.json|jsconfig\.json|next\.config\.[cm]?[jt]s|postcss\.config\.[cm]?[jt]s|tailwind\.config\.[cm]?[jt]s|eslint\.config\.[cm]?[jt]s)$/.test(base)) return 0;
          if (/^(app|src\/app|pages|src\/pages)\//.test(p) && /\.(tsx?|jsx?)$/.test(p)) return 1;
          if (/^(components|src\/components|lib|src\/lib|hooks|src\/hooks|utils|src\/utils|types|src\/types|context|src\/context|providers|src\/providers|styles|src\/styles)\//.test(p) && /\.(tsx?|jsx?)$/.test(p)) return 2;
          if (/\.(tsx?|jsx?|css|scss|sass|json)$/.test(p)) return 3;
          if (/^(public|assets|images|fonts)\//.test(p) || /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|mp4|mp3)$/i.test(p)) return 5;
          if (/^(readme|license|changelog|contributing)(\.|$)/i.test(base) || /(^|\/)(docs?|__tests__|tests?|coverage|examples?)(\/|$)/i.test(p)) return 8;
          return 4;
        };
        return priority(a.path) - priority(b.path) || a.path.localeCompare(b.path);
      })
      .slice(0, 200);
    if (!candidates.length) throw new Error("取り込めるファイルが見つかりませんでした。");
    const files = {};
    for (let i=0;i<candidates.length;i++) {
      const item = candidates[i], path = subdir ? item.path.slice(subdir.length).replace(/^\//,"") : item.path;
      setStatus("取得中 " + (i+1) + "/" + candidates.length + " · " + Math.round((i+1)/candidates.length*100) + "%"); showImportProgress(candidates.length, i+1, path);
      try {
        const assetUrl = "https://cdn.jsdelivr.net/gh/" + owner + "/" + repo + "@" + branch + "/" + item.path.split("/").map(encodeURIComponent).join("/") + "?v=" + encodeURIComponent(item.sha || cacheBust);
        const response = await fetch(assetUrl, { cache: "no-store" });
        if (!response.ok) continue;
        const blob = await response.blob();
        if (TEXT_EXT.test(path)) files[path] = await blob.text();
        else files[path] = await blobToDataUrl(blob, MIME[extension(path)] || blob.type || "application/octet-stream");
      } catch (_) {}
    }
    if (!Object.keys(files).length) throw new Error("ファイルの内容を取得できませんでした。");
    sourceKind = "github"; setProject(files, owner + "/" + repo + " · " + branch);
    toast("GitHub から " + Object.keys(files).length + " ファイルを読み込みました", "success");
    if (candidates.length >= 200) log("表示対象は最大200ファイルです。依存ファイルが不足する場合は、不要なファイルを除外するか必要なソースを個別に追加してください。", "info");
  } catch (error) { hideImportProgress(); setStatus("読み込み失敗"); log(error.message || error, "error"); toast(error.message || "読み込みに失敗しました", "error"); }
  finally { button.disabled = false; button.textContent = "取り込む"; }
});
function blobToDataUrl(blob) {
  return new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = filename; link.style.display = "none";
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function safeDownloadName(path) {
  return String(path || "code.txt").split("/").pop().replace(/[\\/:*?"<>|]/g, "_") || "code.txt";
}
document.getElementById("export-current").addEventListener("click", () => {
  try {
    if (editor) syncEditor();
    const content = projectFiles[activePath];
    if (typeof content !== "string") throw new Error("書き出すファイルがありません");
    if (content.startsWith("data:")) {
      const match = content.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
      if (!match) throw new Error("このファイル形式は書き出せません");
      const mime = match[1] || "application/octet-stream";
      const raw = match[2] ? atob(match[3]) : decodeURIComponent(match[3]);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      downloadBlob(new Blob([bytes], {type:mime}), safeDownloadName(activePath));
    } else {
      downloadBlob(new Blob([content], {type:"text/plain;charset=utf-8"}), safeDownloadName(activePath));
    }
    toast("ファイルを書き出しました: " + safeDownloadName(activePath), "success");
  } catch (error) { toast(error.message || "ファイルの書き出しに失敗しました", "error"); }
});
document.getElementById("export-zip").addEventListener("click", async () => {
  try {
    if (editor) syncEditor();
    const paths = Object.keys(projectFiles).sort((a,b) => a.localeCompare(b));
    if (!paths.length) throw new Error("ZIPに含めるファイルがありません");
    const zip = new JSZip();
    for (const path of paths) {
      const value = projectFiles[path];
      if (typeof value !== "string") continue;
      if (value.startsWith("data:")) {
        const match = value.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
        if (!match) { zip.file(path, value); continue; }
        const raw = match[2] ? atob(match[3]) : decodeURIComponent(match[3]);
        const bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
        zip.file(path, bytes);
      } else {
        zip.file(path, value);
      }
    }
    for (const folder of explicitFolders) zip.folder(folder);
    const blob = await zip.generateAsync({type:"blob",compression:"DEFLATE",compressionOptions:{level:6}});
    const base = (document.getElementById("project-status").textContent || "code-preview")
      .replace(/^.*?·\s*/, "").replace(/\s*·\s*\d+\s*files?$/i, "").replace(/[^a-z0-9._-]+/gi,"-").replace(/^-+|-+$/g,"") || "code-preview";
    downloadBlob(blob, base + ".zip");
    toast("ZIPを書き出しました（" + paths.length + "ファイル）", "success");
  } catch (error) { toast(error.message || "ZIPの書き出しに失敗しました", "error"); }
});

document.getElementById("zip-input").addEventListener("change", async event => {
  const file = event.target.files[0]; if (!file) return;
  githubMeta = null; sourceKind = "project";
  setStatus("ZIPを展開中…"); clearConsole();
  try {
    const zip = await JSZip.loadAsync(file), entries = Object.values(zip.files).filter(f => !f.dir && !/(^|\/)(node_modules|\.git|dist|build|\.next|coverage)(\/|$)/.test(f.name) && (TEXT_EXT.test(f.name) || /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|mp4|mp3)$/i.test(f.name))).slice(0,200);
    const files = {};
    for (const entry of entries) {
      const path = entry.name.replace(/^([^/]+\/)(?=(index\.html|src\/|public\/|assets\/))/i,"");
      if (TEXT_EXT.test(path)) files[path] = await entry.async("string");
      else { const ext=extension(path); files[path] = "data:" + (MIME[ext] || "application/octet-stream") + ";base64," + await entry.async("base64"); }
    }
    const cleaned = stripCommonRoot(files);
    if (!Object.keys(cleaned).length) throw new Error("ZIP内に読み込めるファイルがありません。");
    setProject(cleaned, file.name); toast("ZIP から " + Object.keys(cleaned).length + " ファイルを読み込みました", "success");
  } catch (error) { setStatus("読み込み失敗"); log(error.message || error, "error"); toast(error.message || "読み込みに失敗しました", "error"); }
  event.target.value = "";
});
document.getElementById("folder-input").addEventListener("change", async event => {
  githubMeta = null; sourceKind = "project";
  const picked = Array.from(event.target.files || []).filter(f => f.size < 700000 && (TEXT_EXT.test(f.name) || /\.(png|jpe?g|gif|webp|ico|woff2?|ttf)$/i.test(f.name))).slice(0,200);
  if (!picked.length) return;
  setStatus("フォルダを読み込み中…"); const files = {};
  for (const file of picked) {
    const path = file.webkitRelativePath.split("/").slice(1).join("/") || file.name;
    if (TEXT_EXT.test(path)) files[path] = await file.text();
    else files[path] = await blobToDataUrl(file);
  }
  setProject(stripCommonRoot(files), "フォルダ · " + (picked[0].webkitRelativePath.split("/")[0] || "project")); toast("フォルダから " + Object.keys(projectFiles).length + " ファイルを読み込みました", "success");
  event.target.value = "";
});
function stripCommonRoot(files) {
  const keys = Object.keys(files);
  if (keys.length && keys.every(k => k.includes("/")) && new Set(keys.map(k => k.split("/")[0])).size === 1) {
    const root = keys[0].split("/")[0] + "/";
    const stripped = {}; keys.forEach(k => stripped[k.slice(root.length)] = files[k]); return stripped;
  }
  return files;
}
async function copyCurrentCode() {
  if (editor) syncEditor();
  const text = projectFiles[activePath] ?? "";
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const field = document.createElement("textarea");
      field.value = text; field.setAttribute("readonly", "");
      field.style.position = "fixed"; field.style.opacity = "0"; field.style.fontSize = "16px";
      document.body.appendChild(field); field.focus(); field.select(); field.setSelectionRange(0, field.value.length);
      const ok = document.execCommand("copy"); field.remove();
      if (!ok) throw new Error("コピーできませんでした。コード欄を開いて手動でコピーしてください。");
    }
    toast("コードをコピーしました", "success");
  } catch (error) {
    toast(error.message || "コピーに失敗しました", "error");
    const dialog = document.getElementById("paste-dialog");
    document.getElementById("paste-filename").value = activePath;
    document.getElementById("paste-code").value = text;
    dialog.showModal();
    const area = document.getElementById("paste-code"); area.focus(); area.select();
  }
}
document.getElementById("copy-code").addEventListener("click", copyCurrentCode);
document.getElementById("paste-code-open").addEventListener("click", () => {
  document.getElementById("paste-filename").value = activePath || "index.html";
  document.getElementById("paste-code").value = editor ? editor.getValue() : (projectFiles[activePath] || "");
  document.getElementById("paste-dialog").showModal();
  const area = document.getElementById("paste-code");
  area.focus();
  area.setSelectionRange(0, area.value.length);
});
document.getElementById("paste-open").addEventListener("click", () => {
  document.getElementById("paste-filename").value = activePath || "index.html";
  document.getElementById("paste-code").value = editor ? editor.getValue() : "";
  document.getElementById("paste-dialog").showModal();
});
document.getElementById("paste-load").addEventListener("click", event => {
  event.preventDefault();
  const path = document.getElementById("paste-filename").value.trim().replace(/^\/+/, "") || "index.html";
  const code = document.getElementById("paste-code").value;

  // Persist the editor buffer before applying the mobile textarea contents.
  // openFile() syncs the old Monaco buffer, which could overwrite these edits.
  syncEditor();
  projectFiles[path] = code;
  sourceKind = "project";

  if (path === activePath) {
    if (editor) editor.setValue(code);
    activeLabel.textContent = path;
    renderFileList();
  } else {
    openFile(path);
  }

  setStatus("モバイル編集を反映しました");
  document.getElementById("paste-dialog").close();
  run();
  toast("編集内容を反映しました", "success");
});
document.getElementById("file-actions").addEventListener("change", event => {
  const action = event.target.value; event.target.value = "";
  if (action === "file") document.getElementById("newfile-dialog").showModal();
  if (action === "folder") {
    document.getElementById("newfolder-name").value = "";
    document.getElementById("newfolder-dialog").showModal();
  }
});
document.getElementById("newfolder-create").addEventListener("click", event => {
  event.preventDefault();
  let path = document.getElementById("newfolder-name").value.trim(); while (path.startsWith("/")) path = path.slice(1); while (path.endsWith("/")) path = path.slice(0, -1);
  if (!path || path.split("/").some(part => !part || part === "." || part === "..")) { toast("フォルダ名を確認してください", "error"); return; }
  if (explicitFolders.has(path) || Object.keys(projectFiles).some(p => p.startsWith(path + "/"))) { toast("同じフォルダがすでに存在します", "error"); return; }
  explicitFolders.add(path); sourceKind = "project"; renderFileList(); setStatus("フォルダを追加しました"); toast("フォルダを追加しました: " + path, "success");
  document.getElementById("newfolder-dialog").close();
});
document.getElementById("newfile-create").addEventListener("click", event => {
  event.preventDefault(); const path = document.getElementById("newfile-name").value.trim().replace(/^\/+/,"");
  if (!path) return;
  if (projectFiles[path] !== undefined) { log("そのファイルはすでに存在します: " + path, "error"); return; }
  projectFiles[path] = ""; sourceKind = "project"; openFile(path); setStatus("ファイル追加"); document.getElementById("newfile-dialog").close(); document.getElementById("newfile-name").value = "";
});
function escapeScript(text) { return text.replace(/<\/script/gi, "<\\/script"); }
function resolvePath(from, target) {
  if (!target || /^(https?:|data:|blob:|\/\/|#|mailto:|javascript:)/i.test(target)) return null;
  const clean = target.split(/[?#]/)[0].replace(/^\.\//,"");
  if (clean.startsWith("/")) return clean.slice(1);
  const parts = from.split("/"); parts.pop();
  clean.split("/").forEach(p => { if (p === "..") parts.pop(); else if (p && p !== ".") parts.push(p); });
  return parts.join("/");
}
function githubRawUrl(path) {
  if (!githubMeta) return null;
  const repoPath = [githubMeta.subdir, path].filter(Boolean).join("/");
  return "https://cdn.jsdelivr.net/gh/" + githubMeta.owner + "/" + githubMeta.repo + "@" + githubMeta.branch + "/" + repoPath.split("/").map(encodeURIComponent).join("/");
}
function rewriteAssets(html, path) {
  if (githubMeta) {
    html = html.replace(/<script\b([^>]*?)src=(["'])(.*?)\2([^>]*)><\/script>/gi, (whole, before, quote, target, after) => {
      const resolved = resolvePath(path, target);
      if (!resolved || projectFiles[resolved] === undefined) return whole;
      const raw = githubRawUrl(resolved);
      return raw ? '<script' + before + 'src=' + quote + raw + quote + after + '></script>' : whole;
    });
    html = html.replace(/\b(href|src|poster)=(["'])(.*?)\2/gi, (whole, attr, quote, target) => {
      const resolved = resolvePath(path, target);
      if (!resolved || projectFiles[resolved] === undefined) return whole;
      const raw = githubRawUrl(resolved);
      return raw ? attr + "=" + quote + raw + quote : whole;
    });
    return html;
  }
  return html.replace(/\b(src|href|poster)=("([^"]*)"|'([^']*)')/gi, (whole, attr, quoted, dquote, squote) => {
    const target = dquote || squote || "", resolved = resolvePath(path,target);
    if (!resolved || projectFiles[resolved] === undefined) return whole;
    const content = projectFiles[resolved];
    if (typeof content === "string" && content.startsWith("data:")) return attr + "=" + quoted.replace(target,content);
    const ext = extension(resolved), mime = ext === "css" ? "text/css" : ext === "js" ? "text/javascript" : ext === "svg" ? "image/svg+xml" : "text/plain";
    const data = "data:" + mime + ";charset=utf-8," + encodeURIComponent(String(content));
    return attr + "=" + quoted.replace(target,data);
  });
}
function buildPreview(code, lang) {
  if (lang === "html" || /\.html?$/i.test(activePath)) return rewriteAssets(code,activePath);
  if (lang === "css" || /\.css$/i.test(activePath)) return '<!doctype html><html><head><meta charset="utf-8"><style>' + escapeScript(code) + '</style></head><body><div class="card">CSS Preview</div></body></html>';
  if (lang === "javascript" || /\.(m?js|cjs)$/i.test(activePath)) return '<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0}</style></head><body><script>' + escapeScript(code) + '<\/script></body></html>';
  let transformed;
  try {
    transformed = Babel.transform(code,{presets:[["react",{runtime:"classic"}]].concat(lang === "tsx" || /\.tsx$/i.test(activePath) ? [["typescript",{isTSX:true,allExtensions:true}]] : []),sourceType:"script"}).code;
  } catch(error) { throw new Error("Babel: " + error.message); }
  return '<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0}</style><script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"><\/script><script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"><\/script></head><body><div id="root"></div><script>window.addEventListener("error",e=>parent.postMessage({type:"preview-error",message:e.message},"*"));try{' + escapeScript(transformed) + '}catch(e){parent.postMessage({type:"preview-error",message:e.stack||e.message},"*")}<\/script></body></html>';
}
function instrumentPreview(html) {
  const bridge = '<script>(function(){["log","info","warn","error","debug"].forEach(function(level){var original=console[level];console[level]=function(){try{parent.postMessage({type:"preview-log",level:level,message:Array.from(arguments).map(function(v){try{return typeof v==="string"?v:JSON.stringify(v)}catch(_){return String(v)}}).join(" ")},"*")}catch(_){};if(original)original.apply(console,arguments)}});window.addEventListener("error",function(e){parent.postMessage({type:"preview-error",message:e.message+" ("+e.filename+":"+e.lineno+")"},"*")});window.addEventListener("unhandledrejection",function(e){parent.postMessage({type:"preview-error",message:String(e.reason)},"*")})})();<\/script>';
  return /<head[^>]*>/i.test(html) ? html.replace(/<head([^>]*)>/i, "<head$1>" + bridge) : bridge + html;
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
}
async function readApiResponse(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (_) {
    const detail = text.trim().slice(0, 600) || "(空のレスポンス)";
    throw new Error("APIがJSON以外を返しました (HTTP " + response.status + "): " + detail);
  }
}
function getRuntimeProjectFiles() {
  const files = {};
  const paths = Object.keys(projectFiles).sort((a, b) => {
    const priority = path => /(^|\/)(package\.json|go\.mod|go\.sum|cargo\.toml|cargo\.lock|requirements\.txt|pyproject\.toml|composer\.json|gemfile)$/i.test(path) ? 0 : 1;
    return priority(a) - priority(b) || a.localeCompare(b);
  });
  let bytes = 0;
  for (const path of paths) {
    const value = projectFiles[path];
    if (typeof value !== "string" || value.startsWith("data:")) continue;
    const size = new TextEncoder().encode(value).byteLength;
    if (bytes + size > 1_800_000) {
      throw new Error("Next.jsプロジェクトのテキストファイルが1.8MBを超えています。不要なファイルや大きなファイルを外してから再実行してください。");
    }
    files[path] = value;
    bytes += size;
  }
  if (!Object.keys(files).some(path => /(^|\/)package\.json$/i.test(path))) {
    throw new Error("Next.jsプロジェクトの package.json が見つかりません。");
  }
  return files;
}
function getRuntimeFiles(active) {
  const files = {};
  const paths = Object.keys(projectFiles);
  const ordered = [active, ...paths.filter(path => path !== active).sort((a, b) => {
    const priority = path => /(^|\/)(go\.mod|go\.sum|cargo\.toml|cargo\.lock|requirements\.txt|pyproject\.toml|composer\.json|gemfile|package\.json)$/i.test(path) ? 0 : 1;
    return priority(a) - priority(b) || a.localeCompare(b);
  })];
  let bytes = 0;
  for (const path of ordered) {
    const value = projectFiles[path];
    if (typeof value !== "string" || value.startsWith("data:")) continue;
    const size = new TextEncoder().encode(value).byteLength;
    if (bytes + size > 1_800_000) {
      throw new Error("実行用のテキストファイルが1.8MBを超えています。不要なファイルを外してから再実行してください。画像などのdata URIは実行APIに送信しません。");
    }
    files[path] = value;
    bytes += size;
  }
  if (!files[active]) throw new Error("実行対象ファイルが見つからないか、テキストファイルではありません。");
  return files;
}
let remoteRuntimeId = null;
let remotePollToken = 0;
let lastRuntimeLog = "";
let lastRuntimeProgress = "";
async function stopRemoteRuntime() {
  const id = remoteRuntimeId;
  remoteRuntimeId = null;
  if (!id) return;
  try {
    await fetch("/api/runtime/stop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
  } catch (_) {}
}
window.addEventListener("pagehide", () => {
  if (remoteRuntimeId) {
    fetch("/api/runtime/stop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: remoteRuntimeId }), keepalive: true }).catch(() => {});
  }
});
async function runRemoteCode(lang) {
  const token = ++remotePollToken;
  await stopRemoteRuntime();
  status.textContent = "Starting runtime…";
  setStatus(lang.toUpperCase() + " · 隔離ランタイムを準備中");
  log(lang.toUpperCase() + " を隔離された実行環境で実行しています…", "info");
  try {
    const response = await fetch("/api/runtime/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: lang, activePath, files: getRuntimeFiles(activePath) })
    });
    const started = await readApiResponse(response);
    if (token !== remotePollToken) return;
    if (!response.ok || started.error) throw new Error(started.error || "リモート実行を開始できませんでした");
    for (let attempt = 0; attempt < 140; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      if (token !== remotePollToken) return;
      const poll = await fetch("/api/runtime/status?id=" + encodeURIComponent(started.id), { cache: "no-store" });
      const state = await readApiResponse(poll);
      if (state.state === "error") throw new Error(state.message || "実行環境に接続できません");
      if (state.result) {
        const result = state.result;
        if (result.stdout) log(result.stdout.replace(/\n$/, ""), "log");
        if (result.stderr) log(result.stderr.replace(/\n$/, ""), "warn");
        status.textContent = result.exitCode === 0 ? "Exited 0" : "Exited " + result.exitCode;
        setStatus(lang.toUpperCase() + " · 終了コード " + result.exitCode);
        if (lang === "php" && /<(!doctype|html|body|main|div|h[1-6])\b/i.test(result.stdout || "")) {
          frame.srcdoc = instrumentPreview(result.stdout);
        } else {
          frame.srcdoc = '<!doctype html><html lang="ja"><meta charset="utf-8"><body style="margin:0;padding:22px;background:#fcf9ff;color:#352b3d;font:13px/1.7 ui-monospace,monospace"><div style="font:700 14px system-ui;margin-bottom:12px">実行結果 · ' + escapeHtml(lang.toUpperCase()) + ' · exit ' + escapeHtml(result.exitCode) + '</div><pre style="white-space:pre-wrap;overflow-wrap:anywhere">' + escapeHtml((result.stdout || "") + (result.stderr ? "\n" + result.stderr : "") || "(出力なし)") + '</pre></body></html>';
        }
        if (result.exitCode !== 0) log("実行が終了コード " + result.exitCode + " で終了しました", "error");
        return;
      }
      status.textContent = "Running remotely…";
      setStatus(state.message || lang.toUpperCase() + " · 実行中…");
    }
    throw new Error("実行がタイムアウトしました。コンソールを確認してください。");
  } catch (error) {
    if (token !== remotePollToken) return;
    status.textContent = "Runtime error";
    setStatus("リモート実行エラー");
    log(error.message || String(error), "error");
    frame.srcdoc = '<!doctype html><html lang="ja"><meta charset="utf-8"><body style="font:14px/1.8 system-ui;padding:24px;color:#a21c4b;background:#fff7fa"><h2>実行に失敗しました</h2><pre style="white-space:pre-wrap">' + escapeHtml(error.message || String(error)) + '</pre></body></html>';
    toast("リモート実行に失敗しました", "error");
  }
}
async function runRemoteProject() {
  const token = ++remotePollToken;
  lastRuntimeLog = "";
  lastRuntimeProgress = "";
  await stopRemoteRuntime();
  status.textContent = "Starting runtime…";
  setStatus("リモート環境を準備中…");
  const readyBanner = document.getElementById("preview-ready-banner");
  if (readyBanner) readyBanner.hidden = true;
  frame.srcdoc = '<!doctype html><html lang="ja"><meta charset="utf-8"><body style="font:14px system-ui;display:grid;place-items:center;height:100vh;margin:0;background:#fcf9ff;color:#786583"><div>☁️ 隔離ランタイムを起動しています…<br><small>依存関係のインストールには時間がかかる場合があります</small></div></body></html>';
  try {
    const runtimeFiles = getRuntimeProjectFiles();
    const manifest = Object.entries(runtimeFiles).map(([path, content]) => ({
      path,
      bytes: new TextEncoder().encode(content).byteLength
    }));
    const preflightResponse = await fetch("/api/runtime/preflight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files: manifest })
    });
    const preflight = await readApiResponse(preflightResponse);
    if (!preflightResponse.ok || preflight.error) {
      throw new Error(preflight.error || "Goバックエンドの事前検証に失敗しました");
    }
    log("Goバックエンドの事前検証: " + preflight.fileCount + " files · " + Math.round(preflight.totalBytes / 1024) + " KB", "info");
    const response = await fetch("/api/runtime/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files: runtimeFiles })
    });
    const result = await readApiResponse(response);
    if (token !== remotePollToken) return;
    if (!response.ok || result.error) throw new Error(result.error || "リモートプレビューを開始できませんでした");
    remoteRuntimeId = result.id;
    setStatus("依存関係をインストール中…");
    log("隔離ランタイムを作成しました。依存関係をインストールしています。", "info");
    const runtimePollStartedAt = Date.now();
    for (let attempt = 0; attempt < 900; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      if (token !== remotePollToken) return;
      // API応答が遅延・失敗しても、クライアント側の生存ログは10秒ごとに出す。
      if (attempt % 5 === 0) {
        const elapsedSeconds = Math.floor((Date.now() - runtimePollStartedAt) / 1000);
        log("起動確認中 · 経過 " + Math.floor(elapsedSeconds / 60) + "分" + (elapsedSeconds % 60) + "秒", "info");
      }
      const statusResponse = await fetch("/api/runtime/status?id=" + encodeURIComponent(result.id), { cache: "no-store" });
      const state = await readApiResponse(statusResponse);
      if (state.logs) {
        const logs = state.logs.split("\n").filter(Boolean);
        const latest = logs.slice(-8).join("\n");
        if (latest && latest !== lastRuntimeLog && attempt % 2 === 0) {
          log(latest, "info");
          lastRuntimeLog = latest;
        }
      }
      if (state.state === "ready") {
        frame.src = result.previewUrl;
        status.textContent = "Preview ready";
        setStatus("リモートプレビュー稼働中 · " + new URL(result.previewUrl).host);
        const readyLink = document.getElementById("preview-ready-link");
        const readyOpen = document.getElementById("preview-ready-open");
        const readyMessage = document.getElementById("preview-ready-message");
        if (readyLink) { readyLink.href = result.previewUrl; readyLink.textContent = result.previewUrl; }
        if (readyOpen) readyOpen.href = result.previewUrl;
        if (readyMessage) readyMessage.textContent = "プレビューが完成しました";
        if (readyBanner) readyBanner.hidden = false;
        log("プレビューが起動しました: " + result.previewUrl, "info");
        toast("リモートプレビューを起動しました", "success");
        return;
      }
      if (state.state === "error") throw new Error(state.message + (state.logs ? "\n" + state.logs : ""));
      status.textContent = state.state === "installing" ? "Installing dependencies…" : "Starting server…";
      const seconds = Number.isFinite(state.elapsedSeconds) ? state.elapsedSeconds : null;
      const elapsed = seconds !== null ? " · 経過 " + Math.floor(seconds / 60) + "分" + (seconds % 60) + "秒" : "";
      const progressMessage = (state.message || "プレビューを起動中…") + elapsed;
      setStatus(progressMessage);
      // ログが増えない依存関係インストール中も、10秒ごとに経過をコンソールへ出す。
      const progressKey = [state.state, state.stage || "", seconds === null ? "" : Math.floor(seconds / 10)].join(":");
      if (progressKey !== lastRuntimeProgress) {
        log(progressMessage, "info");
        lastRuntimeProgress = progressKey;
      }
    }
    throw new Error("起動が30分でタイムアウトしました。最後に表示された進捗ログを確認してください。");
  } catch (error) {
    if (token !== remotePollToken) return;
    await stopRemoteRuntime();
    status.textContent = "Runtime error";
    setStatus("リモートプレビューの起動に失敗");
    log(error.message || String(error), "error");
    frame.srcdoc = '<!doctype html><html lang="ja"><meta charset="utf-8"><body style="font:14px/1.8 system-ui;padding:24px;color:#a21c4b;background:#fff7fa"><h2>プロジェクトを起動できませんでした</h2><pre style="white-space:pre-wrap;overflow-wrap:anywhere">' + escapeHtml(error.message || String(error)) + '</pre><p>コンソールにビルドログがある場合は、最後のエラー行を確認してください。</p></body></html>';
    toast("プロジェクトの起動に失敗しました", "error");
  }
}
function run() {
  if (!editor) return;
  syncEditor();
  const code = projectFiles[activePath] || "", lang = language.value;
  clearConsole(); status.textContent = "Running…";
  try {
    const paths = Object.keys(projectFiles);
    const packageFile = paths.find(p => /(^|\/)package\.json$/i.test(p));
    let packageData = {};
    if (packageFile) { try { packageData = JSON.parse(projectFiles[packageFile]); } catch (_) {} }
    const deps = Object.assign({}, packageData.dependencies || {}, packageData.devDependencies || {});
    const isNext = !!(deps.next || paths.some(p => /(^|\/)next\.config\.(js|mjs|ts|cjs)$/i.test(p)));
    const scripts = Object.values(packageData.scripts || {}).join(" ");
    const isBuildApp = isNext || /\b(vite|astro|nuxt|react-scripts|vue-cli-service|next)\b/.test(scripts);
    if (isBuildApp) { runRemoteProject(); return; }
    const sourceRuntime = ({php:"php",py:"python",go:"go",rs:"rust",rb:"ruby",c:"c",h:"c",cpp:"cpp",cc:"cpp",cxx:"cpp"})[extension(activePath)];
    const runtimeLang = sourceRuntime || lang;
    if (sourceRuntime || ["php","python","go","rust","c","cpp","ruby"].includes(lang)) {
      runRemoteCode(runtimeLang); return;
    }
    let html;
    const entry = paths.find(p => /(^|\/)index\.html?$/i.test(p));
    if (entry && !/\.(jsx|tsx)$/i.test(activePath)) html = rewriteAssets(projectFiles[entry],entry);
    else html = buildPreview(code,lang);
    html = instrumentPreview(html);
    currentPreview = html; frame.srcdoc = html; status.textContent = "Ready";
  } catch(error) { status.textContent = "Error"; log(error.stack || error.message,"error"); toast(error.message || "プレビューに失敗しました", "error"); }
}
window.addEventListener("message", event => {
  if (!event.data) return;
  if (event.data.type === "preview-error") { status.textContent = "Preview error"; log(event.data.message,"error"); }
  if (event.data.type === "preview-log") log(event.data.message, event.data.level);
});


// Copy all visible console output for sharing/debugging.
document.getElementById("copy-console")?.addEventListener("click", async () => {
  const text = Array.from(consoleEl.children).map(line => line.innerText || line.textContent || "").join("\n");
  if (!text) { toast("コピーするログがありません", "info"); return; }
  try {
    await navigator.clipboard.writeText(text);
    toast("コンソールをコピーしました", "success");
  } catch (_) {
    const field = document.createElement("textarea");
    field.value = text; field.setAttribute("readonly", "");
    field.style.position = "fixed"; field.style.opacity = "0";
    document.body.appendChild(field); field.select();
    const copied = document.execCommand("copy"); field.remove();
    toast(copied ? "コンソールをコピーしました" : "コピーできませんでした。ログを選択してコピーしてください", copied ? "success" : "error");
  }
});
