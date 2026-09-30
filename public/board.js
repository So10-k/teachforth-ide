const COLORS = ["#1d2440", "#3b6ef6", "#e24a8d", "#1aa37a", "#e07a1f", "#7a4de0", "#d13b3b", "#f2c14e"];

export function openBoard({ state, api, publish, canDraw }) {
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
        <button data-tool="select" type="button" title="Move text and images">Select</button>
        <button data-tool="pen" class="on" type="button">Pen</button>
        <button data-tool="marker" type="button">Marker</button>
        <button data-tool="highlighter" type="button">Highlighter</button>
        <button data-tool="eraser" type="button">Eraser</button>
        <button data-tool="text" type="button">Text</button>
        <button data-tool="image" type="button">Image</button>
        <div class="sizes">${[2, 4, 8, 16].map((n) => `<button data-size="${n}" class="${n === 4 ? "on" : ""}" type="button">${n}</button>`).join("")}</div>
        <div class="swatches">${COLORS.map((color) => `<button data-color="${color}" style="background:${color}" type="button" aria-label="${color}"></button>`).join("")}</div>
        <button id="clear-slide" type="button">Clear slide</button>
      </aside>
      <div class="stage"><div class="board-surface"><canvas id="board"></canvas><div id="objects"></div></div></div>
    </div>
    <div class="film" id="film"></div>`;
  document.body.appendChild(root);
  const canvas = root.querySelector("#board");
  const layer = root.querySelector("#objects");
  const tool = { name: "pen", size: 4, color: "#3b6ef6" };
  let drawing = null;
  let sendAt = 0;
  let textTimer = null;

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
  function allowed() {
    return !canDraw || canDraw();
  }
  function resize() {
    const stage = canvas.parentElement.getBoundingClientRect();
    canvas.width = Math.max(320, Math.floor(stage.width));
    canvas.height = Math.max(240, Math.floor(stage.height));
    paint(false);
  }
  function paint(full = true) {
    paintCanvas();
    if (full) {
      paintObjects();
      paintFilm();
    }
  }
  function paintCanvas() {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const stroke of slide()?.strokes || []) drawStroke(ctx, stroke);
  }
  function paintFilm() {
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
  function paintObjects() {
    const strokes = (slide()?.strokes || []).filter((item) => item.tool === "text" || item.tool === "image");
    const keep = new Set(strokes.map((item) => item.id));
    for (const el of [...layer.children]) {
      if (!keep.has(el.dataset.id)) el.remove();
    }
    for (const stroke of strokes) {
      let el = layer.querySelector(`[data-id="${cssId(stroke.id)}"]`);
      if (!el) {
        el = document.createElement("div");
        el.dataset.id = stroke.id;
        el.className = stroke.tool === "text" ? "board-text" : "board-image";
        el.innerHTML = stroke.tool === "text"
          ? `<span class="mover" title="Move">⠿</span><div class="board-copy" contenteditable="true" spellcheck="false"></div><button class="obj-x" type="button" title="Remove">×</button>`
          : `<span class="mover" title="Move">⠿</span><img alt=""><button class="obj-x" type="button" title="Remove">×</button>`;
        if (stroke.tool === "text") el.querySelector(".board-copy").textContent = stroke.text || "";
        else el.querySelector("img").src = stroke.src || "";
        bindObject(el);
        layer.append(el);
      }
      const copy = el.querySelector(".board-copy");
      if (copy && document.activeElement !== copy && copy.textContent !== (stroke.text || "")) copy.textContent = stroke.text || "";
      const img = el.querySelector("img");
      if (img && img.getAttribute("src") !== (stroke.src || "")) img.src = stroke.src || "";
      el.style.left = `${(stroke.x || 0) * 100}%`;
      el.style.top = `${(stroke.y || 0) * 100}%`;
      el.style.width = `${(stroke.w || (stroke.tool === "text" ? 0.28 : 0.32)) * 100}%`;
      if (stroke.tool === "image") el.style.height = `${(stroke.h || 0.24) * 100}%`;
      if (copy) {
        copy.style.color = stroke.color || "#1d2440";
        copy.style.fontSize = `${14 + (stroke.size || 4) * 2}px`;
        copy.contentEditable = allowed() ? "true" : "false";
      }
      el.classList.toggle("locked", !allowed());
    }
  }
  function bindObject(el) {
    const copy = el.querySelector(".board-copy");
    if (copy) {
      copy.addEventListener("pointerdown", (event) => event.stopPropagation());
      copy.addEventListener("input", () => {
        const item = live(el.dataset.id);
        if (!item) return;
        item.text = copy.innerText;
        clearTimeout(textTimer);
        textTimer = setTimeout(() => publish({ slideId: slide().id, stroke: item }), 180);
      });
    }
    el.querySelector(".obj-x").onclick = (event) => {
      event.stopPropagation();
      if (!allowed()) return;
      removeObject(el.dataset.id);
    };
    const mover = el.querySelector(".mover");
    let drag = null;
    mover.addEventListener("pointerdown", (event) => {
      if (!allowed()) return;
      event.preventDefault();
      event.stopPropagation();
      const box = layer.getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      drag = { dx: event.clientX - rect.left, dy: event.clientY - rect.top, box };
      mover.setPointerCapture(event.pointerId);
    });
    mover.addEventListener("pointermove", (event) => {
      if (!drag) return;
      const item = live(el.dataset.id);
      if (!item) return;
      item.x = clamp((event.clientX - drag.dx - drag.box.left) / drag.box.width);
      item.y = clamp((event.clientY - drag.dy - drag.box.top) / drag.box.height);
      el.style.left = `${item.x * 100}%`;
      el.style.top = `${item.y * 100}%`;
    });
    mover.addEventListener("pointerup", () => {
      if (!drag) return;
      drag = null;
      const item = live(el.dataset.id);
      if (item) publish({ slideId: slide().id, stroke: item });
    });
  }
  function live(id) {
    return (slide()?.strokes || []).find((item) => item.id === id);
  }
  function removeObject(id) {
    const current = slide();
    if (!current) return;
    current.strokes = current.strokes.filter((item) => item.id !== id);
    publish({ action: "delete-stroke", slideId: current.id, strokeId: id });
    paint();
  }
  function drawStroke(ctx, stroke) {
    if (!stroke.points?.length || stroke.tool === "text" || stroke.tool === "image") return;
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
  function addText(pt) {
    const item = {
      id: Math.random().toString(36).slice(2, 10),
      tool: "text",
      color: tool.color,
      size: tool.size,
      x: pt.x,
      y: pt.y,
      w: 0.28,
      h: 0.08,
      text: "",
      points: [],
    };
    slide().strokes.push(item);
    paint();
    const copy = layer.querySelector(`[data-id="${cssId(item.id)}"] .board-copy`);
    copy?.focus();
    publish({ slideId: slide().id, stroke: item });
  }
  function addImage(pt) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      shrinkImage(file).then((src) => {
        if (src.length > 170000) return;
        const item = {
          id: Math.random().toString(36).slice(2, 10),
          tool: "image",
          color: "#ffffff",
          size: 4,
          x: pt.x,
          y: pt.y,
          w: 0.32,
          h: 0.24,
          src,
          points: [],
        };
        slide().strokes.push(item);
        paint();
        publish({ slideId: slide().id, stroke: item });
      }).catch(() => {});
    };
    input.click();
  }
  canvas.addEventListener("pointerdown", (event) => {
    if (!allowed()) return;
    const pt = point(event);
    if (tool.name === "select") return;
    if (tool.name === "text") {
      addText(pt);
      return;
    }
    if (tool.name === "image") {
      addImage(pt);
      return;
    }
    canvas.setPointerCapture(event.pointerId);
    drawing = {
      id: Math.random().toString(36).slice(2, 10),
      tool: tool.name,
      color: tool.color,
      size: tool.size,
      points: [pt],
    };
    slide().strokes.push(drawing);
    paint(false);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!drawing) return;
    drawing.points.push(point(event));
    paint(false);
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
    if (allowed()) publish({ action: "add-slide" });
  };
  root.querySelector("#clear-slide").onclick = () => {
    if (!allowed()) return;
    slide().strokes = [];
    publish({ action: "clear", slideId: slide().id });
    paint();
  };
  for (const button of root.querySelectorAll("[data-tool]")) {
    button.onclick = () => {
      tool.name = button.dataset.tool;
      root.querySelectorAll("[data-tool]").forEach((item) => item.classList.toggle("on", item === button));
      canvas.classList.toggle("selecting", tool.name === "select" || tool.name === "text" || tool.name === "image");
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
  root._paint = () => paint();
  return { paint };
}

function cssId(id) {
  return String(id).replace(/[^a-zA-Z0-9_-]/g, "");
}

function clamp(n) {
  return Math.max(0, Math.min(0.92, n));
}

function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("image"));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 640 / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.onerror = () => reject(new Error("image"));
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export function closeBoard() {
  document.querySelector(".board-app")?.remove();
}

export function applyBoard(doc) {
  const root = document.querySelector(".board-app");
  if (root?._paint) root._paint();
}
