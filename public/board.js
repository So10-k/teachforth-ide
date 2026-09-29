const COLORS = ["#1d2440", "#3b6ef6", "#e24a8d", "#1aa37a", "#e07a1f", "#7a4de0", "#d13b3b", "#f2c14e"];

export function openBoard({ state, api, publish }) {
  closeBoard();
  const root = document.createElement("div");
  root.className = "board-app";
  root.innerHTML = `<header>
      <strong>Board</strong>
      <span class="muted" id="slide-name"></span>
      <span class="spacer"></span>
      <button id="add-slide" type="button">Add slide</button>
      <button id="full" type="button">Full screen</button>
      <button id="close-board" type="button">Close</button>
    </header>
    <div class="board-main">
      <aside class="tools">
        <button data-tool="pen" class="on" type="button">Pen</button>
        <button data-tool="marker" type="button">Marker</button>
        <button data-tool="highlighter" type="button">Highlighter</button>
        <button data-tool="eraser" type="button">Eraser</button>
        <div class="sizes">${[2, 4, 8, 16].map((n) => `<button data-size="${n}" class="${n === 4 ? "on" : ""}" type="button">${n}</button>`).join("")}</div>
        <div class="swatches">${COLORS.map((color) => `<button data-color="${color}" style="background:${color}" type="button"></button>`).join("")}</div>
        <button id="clear-slide" type="button">Clear slide</button>
      </aside>
      <div class="stage"><canvas id="board"></canvas></div>
    </div>
    <div class="film" id="film"></div>`;
  document.body.appendChild(root);
  const canvas = root.querySelector("#board");
  const tool = { name: "pen", size: 4, color: "#3b6ef6" };
  let drawing = null;
  let sendAt = 0;

  function doc() {
    if (!state.boardDoc?.slides) {
      state.boardDoc = { slides: [{ id: "s1", title: "Slide 1", strokes: [] }], index: 0 };
    }
    return state.boardDoc;
  }
  function slide() {
    const data = doc();
    return data.slides[data.index] || data.slides[0];
  }
  function resize() {
    const stage = canvas.parentElement.getBoundingClientRect();
    canvas.width = Math.max(320, Math.floor(stage.width));
    canvas.height = Math.max(240, Math.floor(stage.height));
    paint();
  }
  function paint() {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const stroke of slide()?.strokes || []) drawStroke(ctx, stroke);
    root.querySelector("#slide-name").textContent = slide()?.title || "";
    root.querySelector("#film").innerHTML = doc().slides.map((item, index) =>
      `<button type="button" class="${index === doc().index ? "on" : ""}" data-index="${index}">${item.title}</button>`,
    ).join("");
    for (const button of root.querySelectorAll("[data-index]")) {
      button.onclick = () => {
        doc().index = Number(button.dataset.index);
        publish({ action: "select", index: doc().index });
        paint();
      };
    }
  }
  function drawStroke(ctx, stroke) {
    if (!stroke.points?.length) return;
    ctx.save();
    ctx.lineCap = stroke.tool === "highlighter" ? "square" : "round";
    ctx.lineJoin = "round";
    const scale = canvas.width / 1000;
    ctx.lineWidth = (stroke.size || 4) * (stroke.tool === "highlighter" ? 8 : stroke.tool === "marker" ? 2.4 : stroke.tool === "eraser" ? 3 : 1) * scale;
    if (stroke.tool === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
    } else {
      ctx.globalAlpha = stroke.tool === "highlighter" ? 0.35 : stroke.tool === "marker" ? 0.7 : 1;
      ctx.strokeStyle = stroke.color || "#3b6ef6";
    }
    ctx.beginPath();
    stroke.points.forEach((pt, index) => {
      const x = pt.x * canvas.width;
      const y = pt.y * canvas.height;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();
  }
  function point(event) {
    const box = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)),
      y: Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)),
    };
  }
  canvas.addEventListener("pointerdown", (event) => {
    canvas.setPointerCapture(event.pointerId);
    drawing = {
      id: Math.random().toString(36).slice(2, 10),
      tool: tool.name,
      color: tool.color,
      size: tool.size,
      points: [point(event)],
    };
    slide().strokes.push(drawing);
    paint();
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!drawing) return;
    drawing.points.push(point(event));
    paint();
    if (Date.now() - sendAt > 40) {
      sendAt = Date.now();
      publish({ slideId: slide().id, stroke: drawing });
    }
  });
  const end = () => {
    if (!drawing) return;
    publish({ slideId: slide().id, stroke: drawing });
    drawing = null;
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  root.querySelector("#close-board").onclick = closeBoard;
  root.querySelector("#full").onclick = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else root.requestFullscreen?.();
  };
  root.querySelector("#add-slide").onclick = () => {
    publish({ action: "add-slide" });
  };
  root.querySelector("#clear-slide").onclick = () => {
    slide().strokes = [];
    publish({ action: "clear", slideId: slide().id });
    paint();
  };
  for (const button of root.querySelectorAll("[data-tool]")) {
    button.onclick = () => {
      tool.name = button.dataset.tool;
      root.querySelectorAll("[data-tool]").forEach((item) => item.classList.toggle("on", item === button));
    };
  }
  for (const button of root.querySelectorAll("[data-size]")) {
    button.onclick = () => {
      tool.size = Number(button.dataset.size);
      root.querySelectorAll("[data-size]").forEach((item) => item.classList.toggle("on", item === button));
    };
  }
  for (const button of root.querySelectorAll("[data-color]")) {
    button.onclick = () => { tool.color = button.dataset.color; };
  }
  resize();
  window.addEventListener("resize", resize);
  root._paint = paint;
  return { paint };
}

export function closeBoard() {
  document.querySelector(".board-app")?.remove();
}

export function applyBoard(doc) {
  const root = document.querySelector(".board-app");
  if (root?._paint) root._paint();
}
