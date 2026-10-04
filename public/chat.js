(() => {
  const root = document.createElement("div");
  root.id = "tf-chat";
  root.innerHTML = `
    <section class="tf-panel" hidden>
      <header class="tf-bar">
        <strong class="tf-title">Help</strong>
        <span style="flex:1"></span>
        <button type="button" data-act="end" hidden>End</button>
        <button class="tf-x" type="button" data-act="close" aria-label="Close">✕</button>
      </header>
      <nav class="tf-nav"></nav>
      <div class="tf-body"></div>
      <div class="tf-tools" hidden><button type="button" data-act="commands">Commands</button></div>
      <form class="tf-compose" hidden>
        <textarea rows="1" maxlength="1800" placeholder="Message"></textarea>
        <button type="submit">Send</button>
      </form>
    </section>
    <button class="tf-launcher" type="button" aria-label="Open help">
      <span class="tf-badge" hidden></span>
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path fill="white" d="M5 6.5A3.5 3.5 0 0 1 8.5 3h7A3.5 3.5 0 0 1 19 6.5v6A3.5 3.5 0 0 1 15.5 16H12l-4.2 3.2c-.7.5-1.8 0-1.8-.9V16A3.5 3.5 0 0 1 5 12.5v-6Z"/></svg>
    </button>`;
  document.body.appendChild(root);

  const panel = root.querySelector(".tf-panel");
  const body = root.querySelector(".tf-body");
  const nav = root.querySelector(".tf-nav");
  const form = root.querySelector(".tf-compose");
  const tools = root.querySelector(".tf-tools");
  const input = form.querySelector("textarea");
  const end = root.querySelector("[data-act=end]");
  const badge = root.querySelector(".tf-badge");
  const title = root.querySelector(".tf-title");
  let state = null;
  let view = "home";
  let topic = "general";
  let channelId = "";
  let seen = 0;
  let busy = false;
  let showMenu = false;
  let painted = "";

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const convo = () => (state && state.conversation) || { open: false, messages: [] };
  const mine = () => !channelId || !state || !state.conversation || state.conversation.channelId === channelId;

  function diagnostics() {
    const navg = navigator;
    const ua = navg.userAgent || "";
    let browser = "Browser";
    if (/Edg\//.test(ua)) browser = "Edge";
    else if (/Chrome\//.test(ua)) browser = "Chrome";
    else if (/Safari\//.test(ua) && /Version\//.test(ua)) browser = "Safari";
    else if (/Firefox\//.test(ua)) browser = "Firefox";
    return {
      browser, platform: navg.platform || "", language: navg.language || "",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
      screen: `${screen.width}x${screen.height}`, viewport: `${window.innerWidth}x${window.innerHeight}`,
      cookiesEnabled: navg.cookieEnabled === true, online: navg.onLine === true,
      touch: (navg.maxTouchPoints || 0) > 0, userAgent: ua.slice(0, 180),
    };
  }

  async function post(path, payload) {
    const res = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload || {}),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      const error = new Error("Sign in to message a teacher.");
      error.signin = true;
      throw error;
    }
    if (!res.ok) throw new Error(data.error || "Chat did not answer.");
    return data;
  }

  function cards(list) {
    return (list || []).map((item) => `
      <article class="tf-card"><strong>${esc(item.title)}</strong><p>${esc(item.body)}</p>
      ${(item.buttons || []).length ? `<div class="tf-actions">${item.buttons.map((button) => `<button type="button" data-walk="${esc(button.id)}">${esc(button.label)}</button>`).join("")}</div>` : ""}
      </article>`).join("");
  }

  function render() {
    if (!state) return `<p class="tf-empty">Sign in to message a teacher.</p>`;
    if (view === "inbox") {
      const groups = state.inbox || [];
      if (!groups.length) return `<p class="tf-empty">No open chats for your qualifications.</p>`;
      return groups.map((group) => `<div class="tf-label">${esc(group.label)}</div>${group.tickets.map((ticket) => `
        <button class="tf-row" type="button" data-channel="${esc(ticket.channelId)}"><b>${esc(ticket.name)}</b><span>${esc(ticket.preview || "No messages yet")}</span></button>`).join("")}`).join("");
    }
    if (view === "chat") {
      const open = Boolean(convo().open);
      const closed = (convo().messages || []).length && !open;
      const pending = convo().pendingDiagnostic;
      return `
        ${closed ? `<div class="tf-banner"><strong>Closed</strong><span class="tf-note">Send a message to start another.</span></div>` : ""}
        ${pending ? `<div class="tf-banner"><strong>Share this browser and device?</strong><span class="tf-note">Cookie values are not sent.</span><div class="tf-actions"><button class="primary" type="button" data-consent="yes">Allow</button><button type="button" data-consent="no">Not now</button></div></div>` : ""}
        ${showMenu ? `<div class="tf-menu">${(state.commands || []).map((item) => `<button type="button" data-command=".${esc(item.name)} ">${esc(item.name)}</button>`).join("")}</div>` : ""}
        ${(convo().messages || []).map((item) => `<div class="tf-msg ${esc(item.side || "staff")}"><small>${esc(item.author || "TeachForth")}</small><p>${esc(item.text || "")}</p>${cards(item.cards)}</div>`).join("")}
        ${busy ? `<p class="tf-empty">Sending…</p>` : ""}`;
    }
    const topics = (state.topics || []).map((item) => `<button class="tf-row" type="button" data-topic="${esc(item.id)}"><b>${esc(item.label)}</b><span>${esc(item.blurb)}</span></button>`).join("");
    const recent = (convo().messages || []).slice(-1)[0];
    return `${recent ? `<button class="tf-row" type="button" data-act="view" data-view="chat"><b>${convo().open ? "Continue" : "Last chat"}</b><span>${esc(recent.text || "Open it")}</span></button>` : `<p class="tf-empty">Pick a topic, then send a message.</p>`}<div class="tf-label">Topic</div>${topics}`;
  }

  function paint(force) {
    const messages = convo().messages || [];
    const key = [view, convo().open, convo().channelId, convo().pendingDiagnostic, busy, showMenu, messages.map((item) => `${item.id}:${item.text}`).join("|"), JSON.stringify(state && state.inbox || [])].join("~");
    if (!force && key === painted) return;
    const top = body.scrollTop;
    const nearBottom = body.scrollHeight - top - body.clientHeight < 72;
    painted = key;
    const staff = Boolean(state && state.staff);
    const tabs = staff ? [["home", "Home"], ["inbox", "Inbox"], ["chat", "Chat"]] : [["home", "Home"], ["chat", "Chat"]];
    nav.innerHTML = state ? tabs.map(([id, label]) => `<button type="button" data-act="view" data-view="${id}" class="${view === id ? "on" : ""}">${label}</button>`).join("") : "";
    end.hidden = !convo().open;
    tools.hidden = !state || view === "home" || view === "inbox";
    form.hidden = !state || view === "home" || view === "inbox";
    title.textContent = view === "inbox" ? "Inbox" : view === "chat" ? (convo().label || "Chat") : "Help";
    input.placeholder = convo().open ? "Message" : "Message to start a new chat";
    body.innerHTML = render();
    body.scrollTop = force || nearBottom || busy ? body.scrollHeight : top;
  }

  function adopt(data, keepViewed) {
    if (!data) return;
    const current = state && state.conversation;
    const incoming = data.conversation;
    const viewingOther = Boolean(keepViewed && channelId && current && current.channelId === channelId && incoming && incoming.channelId !== channelId);
    state = { ...(state || {}), ...data, conversation: viewingOther ? current : (incoming || current) };
    if (data.inbox) state.inbox = data.inbox;
    if (incoming) state.own = incoming;
    if (!viewingOther && incoming) channelId = incoming.channelId || "";
  }

  async function refresh() {
    try {
      const data = await post("/api/chat/session", {});
      const count = ((data.conversation && data.conversation.messages) || []).length;
      if (!root.classList.contains("open") && count > seen) {
        badge.hidden = false;
        badge.textContent = String(Math.min(count - seen, 9));
      }
      const viewingOther = Boolean(channelId && state && state.conversation && state.conversation.channelId === channelId
        && data.conversation && data.conversation.channelId !== channelId);
      adopt(data, true);
      if (viewingOther && root.classList.contains("open")) {
        const thread = await post("/api/chat/thread", { channelId }).catch(() => null);
        if (thread && thread.conversation) state.conversation = thread.conversation;
      }
      if (root.classList.contains("open")) paint(false);
    } catch (err) {
      if (!state && root.classList.contains("open")) body.innerHTML = `<p class="tf-empty">${esc(err.message)}</p>`;
    }
  }

  function openPanel(open) {
    root.classList.toggle("open", open);
    panel.hidden = !open;
    if (!open) return;
    seen = (convo().messages || []).length;
    badge.hidden = true;
    paint(true);
    refresh();
  }

  async function send(event) {
    event.preventDefault();
    const text = input.value.trim();
    if (!text || busy) return;
    const open = Boolean(convo().open) && mine();
    input.value = "";
    input.style.height = "auto";
    busy = true;
    view = "chat";
    paint(true);
    try {
      adopt(open
        ? await post("/api/chat/send", { text, channelId: channelId || convo().channelId || "" })
        : await post("/api/chat/open", { topic, message: text }));
    } catch (err) {
      body.insertAdjacentHTML("beforeend", `<p class="tf-empty">${esc(err.message)}</p>`);
    } finally {
      busy = false;
      paint(true);
    }
  }

  root.addEventListener("click", async (event) => {
    if (event.target.closest(".tf-launcher")) {
      openPanel(!root.classList.contains("open"));
      return;
    }
    const button = event.target.closest("button");
    if (!button || !panel.contains(button)) return;
    if (button.dataset.act === "close") return openPanel(false);
    if (button.dataset.act === "end") {
      if (!convo().open || busy) return;
      busy = true;
      try {
        adopt(await post("/api/chat/close", { channelId: channelId || convo().channelId || "" }));
      } catch (err) {
        body.insertAdjacentHTML("beforeend", `<p class="tf-empty">${esc(err.message)}</p>`);
      } finally {
        busy = false;
        paint(true);
      }
      return;
    }
    if (button.dataset.act === "commands") {
      showMenu = !showMenu;
      view = "chat";
      paint(true);
      return;
    }
    if (button.dataset.act === "view") {
      view = button.dataset.view || "home";
      showMenu = false;
      paint(true);
      return;
    }
    if (button.dataset.topic) {
      topic = button.dataset.topic;
      if (state && state.own) {
        state.conversation = state.own;
        channelId = state.own.channelId || "";
      }
      view = "chat";
      showMenu = false;
      paint(true);
      input.focus();
      return;
    }
    if (button.dataset.channel) {
      channelId = button.dataset.channel;
      view = "chat";
      const data = await post("/api/chat/thread", { channelId }).catch((err) => ({ error: err.message }));
      if (data.conversation) {
        state.conversation = data.conversation;
        paint(true);
      }
      return;
    }
    if (button.dataset.command) {
      input.value = button.dataset.command;
      showMenu = false;
      input.focus();
      paint(true);
      return;
    }
    if (button.dataset.walk) {
      const data = await post("/api/chat/walk", { action: button.dataset.walk, channelId }).catch(() => null);
      if (data && data.cards && state.conversation) {
        state.conversation.messages.push({ author: "TeachForth", side: "card", text: "", cards: data.cards });
        paint(true);
      }
      return;
    }
    if (button.dataset.consent) {
      const allow = button.dataset.consent === "yes";
      const data = await post("/api/chat/diagnostics", {
        consent: allow,
        diagnostics: allow ? diagnostics() : null,
        channelId: channelId || convo().channelId || "",
      }).catch((err) => ({ error: err.message }));
      if (data.conversation) adopt(data);
      paint(true);
    }
  });

  form.addEventListener("submit", send);
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 96)}px`;
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && root.classList.contains("open")) openPanel(false);
  });

  refresh();
  window.setInterval(() => { if (!busy) refresh(); }, 12000);
  window.TeachForthChat = { open: () => openPanel(true) };
})();
