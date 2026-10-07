const defaults = {
  html: '<!doctype html>\n<html>\n<head><style>body{font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0;background:#fff7fb}h1{color:#7b4bc4}</style></head>\n<body><h1>Hello, Code Preview!</h1></body>\n</html>',
  css: 'body { font-family: system-ui; display: grid; place-items: center; height: 100vh; margin: 0; }\n.card { padding: 24px; border-radius: 16px; background: #f4eaff; }',
  javascript: 'const root = document.body;\nroot.innerHTML = \'<div class="card">Hello from JavaScript!</div>\';\nroot.style.cssText = "font-family:system-ui;display:grid;place-items:center;height:100vh";',
  jsx: 'function App() {\n  return <main style={{fontFamily:"system-ui", padding:40}}>\n    <h1>Hello JSX 👋</h1>\n    <p>React is running in your browser.</p>\n  </main>;\n}\n\nconst root = ReactDOM.createRoot(document.getElementById("root"));\nroot.render(<App />);',
  tsx: 'type Props = { name: string };\n\nfunction App({ name }: Props) {\n  return <main style={{fontFamily:"system-ui", padding:40}}>\n    <h1>Hello, {name}!</h1>\n    <p>This is TSX previewed without a build server.</p>\n  </main>;\n}\n\nReactDOM.createRoot(document.getElementById("root")).render(<App name="Mitsuki" />);'
};

let editor;
let currentPreview = "";

require.config({ paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs" }});
require(["vs/editor/editor.main"], () => {
  editor = monaco.editor.create(document.getElementById("editor"), {
    value: defaults.html,
    language: "html",
    theme: "vs",
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 13,
    tabSize: 2,
    padding: { top: 12 },
    wordWrap: "on",
  });
  run();
});

const language = document.getElementById("language");
const status = document.getElementById("status");
const consoleEl = document.getElementById("console");
const frame = document.getElementById("preview");

language.addEventListener("change", () => {
  const lang = language.value;
  if (!editor) return;
  editor.setValue(defaults[lang]);
  monaco.editor.setModelLanguage(editor.getModel(), lang === "javascript" ? "javascript" : lang === "tsx" ? "typescript" : lang === "jsx" ? "javascript" : lang);
  run();
});

document.getElementById("run").addEventListener("click", run);
document.getElementById("reset").addEventListener("click", () => {
  const lang = language.value;
  editor.setValue(defaults[lang]);
  run();
});
document.getElementById("clear-console").addEventListener("click", () => consoleEl.textContent = "");
document.getElementById("open-new").addEventListener("click", () => {
  const blob = new Blob([currentPreview], {type:"text/html"});
  window.open(URL.createObjectURL(blob), "_blank");
});

function log(message, type="log") {
  const line = document.createElement("div");
  line.textContent = "[" + type + "] " + message;
  consoleEl.appendChild(line);
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

function escapeForScript(s) {
  return s.replace(/<\\/script/gi, "<\\\\/script");
}

function buildPreview(code, lang) {
  if (lang === "html") return code;
  if (lang === "css") return `<!doctype html><html><head><style>${escapeForScript(code)}</style></head><body><div class="card">CSS Preview</div></body></html>`;
  if (lang === "javascript") return `<!doctype html><html><head><style>body{margin:0}</style></head><body><script>${escapeForScript(code)}<\\/script></body></html>`;

  let transformed;
  try {
    transformed = Babel.transform(code, {
      presets: [
        ["react", { runtime: "classic" }],
        lang === "tsx" ? ["typescript", {isTSX:true, allExtensions:true}] : null
      ].filter(Boolean),
      sourceType: "script"
    }).code;
  } catch (error) {
    throw new Error("Babel: " + error.message);
  }

  return `<!doctype html><html><head>
<style>body{margin:0}</style>
<script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"><\\/script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"><\\/script>
</head><body><div id="root"></div>
<script>
window.addEventListener("error",e=>parent.postMessage({type:"preview-error",message:e.message},"*"));
try { ${escapeForScript(transformed)} } catch(e) { parent.postMessage({type:"preview-error",message:e.stack||e.message},"*"); }
<\\/script></body></html>`;
}

function run() {
  if (!editor) return;
  const code = editor.getValue();
  const lang = language.value;
  consoleEl.textContent = "";
  status.textContent = "Running…";
  try {
    currentPreview = buildPreview(code, lang);
    frame.srcdoc = currentPreview;
    status.textContent = "Ready";
  } catch (error) {
    status.textContent = "Error";
    log(error.stack || error.message, "error");
  }
}

window.addEventListener("message", event => {
  if (!event.data) return;
  if (event.data.type === "preview-error") {
    status.textContent = "Preview error";
    log(event.data.message, "error");
  }
  if (event.data.type === "preview-log") log(event.data.message);
});
