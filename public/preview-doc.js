export function previewDocument(files, entry = "index.html") {
  const map = new Map((files || []).map((file) => [file.path, String(file.content || "")]));
  const page = map.get(entry) || map.get("index.html") || "<!DOCTYPE html><body><p>Add index.html, then press play.</p></body>";
  const css = map.get("style.css") || "";
  const script = `<script>${bridge()}\n${map.get("script.js") || ""}<\/script>`;
  const style = css ? `<style>${css}</style>` : "";
  if (page.includes("</head>")) {
    const withStyle = page.replace("</head>", `${style}</head>`);
    return withStyle.includes("</body>") ? withStyle.replace("</body>", `${script}</body>`) : `${withStyle}${script}`;
  }
  return `<!DOCTYPE html><head><meta charset="utf-8">${style}</head><body>${page}${script}</body>`;
}

function bridge() {
  return `document.addEventListener("click", (event) => {
    const link = event.target.closest && event.target.closest("a");
    if (!link) return;
    const href = link.getAttribute("href") || "";
    if (!href || href.startsWith("#") || /^[a-z]+:/i.test(href)) return;
    event.preventDefault();
    parent.postMessage({ type: "tf-nav", href }, "*");
  });`;
}
