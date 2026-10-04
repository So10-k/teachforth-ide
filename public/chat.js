(() => {
  const root = document.createElement("div");
  root.id = "tf-chat";
  root.innerHTML = `
    <section class="tf-panel" role="dialog" aria-label="TeachForth chat">
      <header class="tf-head">
        <div class="tf-mark">TF</div>
        <div><strong>TeachForth</strong><span class="tf-status">We reply during class</span></div>
        <button class="tf-x" type="button" aria-label="Close chat">✕</button>
      </header>
      <nav class="tf-tabs"></nav>
      <div class="tf-body"></div>
      <form class="tf-compose" hidden>
        <button class="tf-apps" type="button" aria-label="Commands">⌘</button>
        <textarea rows="1" maxlength="1800" placeholder="Message a teacher"></textarea>
        <button class="tf-send" type="submit" aria-label="Send">➤</button>
      </form>
    </section>
    <button class="tf-launcher" type="button" aria-label="Open chat">
      <span class="tf-badge"></span>
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 6.5A3.5 3.5 0 0 1 8.5 3h7A3.5 3.5 0 0 1 19 6.5v6A3.5 3.5 0 0 1 15.5 16H12l-4.2 3.2c-.7.5-1.8 0-1.8-.9V16A3.5 3.5 0 0 1 5 12.5v-6Z" fill="white"/>
      </svg>
    </button>`;
  document.body.appendChild(root);

  const panel = root.querySelector(".tf-panel");
  const body = root.querySelector(".tf-body");
  const tabs = root.querySelector(".tf-tabs");
  const form = root.querySelector(".tf-compose");
  const input = form.querySelector("textarea");
  const badge = root.querySelector(".tf-badge");
  const status = root.querySelector(".tf-status");
  let state = null;
  let view = "home";
  let topic = "general";
  let channelId = "";
  let showMenu = false;
  let showConsent = false;
  let consentChoice = null;
  let seen = 0;
  let timer = 0;

  function esc(value) {
    return String(value || "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  }

  function diagnostics() {
    const nav = navigator;
    const ua = nav.userAgent || "";
    let browser = "Browser";
    if (/Edg\//.test(ua)) browser = "Edge";
    else if (/Chrome\//.test(ua)) browser = "Chrome";
    else if (/Safari\//.test(ua) && /Version\//.test(ua)) browser = "Safari";
    else if (/Firefox\//.test(ua)) browser = "Firefox";
    return {
      browser,
      platform: nav.platform || "",
      language: nav.language || "",
      languages: Array.from(nav.languages || []).slice(0, 4),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
      screen: `${screen.width}x${screen.height}`,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      cookiesEnabled: nav.cookieEnabled === true,
      online: nav.onLine === true,
      touch: (nav.maxTouchPoints || 0) > 0,
      doNotTrack: nav.doNotTrack === "1",
      cores: nav.hardwareConcurrency || null,
      memoryGb: nav.deviceMemory || null,
      userAgent: ua.slice(0, 180),
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
    if (!res.ok) throw new Error(data.error || "Chat did not answer.");
    return data;
  }

  function hourGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  }

  function cards(list) {
    return (list || []).map((item) => `
      <article class="tf-appcard ${esc(item.tone || "")}">
        <small>TeachForth</small>
        <strong>${esc(item.title)}</strong>
        <p>${esc(item.body)}</p>
        ${(item.fields || []).length ? `<div class="tf-fields">${item.fields.map((field) => `<div><b>${esc(field.name)}</b><br>${esc(field.value)}</div>`).join("")}</div>` : ""}
        ${(item.buttons || []).length ? `<div class="tf-actions">${item.buttons.map((button) => `<button type="button" data-walk="${esc(button.id)}">${esc(button.label)}</button>`).join("")}</div>` : ""}
      </article>`).join("");
  }

  function bubbles(messages) {
    return (messages || []).map((item) => {
      const side = item.side || "staff";
      return `<div class="tf-bubble ${esc(side)}"><small>${esc(item.author || "TeachForth")}</small>${esc(item.text || "")}${cards(item.cards)}</div>`;
    }).join("");
  }

  function consentBox() {
    return `<div class="tf-consent">
      <strong>Share device details?</strong>
      <p>Your teacher can see the browser, device, language, timezone, screen size, and whether cookies are enabled. Cookie values, passwords, and sign-in tokens are not sent.</p>
      <div class="tf-actions">
        <button class="primary" type="button" data-consent="yes">Allow</button>
        <button type="button" data-consent="no">Not now</button>
      </div>
    </div>`;
  }

  function paint() {
    const staff = Boolean(state && state.staff);
    const names = staff ? [["home", "Home"], ["inbox", "Inbox"], ["chat", "Chat"]] : [["home", "Home"], ["chat", "Chat"]];
    tabs.innerHTML = names.map(([id, label]) => `<button type="button" data-view="${id}" class="${view === id ? "on" : ""}">${label}</button>`).join("");
    form.hidden = view === "home" || view === "inbox";
    status.textContent = staff ? "Qualified inbox" : "We reply during class";
    if (!state) {
      body.innerHTML = `<div class="tf-home"><h2>${hourGreeting()}</h2><p class="tf-muted">Sign in, then link Discord, to chat with a teacher.</p></div>`;
      return;
    }
    if (view === "inbox" && staff) {
      const groups = state.inbox || [];
      body.innerHTML = groups.length ? groups.map((group) => `
        <div class="tf-group">${esc(group.label)}</div>
        ${group.tickets.map((ticket) => `<button class="tf-ticket" type="button" data-channel="${esc(ticket.channelId)}"><b>${esc(ticket.name)}</b><span class="tf-muted">${esc(ticket.preview || "No messages yet")}</span></button>`).join("")}
      `).join("") : `<p class="tf-muted">No tickets in your qualifications. A chapter lead can add one with .qualification add.</p>`;
      return;
    }
    if (view === "chat") {
      const convo = state.conversation || {};
      const pending = convo.pendingDiagnostic || showConsent;
      body.innerHTML = `${pending ? consentBox() : ""}${showMenu ? menu() : ""}<div class="tf-stream">${bubbles(convo.messages)}</div>`;
      body.scrollTop = body.scrollHeight;
      return;
    }
    const name = (state.name || "there").split(" ")[0];
    const topics = (state.topics || []).map((item) => `<button class="tf-topic" type="button" data-topic="${esc(item.id)}"><b>${esc(item.label)}</b><span>${esc(item.blurb)}</span></button>`).join("");
    const recent = (state.conversation && state.conversation.messages || []).slice(-1)[0];
    body.innerHTML = `<div class="tf-home">
      <h2>${hourGreeting()}, ${esc(name)}</h2>
      <p class="tf-muted">A teacher sees this chat here and in Discord. Pick a topic and we will route it to someone qualified.</p>
      ${state.conversation && state.conversation.pendingDiagnostic ? consentBox() : ""}
      ${recent ? `<button class="tf-card tf-ticket" type="button" data-view-jump="chat"><b>Continue</b><span class="tf-muted">${esc(recent.text || "Open conversation")}</span></button>` : ""}
      <div class="tf-group">What do you need?</div>
      ${topics}
    </div>`;
  }

  function menu() {
    const commands = (state && state.commands) || [];
    return `<div class="tf-menu">${commands.map((item) => `<button type="button" data-command=".${esc(item.name)}${item.usage ? " " : ""}">${esc(item.name)}</button>`).join(" ")}<p class="tf-muted">These commands also work in Discord. Cookie values are never sent.</p></div>`;
  }

  async function refresh() {
    try {
      const data = await post("/api/chat/session", { channelId });
      const before = ((state && state.conversation && state.conversation.messages) || []).length;
      state = data;
      const count = ((data.conversation && data.conversation.messages) || []).length;
      if (!root.classList.contains("open") && count > seen) {
        badge.textContent = String(count - seen);
        badge.classList.add("on");
      }
      if (root.classList.contains("open")) {
        seen = count;
        badge.classList.remove("on");
      }
      if (view === "chat" && count !== before) paint();
      else if (!state || view === "home" || view === "inbox") paint();
    } catch (err) {
      if (!state) {
        body.innerHTML = `<div class="tf-home"><h2>Chat</h2><p>${esc(err.message)}</p></div>`;
      }
    }
  }

  async function openTopic(id) {
    topic = id || "general";
    channelId = "";
    view = "chat";
    showMenu = false;
    showConsent = !(state && state.conversation && state.conversation.open);
    state = state || {};
    state.conversation = state.conversation || { messages: [] };
    paint();
    input.placeholder = `Ask about ${topic}`;
    input.focus();
  }

  async function send(event) {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    const open = state && state.conversation && state.conversation.open;
    if (!open && consentChoice === null) {
      showConsent = true;
      view = "chat";
      paint();
      return;
    }
    input.value = "";
    const path = open ? "/api/chat/send" : "/api/chat/open";
    const payload = path.endsWith("open")
      ? { topic, message: text, consent: consentChoice === true, diagnostics: consentChoice === true ? diagnostics() : null }
      : { text, channelId: channelId || (state.conversation && state.conversation.channelId) || "" };
    try {
      const data = await post(path, payload);
      if (data.conversation) state = { ...state, ...data, conversation: data.conversation };
      else state = data.ok ? state : data;
      if (data.inbox) state.inbox = data.inbox;
      if (data.conversation) state.conversation = data.conversation;
      view = "chat";
      paint();
    } catch (err) {
      body.insertAdjacentHTML("beforeend", `<p class="tf-muted">${esc(err.message)}</p>`);
    }
  }

  root.querySelector(".tf-launcher").addEventListener("click", () => {
    root.classList.toggle("open");
    if (root.classList.contains("open")) {
      seen = ((state && state.conversation && state.conversation.messages) || []).length;
      badge.classList.remove("on");
      paint();
      refresh();
    }
  });
  root.querySelector(".tf-x").addEventListener("click", () => root.classList.remove("open"));
  root.querySelector(".tf-apps").addEventListener("click", () => {
    showMenu = !showMenu;
    view = "chat";
    paint();
  });
  form.addEventListener("submit", send);
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
    if (input.value.trim().startsWith(".")) {
      showMenu = true;
      view = "chat";
      paint();
      input.focus();
    }
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  body.addEventListener("click", async (event) => {
    const topicButton = event.target.closest("[data-topic]");
    if (topicButton) return openTopic(topicButton.dataset.topic);
    const jump = event.target.closest("[data-view-jump]");
    if (jump) {
      view = jump.dataset.viewJump;
      paint();
      return;
    }
    const tab = event.target.closest("[data-view]");
    if (tab) {
      view = tab.dataset.view;
      paint();
    }
    const ticket = event.target.closest("[data-channel]");
    if (ticket) {
      channelId = ticket.dataset.channel;
      view = "chat";
      const data = await post("/api/chat/thread", { channelId }).catch((err) => ({ error: err.message }));
      if (data && data.conversation) {
        state.conversation = data.conversation;
        paint();
      }
      return;
    }
    const command = event.target.closest("[data-command]");
    if (command) {
      input.value = command.dataset.command;
      showMenu = false;
      input.focus();
      return;
    }
    const walk = event.target.closest("[data-walk]");
    if (walk) {
      const data = await post("/api/chat/walk", { action: walk.dataset.walk, channelId }).catch((err) => ({ error: err.message }));
      if (data && data.cards) {
        state.conversation = state.conversation || { messages: [] };
        state.conversation.messages.push({ author: "TeachForth", side: "card", text: "", cards: data.cards });
        paint();
      }
      return;
    }
    const consent = event.target.closest("[data-consent]");
    if (consent) {
      const allow = consent.dataset.consent === "yes";
      consentChoice = allow;
      showConsent = false;
      if (!(state.conversation && state.conversation.open)) {
        paint();
        if (input.value.trim()) form.requestSubmit();
        return;
      }
      const data = await post("/api/chat/diagnostics", {
        consent: allow,
        diagnostics: allow ? diagnostics() : null,
        channelId: channelId || (state.conversation && state.conversation.channelId) || "",
      }).catch((err) => ({ error: err.message }));
      if (data && data.conversation) {
        state = { ...state, ...data };
        paint();
      } else if (data && data.error) {
        body.insertAdjacentHTML("afterbegin", `<p class="tf-muted">${esc(data.error)}</p>`);
      } else {
        refresh();
      }
    }
  });
  tabs.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-view]");
    if (!tab) return;
    view = tab.dataset.view;
    paint();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") root.classList.remove("open");
  });

  paint();
  refresh();
  timer = window.setInterval(refresh, 8000);
  window.TeachForthChat = { open: () => { root.classList.add("open"); refresh(); } };
  void panel;
  void timer;
})();
