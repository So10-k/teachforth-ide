export async function renderPortal({ section, main, me, api, esc, ago, powerUrl }) {
  const id = Number(location.hash.split("/")[2] || 0);
  if (section === "chapters") return chaptersPage(main, me, api, esc);
  if (section === "chapter") return chapterPage(main, id, me, api, esc);
  if (section === "students") return studentsPage(main, me, api, esc);
  if (section === "people") return peoplePage(main, me, api, esc);
  if (section === "person" || section === "student" || section === "folder") return personPage(main, id, me, api, esc, ago);
  if (section === "accounts" || section === "studio") return accountsPage(main, api, esc, powerUrl);
  if (section === "domains") return domainsPage(main, api, esc);
  if (section === "roster") return pairingPage(main, api, esc);
  if (section === "sandbox") return sandboxPage(main, me, api, esc, ago);
  if (section === "github") return githubPage(main, me, api, esc);
  if (section === "center") return centerPage(main, api, esc);
  return homePage(main, me, api, esc, powerUrl);
}

function page(title, sub, body) {
  return `<div class="portal"><header class="page-head"><div><h1>${title}</h1><p class="muted">${sub}</p></div></header>${body}</div>`;
}

function jumps(items) {
  return `<nav class="shortcut-row" aria-label="Go to">${items.filter(Boolean).map(([href, title, hint]) => `<a class="jump" href="${href}"><strong>${title}</strong><span>${hint}</span></a>`).join("")}</nav>`;
}

function homeJumps(me, powerUrl) {
  const items = [];
  if (me.role !== "student") items.push(["#/center", "Live class", "Who is paired right now"]);
  if (me.role === "teacher") {
    items.push(["#/students", "My students", "Open someone in your live block"]);
    items.push(["#/people", "Directory", "People you can open"]);
    items.push(["#/sandbox", "Sandbox", "Your code, not a student repo"]);
  }
  if (me.role === "admin" || me.role === "chapter_lead") {
    items.push(["#/students", "Students", "Search and open a profile"]);
    items.push(["#/people", "Directory", "Change a role or password"]);
    items.push(["#/chapters", "Chapters", "Sites, leads, and blocks"]);
    items.push(["#/roster", "Pairing", "Match a teacher to a student"]);
  }
  if (me.role === "admin") {
    items.push(["#/accounts", "Accounts", "Create a login"]);
    items.push(["#/domains", "Domains", "Serve the IDE on another name"]);
    items.push([powerUrl, "Power panel", "Start or stop the server"]);
  }
  return `<section class="goto"><h2 class="unit">Go to</h2>${jumps(items)}</section>`;
}

async function homePage(main, me, api, esc, powerUrl) {
  if (me.role === "student") {
    const data = await api(`/api/folders/${me.id}`);
    const publicRepos = me.githubLinked ? await publicRepoNames(api) : new Set();
    const linked = Boolean(me.githubLinked);
    const connectLabel = me.githubLogin ? "Link GitHub again" : "Connect GitHub";
    const callout = linked ? "" : `<section class="github-callout"><div><h2>GitHub is required</h2><p>${me.githubLogin ? `The link to @${esc(me.githubLogin)} stopped working. Link it again before you open or save a project.` : "Connect GitHub before class. That account becomes this TeachForth account, and every project is saved there."}</p></div><a class="btn" href="/api/github/connect">${connectLabel}</a></section>`;
    main.innerHTML = page(
      `Hello, ${esc(me.name.split(" ")[0])}`,
      linked ? `Projects are saved to @${esc(me.githubLogin)}. TeachForth only stores your code while it is open.` : "Connect GitHub first. A project cannot be saved without it.",
      `${callout}
       ${privateGate(publicRepos, data.projects, esc)}
       ${profileHead(data, esc, false)}
       <div class="row" style="justify-content:space-between;align-items:center"><h2 class="unit" style="margin:0">Your projects</h2><button class="btn" id="new-project" type="button">New project</button></div>
       <div class="split">
         <section>${library(data, esc, true, false, publicRepos)}</section>
         <aside class="panel"><h2>GitHub</h2><p>${linked ? `Connected as <strong>@${esc(me.githubLogin)}</strong>. This link is required.` : "Not connected. Students cannot save work until GitHub is linked."}</p>
           <div class="stack">
             <a class="btn" href="/api/github/connect">${connectLabel}</a>
             <a class="jump" href="#/github"><strong>Repositories</strong><span>Sync and open saved work</span></a>
           </div>
         </aside>
       </div>`,
    );
    bindProfiles(main);
    bindPrivate(main, api, () => homePage(main, me, api, esc, powerUrl));
    main.querySelector("#new-project").onclick = () => openNewProject(me, api, esc);
    return;
  }
  const home = await api("/api/home");
  const stats = home.stats;
  main.innerHTML = page(
    "Dashboard",
    "Chapters, live sessions, and the people in them.",
    `<div class="stats">
        <article class="stat"><span>Chapters</span><strong>${stats.chapters}</strong></article>
        <article class="stat"><span>Students</span><strong>${stats.students}</strong></article>
        <article class="stat"><span>Sessions</span><strong>${stats.liveBlocks}</strong></article>
        ${me.role === "admin" ? `<article class="stat"><span>Teachers</span><strong>${stats.teachers}</strong></article>` : ""}
      </div>
      ${homeJumps(me, esc(powerUrl))}
      <section><h2 class="unit">Live now</h2>${liveCards(home.live, esc) || `<p class="muted">Nothing is live. Book a block, promote a teacher to lead it, then start the session.</p>`}</section>
      ${home.chapters.length ? `<h2 class="unit">Chapters</h2><div class="cards">${home.chapters.map((chapter) => chapterCard(chapter, esc)).join("")}</div>` : ""}`,
  );
  bindChapters(main);
  bindProfiles(main);
}

async function chaptersPage(main, me, api, esc) {
  const { chapters } = await api("/api/chapters");
  main.innerHTML = page(
    "Chapters",
    "A chapter is a partner site. Open one for its students, blocks, and leads.",
    `${me.role === "admin" ? `<section class="panel form-card"><h2>New chapter</h2><div class="form-row"><label>Name<input id="chapter-name" placeholder="Chapter name"></label><label>Place<input id="chapter-place" placeholder="City or country"></label><button class="btn" id="add-chapter">Create</button></div><p class="error" id="err"></p></section>` : ""}
     <input class="search" id="q" placeholder="Search chapters">
     <div class="cards" id="list">${chapters.map((chapter) => chapterCard(chapter, esc, me.role === "admin")).join("") || `<p class="muted">No chapters yet.</p>`}</div>`,
  );
  const all = chapters;
  const paint = () => {
    const q = document.querySelector("#q").value.trim().toLowerCase();
    const rows = all.filter((chapter) => !q || `${chapter.name} ${chapter.place || ""}`.toLowerCase().includes(q));
    document.querySelector("#list").innerHTML = rows.map((chapter) => chapterCard(chapter, esc, me.role === "admin")).join("") || `<p class="muted">No match.</p>`;
    bindChapters(main);
    bindChapterDeletes(main, api, () => chaptersPage(main, me, api, esc));
  };
  document.querySelector("#q").oninput = paint;
  bindChapters(main);
  bindChapterDeletes(main, api, () => chaptersPage(main, me, api, esc));
  const add = document.querySelector("#add-chapter");
  if (add) add.onclick = async () => {
    try {
      await api("/api/chapters", { method: "POST", body: { name: document.querySelector("#chapter-name").value, place: document.querySelector("#chapter-place").value } });
      chaptersPage(main, me, api, esc);
    } catch (err) {
      document.querySelector("#err").textContent = err.message;
    }
  };
}

async function chapterPage(main, id, me, api, esc) {
  const [{ chapter, leads, members, blocks }, { people }] = await Promise.all([
    api(`/api/chapters/${id}`),
    api("/api/people"),
  ]);
  const students = members.filter((person) => person.role === "student");
  const chapterTeachers = members.filter((person) => person.role !== "student");
  const teachers = people.filter((person) => person.role === "teacher");
  const leadsPool = people.filter((person) => person.role === "chapter_lead");
  main.innerHTML = page(
    esc(chapter.name),
    esc(chapter.place || "No city yet"),
    `<div class="chips">${leads.map((lead) => `<span class="chip">Lead · ${esc(lead.name)}${me.role === "admin" ? `<button class="chip-x" data-drop-lead="${lead.id}" title="Remove lead">×</button>` : ""}</span>`).join("") || `<span class="chip">No chapter lead</span>`}</div>
     <div class="split">
       <section class="panel form-card"><h2>Leadership</h2>
         <label>Chapter lead${typeField("lead-q", "Type a chapter lead")}</label>
         <button class="btn" id="add-lead">Assign lead</button>
         <h2>Add a person</h2>
         <label>Student or teacher${typeField("member-q", "Type a student or teacher")}</label>
         <button class="btn" id="add-member">Add to chapter</button>
       </section>
       <section class="panel form-card"><h2>Book a block</h2>
         <label>Block<input id="block-name" placeholder="Saturday block"></label>
         <label>Session lead${typeField("session-q", "Type the teacher who will lead this session")}</label>
         <button class="btn" id="add-block">Book block</button>
         <p class="error" id="err"></p>
         <p class="muted">A session lead is a normal teacher, promoted for this block only.</p>
       </section>
     </div>
     <h2 class="unit">Students</h2>
     <div class="cards">${students.map((student) => `<div class="member-card">${personCard(student, esc)}<button class="btn-ghost danger" data-drop-member="${student.id}">Remove</button></div>`).join("") || `<p class="muted">No students in this chapter yet.</p>`}</div>
     <h2 class="unit">Teachers</h2>
     <div class="cards">${chapterTeachers.map((teacher) => `<div class="member-card">${personCard(teacher, esc)}<button class="btn-ghost danger" data-drop-member="${teacher.id}">Remove</button></div>`).join("") || `<p class="muted">No teachers in this chapter yet.</p>`}</div>
     <h2 class="unit">Blocks</h2>
     ${blocks.map((block) => blockCard(block, esc)).join("") || `<p class="muted">No blocks yet.</p>`}
     ${me.role === "admin" ? `<section class="panel"><h2>Remove this chapter</h2><p class="muted">People stay. Blocks, pairs, and chapter membership go with it. Session reports stay on the student.</p><button class="btn-ghost danger" id="delete-chapter">Delete chapter</button></section>` : ""}`,
  );
  const leadPick = bindTypeahead(main.querySelector("#lead-q"), leadsPool, esc);
  const memberPick = bindTypeahead(main.querySelector("#member-q"), people.filter((person) => person.role !== "admin"), esc);
  const sessionPick = bindTypeahead(main.querySelector("#session-q"), teachers, esc);
  main.querySelector("#add-lead").onclick = async () => {
    if (!leadPick.id) return;
    await api(`/api/chapters/${id}/staff`, { method: "POST", body: { userId: leadPick.id } });
    chapterPage(main, id, me, api, esc);
  };
  main.querySelector("#add-member").onclick = async () => {
    if (!memberPick.id) return;
    await api(`/api/chapters/${id}/members`, { method: "POST", body: { userId: memberPick.id } });
    chapterPage(main, id, me, api, esc);
  };
  main.querySelector("#add-block").onclick = async () => {
    try {
      await api("/api/blocks", {
        method: "POST",
        body: { chapterId: id, name: main.querySelector("#block-name").value, leadTeacherId: sessionPick.id || undefined },
      });
      chapterPage(main, id, me, api, esc);
    } catch (err) {
      main.querySelector("#err").textContent = err.message;
    }
  };
  bindProfiles(main);
  bindBlocks(main, api, () => chapterPage(main, id, me, api, esc));
  const dropChapter = main.querySelector("#delete-chapter");
  if (dropChapter) dropChapter.onclick = async () => {
    if (!confirm(`Delete ${chapter.name}? People stay. Blocks and memberships are removed.`)) return;
    await api(`/api/chapters/${id}`, { method: "DELETE" });
    location.hash = "#/chapters";
  };
  for (const button of main.querySelectorAll("[data-drop-lead]")) {
    button.onclick = async () => {
      await api(`/api/chapters/${id}/staff`, { method: "DELETE", body: { userId: Number(button.dataset.dropLead) } });
      chapterPage(main, id, me, api, esc);
    };
  }
  for (const button of main.querySelectorAll("[data-drop-member]")) {
    button.onclick = async () => {
      await api(`/api/chapters/${id}/members`, { method: "DELETE", body: { userId: Number(button.dataset.dropMember) } });
      chapterPage(main, id, me, api, esc);
    };
  }
}

async function studentsPage(main, me, api, esc) {
  main.innerHTML = page(me.role === "teacher" ? "My students" : "Students", "Search by name, email, chapter, or GitHub.", `<input class="search" id="q" placeholder="Search students" autofocus><div class="cards" id="list"></div>`);
  const paint = async () => {
    const q = document.querySelector("#q").value.trim();
    const { students } = await api(`/api/directory?q=${encodeURIComponent(q)}`);
    document.querySelector("#list").innerHTML = students.map((student) => personCard(student, esc)).join("") || `<p class="muted">No students match.</p>`;
    bindProfiles(main);
  };
  let timer = null;
  document.querySelector("#q").oninput = () => {
    clearTimeout(timer);
    timer = setTimeout(paint, 160);
  };
  paint();
}

async function profilePage(main, id, me, api, esc, ago) {
  const data = await api(`/api/folders/${id}`);
  const staff = me.role !== "student";
  main.innerHTML = page(
    "",
    "",
    `${profileHead(data, esc, staff)}
     <div class="split">
       <section>${library(data, esc, data.canOpen)}</section>
       ${staff ? `<aside><h2 class="unit">Session reports</h2>
         ${data.canOpen ? `<section class="panel"><p class="muted">The student never sees this. The diff is their code since the previous report.</p><textarea id="report-body" placeholder="What did you work on?"></textarea><pre class="diff">${esc(data.preview || "")}</pre><button class="btn" id="save-report">Save report</button></section>` : `<p class="muted">Reports are visible. A new report can be written when this student is in a live session with you.</p>`}
         <div class="timeline">${(data.reports || []).map((report) => `<article class="panel"><strong>${esc(report.authorName)}</strong> <span class="muted">${esc(String(report.createdAt).replace("T", " ").slice(0, 16))} ${esc(report.blockName || "")}</span><p>${esc(report.body)}</p><pre class="diff">${esc(report.diff)}</pre></article>`).join("") || `<p class="muted">No reports yet.</p>`}</div>
       </aside>` : `<aside class="panel"><h2>On GitHub</h2><p>${data.githubLogin ? `@${esc(data.githubLogin)}` : "Not linked yet."}</p>${me.id === data.student.id ? `<a class="btn" href="#/github">Manage GitHub</a>` : ""}</aside>`}
     </div>`,
  );
  main.querySelector(".page-head").hidden = true;
  bindProfiles(main);
  const save = main.querySelector("#save-report");
  if (save) save.onclick = async () => {
    await api(`/api/folders/${id}/reports`, { method: "POST", body: { body: main.querySelector("#report-body").value } });
    profilePage(main, id, me, api, esc, ago);
  };
}

async function accountsPage(main, api, esc, powerUrl) {
  const [{ users }, setup, discord] = await Promise.all([
    api("/api/users"),
    api("/api/github/setup"),
    api("/api/discord/setup").catch(() => ({ guildId: "", configured: false, reachable: false })),
  ]);
  main.innerHTML = page(
    "Accounts",
    "Create people here. Chapters, pairing, and sessions live on their own pages.",
    `<div class="admin-layout">
      <section>
        <div class="row spread"><h2 class="unit">Logins</h2><a class="btn-ghost" href="${esc(powerUrl)}">Power panel</a></div>
        <input class="search" id="q" placeholder="Search accounts">
        <div class="panel table-card"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead><tbody id="user-rows">${userRows(users, esc)}</tbody></table></div>
      </section>
      <div class="stack">
        <section class="panel form-card"><h2>New account</h2>
          <label>Name<input id="name" placeholder="Name"></label>
          <label>Email<input id="email" placeholder="Email"></label>
          <label>Role<select id="role"><option value="student">Student</option><option value="teacher">Teacher</option><option value="chapter_lead">Chapter lead</option><option value="admin">Admin</option></select></label>
          <label>Password<input id="password" placeholder="Password, 8+ characters"></label>
          <button class="btn" id="create-user">Create</button>
          <p class="error" id="err"></p>
        </section>
        <section class="panel form-card"><h2>GitHub for students</h2>
          <p>Students link their own GitHub. TeachForth commits only when the student closes a project, using their account. Teachers cannot push.</p>
          <ol class="setup">
            <li>On GitHub, open Settings, Developer settings, OAuth Apps, New OAuth App.</li>
            <li>Homepage URL: <code>${esc(location.origin)}</code></li>
            <li>Authorization callback URL: <code>${esc(setup.callback)}</code></li>
            <li>Paste the client ID and secret here. The secret is stored on this server and is not shown again.</li>
          </ol>
          <label>Client ID<input id="gh-id" placeholder="Client ID" value="${esc(setup.clientId)}"></label>
          <label>Client secret<input id="gh-secret" placeholder="${setup.configured ? "Secret saved. Paste a new one to replace it." : "Client secret"}" type="password"></label>
          <button class="btn" id="save-gh">Save GitHub app</button>
          <p class="muted">${setup.configured ? "GitHub app is ready." : "GitHub is not ready yet."}</p>
          <p class="error" id="gh-err"></p>
        </section>
        <section class="panel form-card"><h2>Discord</h2>
          <p>Link Discord from the account menu. The helper can start the class server, post sign-ins, and share a project link. It never posts code or passwords.</p>
          <label>Discord server ID<input id="discord-guild" placeholder="Leave blank until the server is chosen" value="${esc(discord.guildId || "")}" inputmode="numeric" autocomplete="off"></label>
          <button class="btn" id="save-discord" type="button">Save server ID</button>
          <p class="muted">${discord.reachable ? "Helper is reachable. Blank means commands are not limited to one server yet." : "Helper is not reachable from this server."}</p>
          <p class="error" id="discord-err"></p>
        </section>
        <section class="panel form-card"><h2>Authorized domains</h2>
          <p>Extra names that should open this IDE are on the Domains page.</p>
          <a class="btn-ghost" href="#/domains">Open domains</a>
        </section>
      </div>
    </div>`,
  );
  const all = users;
  document.querySelector("#q").oninput = () => {
    const q = document.querySelector("#q").value.trim().toLowerCase();
    const rows = all.filter((user) => !q || `${user.name} ${user.email} ${user.role}`.toLowerCase().includes(q));
    document.querySelector("#user-rows").innerHTML = userRows(rows, esc);
  };
  document.querySelector("#create-user").onclick = async () => {
    try {
      await api("/api/users", {
        method: "POST",
        body: {
          name: document.querySelector("#name").value,
          email: document.querySelector("#email").value,
          role: document.querySelector("#role").value,
          password: document.querySelector("#password").value,
        },
      });
      accountsPage(main, api, esc, powerUrl);
    } catch (err) {
      document.querySelector("#err").textContent = err.message;
    }
  };
  document.querySelector("#save-gh").onclick = async () => {
    try {
      await api("/api/github/setup", {
        method: "POST",
        body: { clientId: document.querySelector("#gh-id").value, clientSecret: document.querySelector("#gh-secret").value },
      });
      accountsPage(main, api, esc, powerUrl);
    } catch (err) {
      document.querySelector("#gh-err").textContent = err.message;
    }
  };
  document.querySelector("#save-discord").onclick = async () => {
    try {
      await api("/api/discord/setup", {
        method: "POST",
        body: { guildId: document.querySelector("#discord-guild").value.trim() },
      });
      accountsPage(main, api, esc, powerUrl);
    } catch (err) {
      document.querySelector("#discord-err").textContent = err.message;
    }
  };
}

async function domainsPage(main, api, esc) {
  const data = await api("/api/domains");
  main.innerHTML = page(
    "Domains",
    "A name here opens the same IDE. Point its A record at the class server first.",
    `<section class="panel form-card">
      <h2>Add a name</h2>
      <p>A record: <code>${esc(data.address)}</code>. Nginx on the class server serves the IDE for that name. This does not change samsprojects.xyz.</p>
      <label>Domain<input id="domain-name" placeholder="ide.school.edu" autocomplete="off"></label>
      <div class="actions">
        <button class="btn" id="add-domain" type="button">Add</button>
        <button class="btn-ghost" id="apply-domains" type="button">Apply</button>
      </div>
      <p class="error" id="domain-err"></p>
    </section>
    <div class="stack" id="domain-list">${domainRows(data.domains, esc)}</div>`,
  );
  const refresh = () => domainsPage(main, api, esc);
  main.querySelector("#add-domain").onclick = async () => {
    try {
      await api("/api/domains", { method: "POST", body: { domain: main.querySelector("#domain-name").value } });
      refresh();
    } catch (err) {
      main.querySelector("#domain-err").textContent = err.message;
    }
  };
  main.querySelector("#apply-domains").onclick = async () => {
    try {
      await api("/api/domains/apply", { method: "POST", body: {} });
      refresh();
    } catch (err) {
      main.querySelector("#domain-err").textContent = err.message;
    }
  };
  main.querySelector("#domain-list").onclick = async (event) => {
    const button = event.target.closest("[data-remove-domain]");
    if (!button) return;
    try {
      await api("/api/domains", { method: "DELETE", body: { domain: button.dataset.removeDomain } });
      refresh();
    } catch (err) {
      main.querySelector("#domain-err").textContent = err.message;
    }
  };
}

function domainRows(domains, esc) {
  if (!domains.length) return `<p class="muted">No extra names yet. The IDE still answers on its current address.</p>`;
  return domains.map((row) => `<section class="panel">
    <div class="row spread"><strong>${esc(row.domain)}</strong><button class="btn-ghost" type="button" data-remove-domain="${esc(row.domain)}">Remove</button></div>
    <p class="muted">${esc(domainNote(row))}</p>
  </section>`).join("");
}

function domainNote(row) {
  if (row.nginx === "not-installed") return "Saved here. The server helper is not installed yet, so nginx was not changed.";
  if (row.nginx === "failed") return row.detail || "Nginx was not changed.";
  if (row.cert === "issued") return "This name serves the IDE. The certificate is ready.";
  if (row.cert === "pending") return row.detail || "This name serves the IDE on HTTP. The certificate is waiting for DNS.";
  if (row.cert === "unavailable") return "This name serves the IDE on HTTP. certbot is not installed.";
  if (row.nginx === "applied") return "This name serves the IDE.";
  return row.detail || "Saved.";
}

async function pairingPage(main, api, esc) {
  const [{ blocks }, { people }] = await Promise.all([api("/api/blocks"), api("/api/people")]);
  const open = blocks.filter((block) => block.status !== "ended");
  const teachers = people.filter((person) => person.role === "teacher");
  const students = people.filter((person) => person.role === "student");
  main.innerHTML = page(
    "Pairing",
    "Type a name. Pick the match. A teacher only sees the students you pair, and only while the block is live.",
    `${open.map((block, index) => `<section class="panel pair-card ${index === 0 ? "on" : ""}" data-block="${block.id}">
        <div class="row" style="justify-content:space-between"><h2>${esc(block.name)}</h2><span class="chip ${block.status === "live" ? "live" : ""}">${esc(block.status)}</span></div>
        <p class="muted">${esc(block.chapterName)} · session lead ${esc(block.leadName || "not promoted")}</p>
        <div class="pair-grid">
          <label>Teacher ${typeField(`t-${block.id}`, "Type a teacher")}</label>
          <label>Student ${typeField(`s-${block.id}`, "Type a student")}</label>
        </div>
        <div class="actions">
          <button class="btn" data-pair="${block.id}">Pair</button>
          <button class="btn-ghost" data-promote="${block.id}">Promote typed teacher to session lead</button>
          ${block.status !== "live" ? `<button class="btn-ghost" data-live="${block.id}">Start session</button>` : `<button class="btn-ghost" data-end="${block.id}">End session</button>`}
        </div>
        <div class="pair-list">${(block.pairs || []).map((pair) => `<div class="pair-row"><span class="avatar">${esc(pair.teacher_name.slice(0, 1))}</span><strong>${esc(pair.teacher_name)}</strong><span>with</span><span class="avatar">${esc(pair.student_name.slice(0, 1))}</span><strong>${esc(pair.student_name)}</strong><button class="btn-ghost" data-unpair="${block.id}" data-student-id="${pair.student_id}">Remove</button></div>`).join("") || `<p class="muted">No pairs yet.</p>`}</div>
      </section>`).join("") || `<p class="muted">No open block. Create one from the chapter page.</p>`}`,
  );
  const picks = new Map();
  for (const block of open) {
    picks.set(`t-${block.id}`, bindTypeahead(main.querySelector(`#t-${block.id}`), teachers, esc));
    picks.set(`s-${block.id}`, bindTypeahead(main.querySelector(`#s-${block.id}`), students, esc));
  }
  for (const button of main.querySelectorAll("[data-pair]")) {
    button.onclick = async () => {
      const id = button.dataset.pair;
      const teacherId = picks.get(`t-${id}`).id;
      const studentId = picks.get(`s-${id}`).id;
      if (!teacherId || !studentId) return;
      await api(`/api/blocks/${id}/pairs`, { method: "POST", body: { teacherId, studentId } });
      pairingPage(main, api, esc);
    };
  }
  for (const button of main.querySelectorAll("[data-promote]")) {
    button.onclick = async () => {
      const teacherId = picks.get(`t-${button.dataset.promote}`).id;
      if (!teacherId) return;
      await api(`/api/blocks/${button.dataset.promote}/lead`, { method: "POST", body: { teacherId } });
      pairingPage(main, api, esc);
    };
  }
  bindBlocks(main, api, () => pairingPage(main, api, esc));
  for (const button of main.querySelectorAll("[data-unpair]")) {
    button.onclick = async () => {
      await api(`/api/blocks/${button.dataset.unpair}/pairs`, { method: "DELETE", body: { studentId: Number(button.dataset.studentId) } });
      pairingPage(main, api, esc);
    };
  }
}

async function sandboxPage(main, me, api, esc, ago) {
  if (me.role !== "teacher") {
    main.innerHTML = page("Sandbox", "Teachers keep their own code here. Students use GitHub.", `<p class="muted">This page is for teachers.</p>`);
    return;
  }
  const data = await api("/api/catalog");
  main.innerHTML = page(
    "Sandbox",
    "Your code, stored here. It is not a student repository and it is not committed to GitHub.",
    `<div class="row"><input id="box-name" placeholder="Project name" value="Sandbox">${templateSelect("box-lang")}<button class="btn" id="new-box">New sandbox</button></div>
     ${data.sandboxes.map((project) => `<button class="lesson" data-id="${project.id}"><strong>${esc(project.title)}</strong><span class="when">${esc(ago(project.updatedAt))}</span></button>`).join("") || `<p class="muted">No sandbox yet.</p>`}`,
  );
  main.querySelector("#new-box").onclick = async () => {
    const title = main.querySelector("#box-name").value.trim() || "Sandbox";
    const language = main.querySelector("#box-lang").value;
    const made = await api("/api/sandbox", { method: "POST", body: { title, language } });
    location.hash = `#/project/${made.project.id}`;
  };
  for (const button of main.querySelectorAll("[data-id]")) {
    button.onclick = () => { location.hash = `#/project/${button.dataset.id}`; };
  }
}

async function githubPage(main, me, api, esc) {
  if (me.role !== "student") {
    main.innerHTML = page("GitHub", "Students link their own accounts.", `<p class="muted">Sign in as a student to link GitHub.</p>`);
    return;
  }
  const error = location.hash.includes("error=1") ? `<p class="error">GitHub did not connect. Ask an admin to check the OAuth app.</p>` : "";
  const connectLabel = me.githubLogin ? "Link GitHub again" : "Connect GitHub";
  const connect = `<a class="btn" href="/api/github/connect">${connectLabel}</a>`;
  if (!me.githubLinked) {
    main.innerHTML = page(
      "GitHub",
      me.githubLogin ? `The saved link to @${esc(me.githubLogin)} needs to be refreshed.` : "Your TeachForth account becomes this GitHub account. This is required.",
      `${error}<section class="github-callout"><div><h2>${connectLabel}</h2><p>Sync and new projects both need a working GitHub link. Use this button. Sync cannot do it for you.</p></div>${connect}</section>`,
    );
    return;
  }
  let repos = [];
  let repoError = "";
  try {
    repos = (await api("/api/github/repos")).repos || [];
  } catch (err) {
    repoError = err.message;
  }
  const { projects } = await api("/api/projects");
  const publicRepos = new Set(repos.filter((repo) => repo.private === false).map((repo) => repo.fullName));
  const face = me.githubAvatar ? `<img class="avatar lg" src="${esc(me.githubAvatar)}" alt="">` : "";
  main.innerHTML = page(
    "GitHub",
    `This TeachForth account is @${esc(me.githubLogin)}. Only TeachForth- repositories are used. New projects start from Home.`,
    `${error}<section class="panel"><div class="row">${face}<div><strong>@${esc(me.githubLogin)}</strong><p class="muted">Required to save and sync. If GitHub asks you to link again, use the button. It is always here.</p></div></div><div class="row">${connect}<button class="btn-ghost" id="sync" type="button">Sync</button></div><p class="error" id="err">${esc(repoError)}</p></section>
     ${privateGate(publicRepos, projects.projects, esc)}
     <div class="cards">${(projects.projects || []).map((project) => `<article class="card"><h3>${esc(project.title)}</h3><p class="muted">${project.open ? "Open for class" : "On GitHub"}</p>${publicRepos.has(project.githubRepo) ? privateButton(project.id, project.githubRepo, esc) : `<button class="btn" data-id="${project.id}">Open</button>`}</article>`).join("") || `<p class="muted">No {TeachForth} projects yet. Start one from Home.</p>`}</div>
     <h2 class="unit">TeachForth repositories</h2>
     ${(repos || []).map((repo) => `<p><a href="${esc(repo.url)}">${esc(repo.fullName)}</a>${repo.private ? "" : ` ${privateButton("", repo.fullName, esc)}`}</p>`).join("") || `<p class="muted">None yet. New ones are named TeachForth- and shown here as {TeachForth}.</p>`}`,
  );
  main.querySelector("#sync").onclick = async (event) => {
    const button = event.currentTarget;
    if (button.disabled) return;
    button.disabled = true;
    try {
      await api("/api/github/sync", { method: "POST", body: {} });
      const fresh = await api("/api/me");
      me.githubLogin = fresh.user.githubLogin;
      me.githubLinked = fresh.user.githubLinked;
      me.githubAvatar = fresh.user.githubAvatar;
      githubPage(main, fresh.user, api, esc);
    } catch (err) {
      main.querySelector("#err").textContent = err.message;
      button.disabled = false;
    }
  };
  bindPrivate(main, api, () => githubPage(main, me, api, esc));
  for (const button of main.querySelectorAll("[data-id]")) {
    button.onclick = () => { location.hash = `#/project/${button.dataset.id}`; };
  }
}

async function publicRepoNames(api) {
  try {
    const { repos } = await api("/api/github/repos");
    return new Set((repos || []).filter((repo) => repo.private === false).map((repo) => repo.fullName));
  } catch {
    return new Set();
  }
}

function privateButton(projectId, repo, esc) {
  return `<button class="btn" type="button" data-private="${projectId || ""}" data-repo="${esc(repo || "")}">Make private</button>`;
}

function privateGate(names, projects, esc) {
  if (!names?.size) return "";
  return `<section class="panel"><h2>Make private</h2><div class="stack">${[...names].map((name) => {
    const project = (projects || []).find((item) => item.githubRepo === name);
    return `<div class="row"><span>${esc(name)}</span>${privateButton(project?.id || "", name, esc)}</div>`;
  }).join("")}</div></section>`;
}

function bindPrivate(main, api, again) {
  for (const button of main.querySelectorAll("[data-private]")) {
    button.onclick = async () => {
      if (button.disabled) return;
      button.disabled = true;
      try {
        await api("/api/github/private", {
          method: "POST",
          body: { projectId: Number(button.dataset.private) || undefined, repo: button.dataset.repo || undefined },
        });
        again();
      } catch (err) {
        button.disabled = false;
        const note = document.createElement("p");
        note.className = "error";
        note.textContent = err.message;
        button.insertAdjacentElement("afterend", note);
        if (/link github/i.test(err.message)) {
          const link = document.createElement("a");
          link.className = "btn";
          link.href = "/api/github/connect";
          link.textContent = "Link GitHub again";
          note.insertAdjacentElement("afterend", link);
        }
      }
    };
  }
}

function openNewProject(me, api, esc) {
  document.querySelector(".backdrop")?.remove();
  document.querySelector(".modal")?.remove();
  const backdrop = document.createElement("div");
  backdrop.className = "backdrop";
  const modal = document.createElement("div");
  modal.className = "modal";
  const connectLabel = me.githubLogin ? "Link GitHub again" : "Connect GitHub";
  if (!me.githubLinked) {
    modal.innerHTML = `<h2>Connect GitHub first</h2><p>A project is a private repository on your GitHub account. Link that account, then create the project.</p><div class="row"><a class="btn" href="/api/github/connect">${connectLabel}</a><button class="btn-ghost" id="cancel" type="button">Cancel</button></div>`;
  } else {
    modal.innerHTML = `<h2>New project</h2><p class="muted">Creates a private {TeachForth} repository on @${esc(me.githubLogin)}.</p><label>Name<input id="repo-name" placeholder="Project name"></label><label>Type${templateSelect("repo-lang")}</label><p class="error" id="err"></p><div class="row"><button class="btn" id="create" type="button">Create</button><button class="btn-ghost" id="cancel" type="button">Cancel</button></div>`;
  }
  document.body.append(backdrop, modal);
  const close = () => { backdrop.remove(); modal.remove(); };
  backdrop.onclick = close;
  modal.querySelector("#cancel").onclick = close;
  modal.querySelector("#repo-name")?.focus();
  const create = modal.querySelector("#create");
  if (!create) return;
  create.onclick = async () => {
    if (create.disabled) return;
    create.disabled = true;
    try {
      const made = await api("/api/github/repos", { method: "POST", body: { title: modal.querySelector("#repo-name").value, language: modal.querySelector("#repo-lang").value } });
      close();
      location.hash = `#/project/${made.project.id}`;
    } catch (err) {
      const errEl = modal.querySelector("#err");
      errEl.textContent = err.message;
      if (/link github/i.test(err.message) && !modal.querySelector("a[href='/api/github/connect']")) {
        errEl.insertAdjacentHTML("afterend", `<p><a class="btn" href="/api/github/connect">Link GitHub again</a></p>`);
      }
      create.disabled = false;
    }
  };
}

async function centerPage(main, api, esc) {
  const data = await api("/api/center");
  const live = data.blocks.filter((block) => block.status === "live");
  main.innerHTML = page("Live class", "Students with a teacher in a live block.", liveCards(live, esc) || `<p class="muted">No live block. A chapter lead starts one from Pairing.</p>`);
  bindProfiles(main);
}

function liveCards(blocks, esc) {
  return blocks.map((block) => `<section class="panel"><h2>${esc(block.name)}</h2><p class="muted">${esc(block.chapterName || "")} · lead ${esc(block.leadName || "unassigned")}</p><div class="cards">${(block.students || []).map((student) => `<article class="card"><h3>${esc(student.name)}</h3><p>with ${esc(student.teacherName)}</p><p class="${student.focus ? "live-dot" : "muted"}">${student.focus ? `In ${esc(student.focus.file || "a file")}` : esc(student.latest?.title || "No project yet")}</p><button class="btn" data-student="${student.id}">Profile</button></article>`).join("") || `<p class="muted">No pairs yet.</p>`}</div></section>`).join("");
}

function chapterCard(chapter, esc, canDelete) {
  if (!canDelete) return `<button class="card link" data-chapter="${chapter.id}"><h3>${esc(chapter.name)}</h3><p class="muted">${esc(chapter.place || "Chapter")}</p></button>`;
  return `<article class="card chapter-card"><button class="card-open" data-chapter="${chapter.id}"><h3>${esc(chapter.name)}</h3><p class="muted">${esc(chapter.place || "Chapter")}</p></button><button class="btn-ghost danger" data-delete-chapter="${chapter.id}">Delete</button></article>`;
}

function personCard(student, esc) {
  return `<button class="card link" data-student="${student.id}"><span class="avatar">${esc((student.name || "?").slice(0, 1))}</span><h3>${esc(student.name)}</h3><p class="muted">${esc(student.email)}</p><p class="muted">${esc(student.chapters || student.chapter || "")}</p></button>`;
}

function blockCard(block, esc) {
  return `<section class="panel"><div class="row" style="justify-content:space-between"><h2>${esc(block.name)}</h2><span class="chip ${block.status === "live" ? "live" : ""}">${esc(block.status)}</span></div><p class="muted">Session lead ${esc(block.leadName || "not promoted")} · ${(block.pairs || []).length} pairs</p><div class="row">${block.status !== "live" ? `<button class="btn-ghost" data-live="${block.id}">Start</button>` : `<button class="btn-ghost" data-end="${block.id}">End</button>`}<button class="btn-ghost danger" data-delete-block="${block.id}">Delete</button></div></section>`;
}

function profileHead(data, esc, staff) {
  const student = data.student;
  return `<section class="profile">
    <div class="cover"></div>
    <div class="profile-row">
      <span class="avatar lg">${student.githubAvatar ? `<img src="${esc(student.githubAvatar)}" alt="">` : esc((student.name || "?").slice(0, 1))}</span>
      <div><h1>${esc(student.name)}</h1><p class="muted">${esc(student.email)}</p>
        <div class="chips">${data.chapter ? `<span class="chip">${esc(data.chapter.name)}</span>` : ""} ${data.githubLogin ? `<span class="chip">@${esc(data.githubLogin)}</span>` : `<span class="chip">GitHub not linked</span>`} ${staff && !data.canOpen ? `<span class="chip">Not in a live session</span>` : ""}</div>
      </div>
    </div>
  </section>`;
}

function library(data, esc, canOpen, heading = true, publicRepos = new Set()) {
  const title = heading ? `<h2 class="unit">Code library</h2>` : "";
  return `${title}<div class="cards">${(data.projects || []).map((project) => `<article class="card"><h3>${esc(project.title)}</h3><p class="muted">${project.kind === "github" ? (project.open ? "Open for class" : "Stored on GitHub") : esc(project.kind || "project")}</p>${projectAction(project, esc, canOpen, publicRepos)}</article>`).join("") || `<p class="muted">No projects yet.</p>`}</div>`;
}

function projectAction(project, esc, canOpen, publicRepos) {
  if (publicRepos?.has(project.githubRepo)) return privateButton(project.id, project.githubRepo, esc);
  return canOpen ? `<button class="btn" data-id="${project.id}">Open</button>` : `<span class="muted">Open during a live session</span>`;
}

function userRows(users, esc) {
  return users.map((user) => `<tr><td><a href="#/person/${user.id}">${esc(user.name)}</a></td><td>${esc(user.email)}</td><td>${esc(user.role.replaceAll("_", " "))}</td></tr>`).join("");
}

function typeField(id, placeholder) {
  return `<span class="typeahead"><input id="${id}" placeholder="${placeholder}" autocomplete="off"></span>`;
}

function bindTypeahead(input, people, esc) {
  const pick = { id: 0 };
  const box = document.createElement("div");
  box.className = "suggest";
  box.hidden = true;
  input.parentElement.append(box);
  const paint = () => {
    const q = input.value.trim().toLowerCase();
    const hits = people.filter((person) => !q || person.name.toLowerCase().includes(q) || person.email.toLowerCase().includes(q)).slice(0, 6);
    box.innerHTML = hits.map((person) => `<button type="button" data-id="${person.id}">${esc(person.name)} <span>${esc(person.email)}</span></button>`).join("") || `<p class="muted">No match</p>`;
    box.hidden = false;
    for (const button of box.querySelectorAll("button")) {
      button.onmousedown = (event) => {
        event.preventDefault();
        const person = people.find((item) => item.id === Number(button.dataset.id));
        pick.id = person.id;
        input.value = person.name;
        box.hidden = true;
      };
    }
  };
  input.oninput = () => {
    pick.id = 0;
    const exact = people.find((person) => person.name.toLowerCase() === input.value.trim().toLowerCase());
    if (exact) pick.id = exact.id;
    paint();
  };
  input.onfocus = paint;
  input.onblur = () => { setTimeout(() => { box.hidden = true; }, 120); };
  input.onkeydown = (event) => {
    if (event.key !== "Enter") return;
    const first = box.querySelector("button");
    if (!pick.id && first) {
      pick.id = Number(first.dataset.id);
      input.value = people.find((person) => person.id === pick.id)?.name || input.value;
    }
    box.hidden = true;
  };
  return pick;
}

function bindChapters(main) {
  for (const button of main.querySelectorAll("[data-chapter]")) {
    button.onclick = () => { location.hash = `#/chapter/${button.dataset.chapter}`; };
  }
}

function templateSelect(id) {
  return `<select id="${id}"><option value="web">Web page</option><option value="python">Python</option><option value="javascript">JavaScript</option><option value="java">Java</option><option value="c">C</option><option value="cpp">C++</option><option value="markdown">Markdown</option><option value="empty">Empty</option></select>`;
}

function roleName(role) {
  return { admin: "Admin", chapter_lead: "Chapter lead", teacher: "Teacher", student: "Student" }[role] || String(role || "").replaceAll("_", " ");
}

async function peoplePage(main, me, api, esc) {
  const { people } = await api("/api/people?scope=manage");
  main.innerHTML = page(
    "Directory",
    me.role === "admin" ? `Every account. Open one to change role, password, sandbox, or access. New logins are created in <a href="#/accounts">Accounts</a>.` : "People you can open.",
    `<input class="search" id="q" placeholder="Search by name, email, or role" autofocus><div class="cards" id="list"></div>`,
  );
  const paint = () => {
    const q = document.querySelector("#q").value.trim().toLowerCase();
    const rows = people.filter((person) => !q || `${person.name} ${person.email} ${person.role}`.toLowerCase().includes(q));
    document.querySelector("#list").innerHTML = rows.map((person) => `<button class="card link" data-person="${person.id}"><span class="avatar">${esc((person.name || "?").slice(0, 1))}</span><h3>${esc(person.name)}</h3><p class="muted">${esc(person.email)}</p><span class="chip">${esc(roleName(person.role))}</span></button>`).join("") || `<p class="muted">No match.</p>`;
    for (const button of main.querySelectorAll("[data-person]")) {
      button.onclick = () => { location.hash = `#/person/${button.dataset.person}`; };
    }
  };
  document.querySelector("#q").oninput = paint;
  paint();
}

async function personPage(main, id, me, api, esc, ago) {
  const profile = await api(`/api/people/${id}`);
  const person = profile.person;
  const folder = person.role === "student" ? await api(`/api/folders/${id}`).catch(() => null) : null;
  const staff = me.role !== "student";
  const pathway = staff && folder ? await api(`/api/folders/${id}/pathway`).catch(() => null) : null;
  const head = `<section class="profile"><div class="cover"></div><div class="profile-row">
      <span class="avatar lg">${person.githubAvatar ? `<img src="${esc(person.githubAvatar)}" alt="">` : esc((person.name || "?").slice(0, 1))}</span>
      <div><h1>${esc(person.name)}</h1><p class="muted">${esc(person.email)}</p>
        <div class="chips"><span class="chip">${esc(roleName(person.role))}</span>${profile.chapters.map((chapter) => `<span class="chip">${esc(chapter.name)}</span>`).join("")}${profile.staffChapters.map((chapter) => `<span class="chip">Leads ${esc(chapter.name)}</span>`).join("")}${person.githubLogin ? `<span class="chip">@${esc(person.githubLogin)}</span>` : ""}</div>
      </div>
    </div></section>`;
  const manage = profile.canManage ? `<section class="panel"><h2>Manage</h2>
      <div class="row"><input id="person-name" value="${esc(person.name)}"><input id="person-email" value="${esc(person.email)}">
        <select id="person-role">${["admin", "chapter_lead", "teacher", "student"].map((role) => `<option value="${role}" ${role === person.role ? "selected" : ""}>${esc(roleName(role))}</option>`).join("")}</select>
        <button class="btn" id="save-person">Save</button></div>
      <div class="row"><input id="new-password" placeholder="New password, 8+ characters"><button class="btn" id="reset-password">Reset password</button></div>
      <button class="btn-ghost" id="delete-person">Delete account</button>
      <p class="muted">Deleting removes their TeachForth login and sandboxes. GitHub repositories stay on GitHub.</p>
      <p class="error" id="manage-err"></p></section>` : "";
  const sandbox = person.role !== "student" ? `<section class="panel"><h2>Sandbox</h2>
      ${profile.canOpenSandbox ? `<div class="row"><input id="box-name" placeholder="New sandbox">${templateSelect("box-lang")}<button class="btn" id="new-box">Create</button></div>` : ""}
      <div class="cards">${profile.sandboxes.map((project) => `<article class="card"><h3>${esc(project.title)}</h3><p class="muted">${esc(project.language)}</p>${profile.canOpenSandbox ? `<button class="btn" data-id="${project.id}">Open</button>` : `<span class="muted">Only an admin or the owner can open this.</span>`}</article>`).join("") || `<p class="muted">No sandbox yet.</p>`}</div></section>` : "";
  const libraryBlock = folder ? `<section>${library(folder, esc, folder.canOpen)}</section>` : "";
  const reports = folder && staff ? "" : `<aside class="panel"><h2>Access</h2><p>${esc(profile.access)}</p>${person.role === "student" && me.id === person.id ? `<a class="btn" href="#/github">GitHub</a>` : ""}</aside>`;
  const studentView = person.role === "student" && folder;
  const publicRepos = me.role === "student" && me.id === person.id && me.githubLinked ? await publicRepoNames(api) : new Set();
  main.innerHTML = page("", "", studentView
    ? studentProfile({ profile, person, folder, pathway, staff, me, esc, manage, publicRepos })
    : `${head}${pathway ? pathwaySection(pathway, esc) : ""}<div class="split">${libraryBlock}${sandbox}${manage ? "" : ""}${reports}</div>${manage}`);
  main.querySelector(".page-head").hidden = true;
  if (studentView) bindProfileTabs(main, location.hash.split("/")[3] || "library");
  const reload = () => {
    const tab = main.querySelector("[data-profile-tab].on")?.dataset.profileTab;
    if (tab) history.replaceState(null, "", `#/person/${id}/${tab}`);
    personPage(main, id, me, api, esc, ago);
  };
  bindProfiles(main);
  bindPrivate(main, api, reload);
  bindPathway(main, id, api, reload);
  bindSkillRows(main, pathway, folder, esc);
  const save = main.querySelector("#save-report");
  if (save) save.onclick = async () => {
    const err = main.querySelector("#report-err");
    try {
      await api(`/api/folders/${id}/reports`, {
        method: "POST",
        body: { body: main.querySelector("#report-body").value, skills: skillPayload(main) },
      });
      reload();
    } catch (error) {
      if (err) err.textContent = error.message;
    }
  };
  const box = main.querySelector("#new-box");
  if (box) box.onclick = async () => {
    const made = await api("/api/sandbox", { method: "POST", body: { title: main.querySelector("#box-name").value || "Sandbox", language: main.querySelector("#box-lang").value, ownerId: person.id } });
    location.hash = `#/project/${made.project.id}`;
  };
  const repo = main.querySelector("#new-student-repo");
  if (repo) repo.onclick = async () => {
    if (repo.disabled) return;
    repo.disabled = true;
    try {
      const made = await api(`/api/folders/${id}/repos`, { method: "POST", body: { title: main.querySelector("#repo-name").value, language: main.querySelector("#repo-lang").value } });
      location.hash = `#/project/${made.project.id}`;
    } catch (err) {
      main.querySelector("#repo-err").textContent = err.message;
      repo.disabled = false;
    }
  };
  const savePerson = main.querySelector("#save-person");
  if (savePerson) savePerson.onclick = async () => {
    try {
      await api(`/api/users/${id}`, { method: "PATCH", body: { name: main.querySelector("#person-name").value, email: main.querySelector("#person-email").value, role: main.querySelector("#person-role").value } });
      reload();
    } catch (err) {
      main.querySelector("#manage-err").textContent = err.message;
    }
  };
  const reset = main.querySelector("#reset-password");
  if (reset) reset.onclick = async () => {
    try {
      await api(`/api/users/${id}/password`, { method: "POST", body: { password: main.querySelector("#new-password").value } });
      main.querySelector("#manage-err").textContent = "Password updated.";
    } catch (err) {
      main.querySelector("#manage-err").textContent = err.message;
    }
  };
  const remove = main.querySelector("#delete-person");
  if (remove) remove.onclick = async () => {
    if (!confirm(`Delete ${person.name}? Their GitHub repositories will stay on GitHub.`)) return;
    try {
      await api(`/api/users/${id}`, { method: "DELETE" });
      location.hash = "#/people";
    } catch (err) {
      main.querySelector("#manage-err").textContent = err.message;
    }
  };
}

function studentProfile({ profile, person, folder, pathway, staff, me, esc, manage, publicRepos = new Set() }) {
  const tabs = [
    ["library", "Library", (folder.projects || []).length],
    staff && pathway ? ["pathway", "Pathway", (pathway.courses || []).length] : null,
    staff ? ["reports", "Reports", (folder.reports || []).length] : null,
    profile.canManage ? ["account", "Account", ""] : null,
  ].filter(Boolean);
  const tabBar = tabs.length > 1 ? `<nav class="profile-tabs">${tabs.map(([id, label, count]) => `<button type="button" data-profile-tab="${id}">${label}${count === "" ? "" : ` <span>${count}</span>`}</button>`).join("")}</nav>` : "";
  const libraryPane = `<section data-profile-pane="library">
      <div class="row"><input id="library-search" placeholder="Search projects" aria-label="Search projects"></div>
      ${privateGate(publicRepos, folder.projects, esc)}
      <div id="library-list">${libraryRows(folder, esc, folder.canOpen, publicRepos)}</div>
      ${folder.githubLogin && folder.canOpen && me.role !== "student" ? `<section class="panel"><h2>Start a repository</h2><p class="muted">This uses the student's GitHub account. Only the student can commit.</p><div class="row"><input id="repo-name" placeholder="Project name">${templateSelect("repo-lang")}<button class="btn" id="new-student-repo">Create</button></div><p class="error" id="repo-err"></p></section>` : ""}
      ${person.id === me.id ? `<p><a class="btn" href="${me.githubLinked ? "#/github" : "/api/github/connect"}">${me.githubLinked ? "GitHub" : (person.githubLogin ? "Link GitHub again" : "Connect GitHub")}</a></p>` : ""}
    </section>`;
  const reportPane = staff ? `<section data-profile-pane="reports" hidden>
      ${folder.canOpen ? `<section class="panel"><h2>New report</h2><p class="muted">The student never sees this. The diff is code since the previous report.</p><textarea id="report-body" placeholder="What did you work on?"></textarea>
        <div id="skill-rows"></div><button class="btn-ghost" id="add-skill" type="button">Add skill</button>
        <details><summary>Code changes</summary><pre class="diff">${esc(folder.preview || "")}</pre></details>
        <button class="btn" id="save-report">Save report</button><p class="error" id="report-err"></p></section>` : `<p class="muted">A new report can be written when this student is in a live session with you.</p>`}
      <div class="timeline">${reportList(folder, esc)}</div>
    </section>` : "";
  const accountPane = profile.canManage ? `<section data-profile-pane="account" hidden>${manage}</section>` : "";
  return `${profileHeadHtml(person, profile, esc, staff, folder)}${tabBar}${libraryPane}${staff && pathway ? `<section data-profile-pane="pathway" hidden>${pathwaySection(pathway, esc)}</section>` : ""}${reportPane}${accountPane}`;
}

function profileHeadHtml(person, profile, esc, staff, folder) {
  return `<section class="profile"><div class="cover"></div><div class="profile-row">
      <span class="avatar lg">${person.githubAvatar ? `<img src="${esc(person.githubAvatar)}" alt="">` : esc((person.name || "?").slice(0, 1))}</span>
      <div><h1>${esc(person.name)}</h1><p class="muted">${esc(person.email)}</p>
        <div class="chips"><span class="chip">${esc(roleName(person.role))}</span>${profile.chapters.map((chapter) => `<span class="chip">${esc(chapter.name)}</span>`).join("")}${profile.staffChapters.map((chapter) => `<span class="chip">Leads ${esc(chapter.name)}</span>`).join("")}${person.githubLogin ? `<span class="chip">@${esc(person.githubLogin)}</span>` : ""}${staff && folder && !folder.canOpen ? `<span class="chip">Not in a live session</span>` : ""}</div>
      </div>
    </div></section>`;
}

function libraryRows(folder, esc, canOpen, publicRepos = new Set()) {
  return (folder.projects || []).map((project) => `<article class="lib-row" data-title="${esc((project.title || "").toLowerCase())}"><div><h3>${esc(project.title)}</h3><p class="muted">${project.kind === "github" ? (project.open ? "Open for class" : "On GitHub") : esc(project.kind || "project")}</p></div>${publicRepos?.has(project.githubRepo) ? privateButton(project.id, project.githubRepo, esc) : (canOpen ? `<button class="btn" data-id="${project.id}">Open</button>` : `<span class="muted">Live session</span>`)}</article>`).join("") || `<p class="muted">No projects yet.</p>`;
}

function reportList(folder, esc) {
  return (folder.reports || []).map((report) => {
    const when = esc(String(report.createdAt).replace("T", " ").slice(0, 16));
    const skills = (report.skills || []).map((skill) => `<span class="chip ${esc(skill.level)}">${esc(skill.moduleTitle)} · ${esc(skill.level)}</span>`).join("");
    return `<details class="panel report-row"><summary><strong>${esc(report.authorName)}</strong> <span class="muted">${when}</span> <span>${esc(String(report.body || "").slice(0, 72))}</span></summary><p>${esc(report.body)}</p><div class="chips">${skills}</div><pre class="diff">${esc(report.diff)}</pre></details>`;
  }).join("") || `<p class="muted">No reports yet.</p>`;
}

function bindProfileTabs(main, requested) {
  const buttons = [...main.querySelectorAll("[data-profile-tab]")];
  const panes = [...main.querySelectorAll("[data-profile-pane]")];
  const show = (id) => {
    const next = panes.some((pane) => pane.dataset.profilePane === id) ? id : "library";
    for (const button of buttons) button.classList.toggle("on", button.dataset.profileTab === next);
    for (const pane of panes) pane.hidden = pane.dataset.profilePane !== next;
    const search = main.querySelector("#library-search");
    if (next === "library" && search) search.focus();
  };
  for (const button of buttons) button.onclick = () => show(button.dataset.profileTab);
  show(requested);
  const search = main.querySelector("#library-search");
  if (search) search.oninput = () => {
    const q = search.value.trim().toLowerCase();
    for (const row of main.querySelectorAll(".lib-row")) row.hidden = Boolean(q) && !row.dataset.title.includes(q);
  };
}

function pathwaySection(pathway, esc) {
  const courses = new Set(pathway.courses || []);
  const checks = ["python", "java", "c"].map((course) => `<label class="check"><input type="checkbox" data-course value="${course}" ${courses.has(course) ? "checked" : ""}> ${course === "python" ? "Python" : course === "java" ? "Java" : "C"}</label>`).join("");
  const switcher = (pathway.pathways || []).map((board, index) => `<button type="button" class="course-tab ${index ? "" : "on"}" data-course-tab="${esc(board.course)}">${esc(board.name)}</button>`).join("");
  const boards = (pathway.pathways || []).map((board, index) => {
    const mods = board.units.flatMap((unit) => unit.modules || []);
    const count = (status) => mods.filter((mod) => mod.status === status).length;
    return `<section class="panel pathway" data-course-pane="${esc(board.course)}" ${index ? "hidden" : ""}>
      <div class="row"><h2>${esc(board.name)}</h2><span class="chip mastered">${count("mastered")} mastered</span><span class="chip practiced">${count("practiced")} practiced</span><span class="chip linked">${count("linked")} linked</span><label class="check"><input type="checkbox" class="progress-only"> Progress only</label></div>
      <input class="pathway-search" placeholder="Search modules" aria-label="Search ${esc(board.name)} modules">
      ${(board.units || []).map((unit) => `<details class="unit-block"><summary>${esc(unit.title)}</summary>
        ${(unit.modules || []).map((mod) => `<div class="mod-row" data-mod data-status="${esc(mod.status)}" data-title="${esc(mod.title.toLowerCase())}"><span>${esc(mod.title)}</span>${mod.focus ? `<span class="chip">${esc(mod.focus)}</span>` : ""}<span class="chip ${esc(mod.status)}">${esc(mod.status)}</span>${(mod.projects || []).map((project) => project.url ? `<a href="${esc(project.url)}">${esc(project.title)}</a>` : `<span class="muted">${esc(project.title)}</span>`).join("")}</div>`).join("")}
      </details>`).join("")}
    </section>`;
  }).join("");
  return `<section class="panel"><h2>Courses</h2><p class="muted">Assign one or more. Students never see this.</p><div class="row">${checks}<button class="btn" id="save-courses" type="button">Save courses</button></div><p class="error" id="course-err"></p></section>${switcher ? `<div class="tabs course-tabs">${switcher}</div>` : ""}${boards || `<section class="panel"><p class="muted">No course assigned yet.</p></section>`}`;
}

function bindPathway(main, id, api, again) {
  const save = main.querySelector("#save-courses");
  if (save) save.onclick = async () => {
    const err = main.querySelector("#course-err");
    try {
      await api(`/api/folders/${id}/courses`, {
        method: "POST",
        body: { courses: [...main.querySelectorAll("[data-course]:checked")].map((box) => box.value) },
      });
      again();
    } catch (error) {
      if (err) err.textContent = error.message;
    }
  };
  for (const button of main.querySelectorAll("[data-course-tab]")) {
    button.onclick = () => {
      for (const tab of main.querySelectorAll("[data-course-tab]")) tab.classList.toggle("on", tab === button);
      for (const pane of main.querySelectorAll("[data-course-pane]")) pane.hidden = pane.dataset.coursePane !== button.dataset.courseTab;
    };
  }
  for (const panel of main.querySelectorAll(".pathway")) {
    const apply = () => {
      const q = panel.querySelector(".pathway-search")?.value.trim().toLowerCase() || "";
      const only = panel.querySelector(".progress-only")?.checked;
      for (const row of panel.querySelectorAll("[data-mod]")) {
        const titleOk = !q || row.dataset.title.includes(q);
        const progressOk = !only || row.dataset.status !== "none";
        row.hidden = !(titleOk && progressOk);
      }
      for (const unit of panel.querySelectorAll(".unit-block")) {
        const visible = [...unit.querySelectorAll("[data-mod]")].some((row) => !row.hidden);
        unit.hidden = !visible;
        if ((q || only) && visible) unit.open = true;
      }
    };
    const search = panel.querySelector(".pathway-search");
    const only = panel.querySelector(".progress-only");
    if (search) search.oninput = apply;
    if (only) only.onchange = apply;
  }
}

function bindSkillRows(main, pathway, folder, esc) {
  const add = main.querySelector("#add-skill");
  if (!add || !pathway) return;
  const modules = (pathway.pathways || []).flatMap((board) => (board.units || []).flatMap((unit) => unit.modules || []));
  const seen = new Set();
  const options = modules.filter((mod) => {
    if (seen.has(mod.id)) return false;
    seen.add(mod.id);
    return true;
  });
  add.onclick = () => {
    const row = document.createElement("div");
    row.className = "row skill-row";
    const courses = pathway.courses || [];
    row.innerHTML = `<select class="skill-module">${options.map((mod) => `<option value="${esc(mod.id)}">${esc(mod.title)}</option>`).join("")}</select>
      <select class="skill-course">${courses.map((course) => `<option value="${esc(course)}">${esc(course)}</option>`).join("")}</select>
      <select class="skill-level"><option value="practiced">Practiced</option><option value="mastered">Mastered</option></select>
      <select class="skill-project"><option value="">No project</option>${(folder?.projects || []).map((project) => `<option value="${project.id}">${esc(project.title)}</option>`).join("")}</select>
      <button class="btn-ghost" type="button">Remove</button>`;
    row.querySelector("button").onclick = () => row.remove();
    main.querySelector("#skill-rows").append(row);
  };
}

function skillPayload(main) {
  return [...main.querySelectorAll(".skill-row")].map((row) => ({
    moduleId: row.querySelector(".skill-module").value,
    course: row.querySelector(".skill-course").value,
    level: row.querySelector(".skill-level").value,
    projectId: row.querySelector(".skill-project").value || null,
  })).filter((skill) => skill.moduleId && skill.course);
}

function bindProfiles(main) {
  for (const button of main.querySelectorAll("[data-student]")) {
    button.onclick = () => { location.hash = `#/person/${button.dataset.student}`; };
  }
  for (const button of main.querySelectorAll("[data-id]")) {
    button.onclick = () => { location.hash = `#/project/${button.dataset.id}`; };
  }
}

function bindBlocks(main, api, again) {
  for (const button of main.querySelectorAll("[data-live]")) {
    button.onclick = async () => {
      await api(`/api/blocks/${button.dataset.live}/status`, { method: "POST", body: { status: "live" } });
      again();
    };
  }
  for (const button of main.querySelectorAll("[data-end]")) {
    button.onclick = async () => {
      await api(`/api/blocks/${button.dataset.end}/status`, { method: "POST", body: { status: "ended" } });
      again();
    };
  }
  for (const button of main.querySelectorAll("[data-delete-block]")) {
    button.onclick = async () => {
      if (!confirm("Delete this block? Pairs go with it. Student reports stay.")) return;
      await api(`/api/blocks/${button.dataset.deleteBlock}`, { method: "DELETE" });
      again();
    };
  }
}

function bindChapterDeletes(main, api, again) {
  for (const button of main.querySelectorAll("[data-delete-chapter]")) {
    button.onclick = async (event) => {
      event.stopPropagation();
      const name = button.closest("article")?.querySelector("h3")?.textContent || "this chapter";
      if (!confirm(`Delete ${name}? People stay. Blocks and memberships are removed.`)) return;
      await api(`/api/chapters/${button.dataset.deleteChapter}`, { method: "DELETE" });
      again();
    };
  }
}
