const defaults = {
  html: '<!doctype html>\n<html lang="ja">\n<head><meta charset="utf-8"><style>body{font-family:system-ui;display:grid;place-items:center;min-height:100vh;margin:0;background:#fff7fb}h1{color:#7b4bc4}</style></head>\n<body><main><h1>Hello, Code Preview!</h1><p>左のファイル一覧からファイルを切り替えられます。</p></main></body>\n</html>',
  css: 'body { font-family: system-ui; display: grid; place-items: center; height: 100vh; margin: 0; }\n.card { padding: 24px; border-radius: 16px; background: #f4eaff; }',
  javascript: 'document.body.innerHTML = \'<div class="card">Hello from JavaScript!</div>\';\ndocument.body.style.cssText = "font-family:system-ui;display:grid;place-items:center;height:100vh";',
  jsx: 'function App() {\n  return <main style={{fontFamily:"system-ui", padding:40}}>\n    <h1>Hello JSX 👋</h1><p>React is running in your browser.</p>\n  </main>;\n}\nReactDOM.createRoot(document.getElementById("root")).render(<App />);',
  tsx: 'type Props = { name: string };\nfunction App({ name }: Props) {\n  return <main style={{fontFamily:"system-ui", padding:40}}><h1>Hello, {name}!</h1><p>TSX preview without a build server.</p></main>;\n}\nReactDOM.createRoot(document.getElementById("root")).render(<App name="Mitsuki" />);'
};
const TEXT_EXT = /\.(html?|css|[cm]?js|jsx|tsx?|json|md|txt|svg|xml|ya?ml|toml|php|py|go|rs|rb|sh|sql|vue|svelte)$/i;
const MIME = {png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",gif:"image/gif",webp:"image/webp",svg:"image/svg+xml",ico:"image/x-icon",woff:"font/woff",woff2:"font/woff2",ttf:"font/ttf",mp3:"audio/mpeg",mp4:"video/mp4"};
let editor, activePath = "index.html", projectFiles = {}, currentPreview = "", sourceKind = "sample";
const language = document.getElementById("language");
const status = document.getElementById("status");
const consoleEl = document.getElementById("console");
const frame = document.getElementById("preview");
const fileList = document.getElementById("file-list");
const projectStatus = document.getElementById("project-status");
const activeLabel = document.getElementById("active-file-label");

function setStatus(message) { projectStatus.textContent = message; }
function log(message, type) {
  const line = document.createElement("div");
  line.textContent = (type ? "[" + type + "] " : "") + String(message);
  consoleEl.appendChild(line); consoleEl.scrollTop = consoleEl.scrollHeight;
}
function extension(path) { return (path.split(".").pop() || "").toLowerCase(); }
function editorLanguage(path) {
  const ext = extension(path);
  return ({htm:"html",html:"html",css:"css",js:"javascript",mjs:"javascript",cjs:"javascript",jsx:"javascript",ts:"typescript",tsx:"typescript",json:"json",md:"markdown",py:"python",php:"php",go:"go",rs:"rust",rb:"ruby",sql:"sql",xml:"xml",svg:"xml",yml:"yaml",yaml:"yaml"})[ext] || "plaintext";
}
function renderFileList() {
  fileList.textContent = "";
  const paths = Object.keys(projectFiles).sort((a,b) => {
    const ai = a.toLowerCase().endsWith("index.html") ? 0 : 1, bi = b.toLowerCase().endsWith("index.html") ? 0 : 1;
    return ai - bi || a.localeCompare(b);
  });
  if (!paths.length) { fileList.innerHTML = '<div class="empty-files">ファイルがありません。<br>GitHub・ZIP・フォルダから読み込むか、＋ファイルで追加できます。</div>'; return; }
  paths.forEach(path => {
    const button = document.createElement("button");
    button.className = "file-item" + (path === activePath ? " active" : "");
    button.title = path;
    const icon = document.createElement("span"); icon.className = "file-icon"; icon.textContent = ({html:"<>",css:"#",js:"JS",jsx:"⚛",tsx:"TS",json:"{}",png:"▧",jpg:"▧",svg:"◇",php:"PHP",go:"GO",rs:"RS"})[extension(path)] || "·";
    const name = document.createElement("span"); name.className = "file-name"; name.textContent = path;
    button.append(icon,name); button.addEventListener("click", () => openFile(path)); fileList.appendChild(button);
  });
}
function syncEditor() {
  if (!editor || !projectFiles[activePath]) return;
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
  projectFiles = files; sourceKind = "project";
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
function resetSample() {
  setProject({"index.html":defaults.html,"style.css":defaults.css,"app.js":defaults.javascript}, "サンプル");
  sourceKind = "sample";
}
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
language.addEventListener("change", () => {
  const lang = language.value;
  const file = ({html:"index.html",css:"style.css",javascript:"app.js",jsx:"App.jsx",tsx:"App.tsx"})[lang];
  if (projectFiles[file] !== undefined) { openFile(file); return; }
  projectFiles[file] = defaults[lang]; openFile(file); run();
});
document.getElementById("run").addEventListener("click", run);
document.getElementById("refresh").addEventListener("click", run);
document.getElementById("reset").addEventListener("click", () => {
  if (sourceKind === "sample") resetSample();
  else if (confirm("現在の読み込みプロジェクトをサンプルに戻しますか？")) resetSample();
});
document.getElementById("clear-console").addEventListener("click", () => consoleEl.textContent = "");
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
  setStatus("GitHubを読み込み中…"); consoleEl.textContent = "";
  try {
    const meta = await fetch("https://api.github.com/repos/" + owner + "/" + repo);
    if (!meta.ok) throw new Error(meta.status === 404 ? "リポジトリが見つからないか、非公開です。" : "GitHub API error: " + meta.status);
    const repoData = await meta.json(), branch = branchFromUrl || repoData.default_branch;
    const treeRes = await fetch("https://api.github.com/repos/" + owner + "/" + repo + "/git/trees/" + encodeURIComponent(branch) + "?recursive=1");
    if (!treeRes.ok) throw new Error("ファイル一覧を取得できませんでした。ブランチ名を確認してください。");
    const treeData = await treeRes.json();
    if (treeData.truncated) log("リポジトリが大きいため、取得できる範囲だけ読み込みます。", "info");
    const candidates = (treeData.tree || []).filter(x => x.type === "blob" && (!subdir || x.path.startsWith(subdir.replace(/\/$/,"") + "/")) && !/(^|\/)(node_modules|\.git|dist|build|\.next|coverage)(\/|$)/.test(x.path) && (TEXT_EXT.test(x.path) || /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|mp4|mp3)$/i.test(x.path)) && x.size < 700000).slice(0,70);
    if (!candidates.length) throw new Error("取り込めるファイルが見つかりませんでした。");
    const files = {};
    for (let i=0;i<candidates.length;i++) {
      const item = candidates[i], path = subdir ? item.path.slice(subdir.length).replace(/^\//,"") : item.path;
      setStatus("取得中 " + (i+1) + "/" + candidates.length);
      try {
        const response = await fetch("https://raw.githubusercontent.com/" + owner + "/" + repo + "/" + encodeURIComponent(branch).replace(/%2F/g,"/") + "/" + item.path.split("/").map(encodeURIComponent).join("/"));
        if (!response.ok) continue;
        const blob = await response.blob();
        if (TEXT_EXT.test(path)) files[path] = await blob.text();
        else files[path] = await blobToDataUrl(blob, MIME[extension(path)] || blob.type || "application/octet-stream");
      } catch (_) {}
    }
    if (!Object.keys(files).length) throw new Error("ファイルの内容を取得できませんでした。");
    setProject(files, owner + "/" + repo + " · " + branch);
    if (candidates.length >= 70) log("表示対象は最大70ファイルです。", "info");
  } catch (error) { setStatus("読み込み失敗"); log(error.message || error, "error"); }
  finally { button.disabled = false; button.textContent = "取り込む"; }
});
function blobToDataUrl(blob) {
  return new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); });
}
document.getElementById("zip-input").addEventListener("change", async event => {
  const file = event.target.files[0]; if (!file) return;
  setStatus("ZIPを展開中…"); consoleEl.textContent = "";
  try {
    const zip = await JSZip.loadAsync(file), entries = Object.values(zip.files).filter(f => !f.dir && !/(^|\/)(node_modules|\.git|dist|build|\.next|coverage)(\/|$)/.test(f.name) && (TEXT_EXT.test(f.name) || /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|mp4|mp3)$/i.test(f.name))).slice(0,100);
    const files = {};
    for (const entry of entries) {
      const path = entry.name.replace(/^([^/]+\/)(?=(index\.html|src\/|public\/|assets\/))/i,"");
      if (TEXT_EXT.test(path)) files[path] = await entry.async("string");
      else { const ext=extension(path); files[path] = "data:" + (MIME[ext] || "application/octet-stream") + ";base64," + await entry.async("base64"); }
    }
    const cleaned = stripCommonRoot(files);
    if (!Object.keys(cleaned).length) throw new Error("ZIP内に読み込めるファイルがありません。");
    setProject(cleaned, file.name);
  } catch (error) { setStatus("読み込み失敗"); log(error.message || error, "error"); }
  event.target.value = "";
});
document.getElementById("folder-input").addEventListener("change", async event => {
  const picked = Array.from(event.target.files || []).filter(f => f.size < 700000 && (TEXT_EXT.test(f.name) || /\.(png|jpe?g|gif|webp|ico|woff2?|ttf)$/i.test(f.name))).slice(0,100);
  if (!picked.length) return;
  setStatus("フォルダを読み込み中…"); const files = {};
  for (const file of picked) {
    const path = file.webkitRelativePath.split("/").slice(1).join("/") || file.name;
    if (TEXT_EXT.test(path)) files[path] = await file.text();
    else files[path] = await blobToDataUrl(file);
  }
  setProject(stripCommonRoot(files), "フォルダ · " + (picked[0].webkitRelativePath.split("/")[0] || "project"));
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
document.getElementById("paste-open").addEventListener("click", () => {
  document.getElementById("paste-filename").value = activePath || "index.html";
  document.getElementById("paste-code").value = editor ? editor.getValue() : "";
  document.getElementById("paste-dialog").showModal();
});
document.getElementById("paste-load").addEventListener("click", event => {
  event.preventDefault();
  const path = document.getElementById("paste-filename").value.trim().replace(/^\/+/,"") || "index.html";
  const code = document.getElementById("paste-code").value;
  projectFiles[path] = code; sourceKind = "project"; openFile(path); setStatus("貼り付けコード"); run();
  document.getElementById("paste-dialog").close();
});
document.getElementById("new-file").addEventListener("click", () => document.getElementById("newfile-dialog").showModal());
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
function rewriteAssets(html, path) {
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
function run() {
  if (!editor) return;
  syncEditor();
  const code = projectFiles[activePath] || "", lang = language.value;
  consoleEl.textContent = ""; status.textContent = "Running…";
  try {
    let html;
    const entry = Object.keys(projectFiles).find(p => /(^|\/)index\.html?$/i.test(p));
    if (entry && (activePath !== entry || /\.html?$/i.test(activePath))) html = rewriteAssets(projectFiles[entry],entry);
    else html = buildPreview(code,lang);
    currentPreview = html; frame.srcdoc = html; status.textContent = "Ready";
  } catch(error) { status.textContent = "Error"; log(error.stack || error.message,"error"); }
}
window.addEventListener("message", event => {
  if (!event.data) return;
  if (event.data.type === "preview-error") { status.textContent = "Preview error"; log(event.data.message,"error"); }
  if (event.data.type === "preview-log") log(event.data.message);
});
