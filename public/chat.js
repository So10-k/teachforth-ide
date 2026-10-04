(() => {
  const root = document.createElement("div");
  root.id = "tf-chat";
  root.innerHTML = `
    <section class="tf-panel" role="dialog" aria-label="TeachForth chat">
      <header class="tf-hero">
        <div class="tf-top">
          <div class="tf-brand"><span class="tf-dot"></span> TeachForth</div>
          <div>
            <button class="tf-end" type="button" hidden>End chat</button>
            <button class="tf-ghost tf-x" type="button" aria-label="Close">Close</button>
          </div>
        </div>
        <nav class="tf-tabs"></nav>
        <h2>Hi there</h2>
        <p class="tf-lead">Ask a teacher. No Discord account needed.</p>
      </header>
      <div class="tf-sheet"></div>
      <form class="tf-compose" hidden>
        <button class="tf-apps" type="button" aria-label="Commands">⌘</button>
        <textarea rows="1" maxlength="1800" placeholder="Send a message"></textarea>
        <button class="tf-send" type="submit" aria-label="Send">↑</button>
      </form>
    </section>
    <button class="tf-launcher" type="button" aria-label="Open chat">
      <span class="tf-badge"></span>
      <svg class="tf-icon-chat" width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 6.5A3.5 3.5 0 0 1 8.5 3h7A3.5 3.5 0 0 1 19 6.5v6A3.5 3.5 0 0 1 15.5 16H12l-4.2 3.2c-.7.5-1.8 0-1.8-.9V16A3.5 3.5 0 0 1 5 12.5v-6Z" fill="white"/></svg>
      <svg class="tf-icon-x" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="white" stroke-width="2.4" stroke-linecap="round"/></svg>
    </button>`;
  document.body.appendChild(root);

  const sheet = root.querySelector(".tf-sheet");
  const tabs = root.querySelector(".tf-tabs");
  const form = root.querySelector(".tf-compose");
  const input = form.querySelector("textarea");
  const badge = root.querySelector(".tf-badge");
  const title = root.querySelector("h2");
  const lead = root.querySelector(".tf-lead");
  const end = root.querySelector(".tf-end");
  let state = null;
  let view = "home";
  let topic = "general";
  let channelId = "";
  let showMenu = false;
  let seen = 0;
  let sending = false;

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };
  const diagnostics = () => {
    const nav = navigator;
    const ua = nav.userAgent || "";
    let browser = "Browser";
    if (/Edg\//.test(ua)) browser = "Edge";
    else if (/Chrome\//.test(ua)) browser = "Chrome";
    else if (/Safari\//.test(ua) && /Version\//.test(ua)) browser = "Safari";
    else if (/Firefox\//.test(ua)) browser = "Firefox";
    return {
      browser, platform: nav.platform || "", language: nav.language || "",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
      screen: `${screen.width}x${screen.height}`, viewport: `${window.innerWidth}x${window.innerHeight}`,
      cookiesEnabled: nav.cookieEnabled === true, online: nav.onLine === true,
      touch: (nav.maxTouchPoints || 0) > 0, doNotTrack: nav.doNotTrack === "1", userAgent: ua.slice(0, 180),
    };
  };
  async function post(path, payload) {
    const res = await fetch(path, {
      method: "POST", credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload || {}),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      const error = new Error("Sign in to chat with a teacher.");
      error.signin = true;
      throw error;
    }
    if (!res.ok) throw new Error(data.error || "Chat did not answer.");
    return data;
  }
  const convo = () => (state && state.conversation) || { open: false, messages: [] };
  const cards = (list) => (list || []).map((item) => `
    <article class="tf-appcard"><small>TeachForth</small><strong>${esc(item.title)}</strong><p>${esc(item.body)}</p>
    ${(item.buttons || []).length ? `<div class="tf-actions">${item.buttons.map((button) => `<button type="button" data-walk="${esc(button.id)}">${esc(button.label)}</button>`).join("")}</div>` : ""}
    </article>`).join("");
  const bubbles = (messages) => (messages || []).map((item, index) => `
    <div class="tf-bubble ${esc(item.side || "staff")}" style="animation-delay:${Math.min(index, 8) * 40}ms">
      <small>${esc(item.author || "TeachForth")}</small>${esc(item.text || "")}${cards(item.cards)}
    </div>`).join("");

  function paint() {
    const staff = Boolean(state && state.staff);
    const open = Boolean(convo().open);
    const names = staff ? [["home", "Home"], ["inbox", "Inbox"], ["chat", "Chat"]] : [["home", "Home"], ["chat", "Messages"]];
    tabs.innerHTML = state ? names.map(([id, label]) => `<button type="button" data-view="${id}" class="${view === id ? "on" : ""}">${label}</button>`).join("") : "";
    form.hidden = !state || view === "home" || view === "inbox";
    end.hidden = !(state && open && (view === "chat" || !staff));
    const first = ((state && state.name) || "there").split(" ")[0];
    if (view === "chat" && open) {
      title.textContent = convo().label || "Chat";
      lead.textContent = "We reply during class.";
    } else if (view === "inbox") {
      title.textContent = "Inbox";
      lead.textContent = "Only tickets you are qualified for.";
    } else {
      title.textContent = `${greeting()}, ${esc(first)}`;
      lead.textContent = staff ? "Qualified chats are in your inbox." : "Ask a teacher. No Discord account needed.";
    }
    if (!state) {
      sheet.innerHTML = `<div class="tf-card"><b>Sign in</b><span class="tf-muted">Sign in to message a teacher.</span></div>`;
      return;
    }
    if (view === "inbox" && staff) {
      const groups = state.inbox || [];
      sheet.innerHTML = groups.length ? groups.map((group) => `
        <div class="tf-group">${esc(group.label)}</div>
        ${group.tickets.map((ticket) => `<button class="tf-ticket" type="button" data-channel="${esc(ticket.channelId)}"><b>${esc(ticket.name)}</b><span class="tf-muted">${esc(ticket.preview || "No messages yet")}</span></button>`).join("")}
      `).join("") : `<p class="tf-muted">No open chats for your qualifications.</p>`;
      return;
    }
    if (view === "chat") {
      const pending = convo().pendingDiagnostic;
      const closed = convo().messages.length && !open;
      sheet.innerHTML = `
        ${closed ? `<div class="tf-closed"><strong>This chat is closed.</strong><p class="tf-muted">Send a message to start a new one.</p></div>` : ""}
        ${pending ? `<div class="tf-consent"><strong>Share device details?</strong><p class="tf-muted">Browser, device, language, timezone, and screen size. Cookie values are not sent.</p><div class="tf-actions"><button class="primary" type="button" data-consent="yes">Allow</button><button type="button" data-consent="no">Not now</button></div></div>` : ""}
        ${showMenu ? menu() : ""}
        <div class="tf-stream">${bubbles(convo().messages)}${sending ? `<div class="tf-typing"><i></i><i></i><i></i></div>` : ""}</div>`;
      sheet.scrollTop = sheet.scrollHeight;
      return;
    }
    const topics = (state.topics || []).map((item) => `<button class="tf-topic" type="button" data-topic="${esc(item.id)}"><b>${esc(item.label)}</b><span class="tf-muted">${esc(item.blurb)}</span></button>`).join("");
    const recent = (convo().messages || []).slice(-1)[0];
    sheet.innerHTML = `<div class="tf-home">
      ${recent ? `<button class="tf-card tf-ticket" type="button" data-view-jump="chat"><b>${open ? "Continue" : "Last chat closed"}</b><span class="tf-muted">${esc(recent.text || "Open it")}</span></button>` : `<div class="tf-card"><b>Send us a message</b><span class="tf-muted">Pick a topic and we will route it to a qualified teacher.</span></div>`}
      <div class="tf-group">What do you need?</div>
      ${topics}
    </div>`;
  }
  function menu() {
    return `<div class="tf-menu">${((state && state.commands) || []).map((item) => `<button type="button" data-command=".${esc(item.name)}${item.usage ? " " : ""}">${esc(item.name)}</button>`).join("")}</div>`;
  }
  function take(data) {
    if (!data) return;
    state = { ...(state || {}), ...data };
    if (data.conversation) {
      state.conversation = data.conversation;
      if (data.conversation.open) channelId = data.conversation.channelId || channelId;
    }
    if (data.inbox) state.inbox = data.inbox;
  }
  async function refresh() {
    try {
      const data = await post("/api/chat/session", { channelId });
      const count = ((data.conversation && data.conversation.messages) || []).length;
      if (!root.classList.contains("open") && count > seen) {
        badge.textContent = String(count - seen);
        badge.classList.add("on");
      } else if (root.classList.contains("open")) {
        seen = count;
        badge.classList.remove("on");
      }
      take(data);
      if (root.classList.contains("open")) paint();
    } catch (err) {
      if (!state) {
        state = null;
        sheet.innerHTML = `<div class="tf-card"><b>${err.signin ? "Sign in" : "Chat"}</b><span class="tf-muted">${esc(err.message)}</span></div>`;
      }
    }
  }
  function openTopic(id) {
    topic = id || "general";
    view = "chat";
    showMenu = false;
    input.placeholder = convo().open ? "Message" : "Message to start a new chat";
    paint();
    input.focus();
  }
  async function send(event) {
    event.preventDefault();
    const text = input.value.trim();
    if (!text || sending) return;
    const open = convo().open;
    input.value = "";
    input.style.height = "auto";
    sending = true;
    view = "chat";
    paint();
    try {
      const data = open
        ? await post("/api/chat/send", { text, channelId: channelId || convo().channelId || "" })
        : await post("/api/chat/open", { topic, message: text });
      take(data);
    } catch (err) {
      sheet.insertAdjacentHTML("beforeend", `<p class="tf-muted">${esc(err.message)}</p>`);
    } finally {
      sending = false;
      paint();
    }
  }
  async function endChat() {
    if (!convo().open) return;
    sending = true;
    try {
      take(await post("/api/chat/close", { channelId: channelId || convo().channelId || "" }));
      channelId = "";
    } catch (err) {
      sheet.insertAdjacentHTML("beforeend", `<p class="tf-muted">${esc(err.message)}</p>`);
    } finally {
      sending = false;
      paint();
    }
  }

  root.querySelector(".tf-launcher").addEventListener("click", () => {
    root.classList.toggle("open");
    if (root.classList.contains("open")) {
      seen = (convo().messages || []).length;
      badge.classList.remove("on");
      paint();
      refresh();
    }
  });
  root.querySelector(".tf-x").addEventListener("click", () => root.classList.remove("open"));
  end.addEventListener("click", endChat);
  root.querySelector(".tf-apps").addEventListener("click", () => { showMenu = !showMenu; view = "chat"; paint(); });
  form.addEventListener("submit", send);
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); }
  });
  sheet.addEventListener("click", async (event) => {
    const topicButton = event.target.closest("[data-topic]");
    if (topicButton) return openTopic(topicButton.dataset.topic);
    const jump = event.target.closest("[data-view-jump]");
    if (jump) { view = jump.dataset.viewJump; paint(); return; }
    const tab = event.target.closest("[data-view]");
    if (tab) { view = tab.dataset.view; paint(); return; }
    const ticket = event.target.closest("[data-channel]");
    if (ticket) {
      channelId = ticket.dataset.channel;
      view = "chat";
      const data = await post("/api/chat/thread", { channelId }).catch((err) => ({ error: err.message }));
      if (data.conversation) take(data);
      paint();
      return;
    }
    const command = event.target.closest("[data-command]");
    if (command) { input.value = command.dataset.command; showMenu = false; input.focus(); return; }
    const walk = event.target.closest("[data-walk]");
    if (walk) {
      const data = await post("/api/chat/walk", { action: walk.dataset.walk, channelId }).catch(() => null);
      if (data && data.cards) {
        state.conversation.messages.push({ author: "TeachForth", side: "card", text: "", cards: data.cards });
        paint();
      }
      return;
    }
    const consent = event.target.closest("[data-consent]");
    if (!consent) return;
    const allow = consent.dataset.consent === "yes";
    const data = await post("/api/chat/diagnostics", {
      consent: allow,
      diagnostics: allow ? diagnostics() : null,
      channelId: channelId || convo().channelId || "",
    }).catch((err) => ({ error: err.message }));
    if (data.conversation) take(data);
    paint();
  });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") root.classList.remove("open"); });
  paint();
  refresh();
  window.setInterval(refresh, 8000);
  window.TeachForthChat = { open: () => { root.classList.add("open"); refresh(); } };
})();
