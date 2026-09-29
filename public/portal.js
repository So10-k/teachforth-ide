export async function renderPortal({ section, main, me, api, esc, ago, powerUrl }) {
  const id = Number(location.hash.split("/")[2] || 0);
  if (section === "chapters") return chaptersPage(main, me, api, esc);
  if (section === "chapter") return chapterPage(main, id, me, api, esc);
  if (section === "students") return studentsPage(main, api, esc);
  if (section === "people") return peoplePage(main, me, api, esc);
  if (section === "person" || section === "student" || section === "folder") return personPage(main, id, me, api, esc, ago);
  if (section === "accounts" || section === "studio") return accountsPage(main, api, esc, powerUrl);
  if (section === "roster") return pairingPage(main, api, esc);
  if (section === "sandbox") return sandboxPage(main, me, api, esc, ago);
  if (section === "github") return githubPage(main, me, api, esc);
  if (section === "center") return centerPage(main, api, esc);
  return homePage(main, me, api, esc, powerUrl);
}

function page(title, sub, body) {
  return `<div class="portal"><header class="page-head"><div><h1>${title}</h1><p class="muted">${sub}</p></div></header>${body}</div>`;
}

async function homePage(main, me, api, esc, powerUrl) {
  if (me.role === "student") {
    const data = await api(`/api/folders/${me.id}`);
    main.innerHTML = page(
      `Hello, ${esc(me.name.split(" ")[0])}`,
      "Your work lives on GitHub. TeachForth only keeps a project while it is open.",
      `${profileHead(data, esc, false)}
       <div class="split">
         <section>${library(data, esc, true)}</section>
         <aside class="panel"><h2>GitHub</h2><p>${me.githubLogin ? `This account is <strong>@${esc(me.githubLogin)}</strong>.` : "Connect GitHub. That account becomes this TeachForth account."}</p>
           <a class="btn" href="#/github">${me.githubLogin ? "Repositories" : "Connect GitHub"}</a>
         </aside>
       </div>`,
    );
    bindProfiles(main);
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
        <article class="stat"><span>Live blocks</span><strong>${stats.liveBlocks}</strong></article>
        ${me.role === "admin" ? `<article class="stat"><span>Teachers</span><strong>${stats.teachers}</strong></article>` : ""}
      </div>
      <div class="split">
        <section><h2 class="unit">Live now</h2>${liveCards(home.live, esc) || `<p class="muted">Nothing is live. Book a block, promote a teacher to lead it, then start the session.</p>`}</section>
        <aside class="panel">
          <h2>Go to</h2>
          <div class="stack">
            ${me.role !== "student" ? `<a class="btn" href="#/people">People</a>` : ""}
            ${me.role === "admin" || me.role === "chapter_lead" ? `<a class="btn" href="#/chapters">Chapters</a><a class="btn" href="#/students">Students</a><a class="btn" href="#/roster">Pairing</a>` : ""}
            ${me.role === "teacher" ? `<a class="btn" href="#/students">My students</a><a class="btn" href="#/sandbox">Sandbox</a>` : ""}
            ${me.role === "admin" ? `<a class="btn" href="#/accounts">Accounts</a><a class="btn" href="${esc(powerUrl)}">Power panel</a>` : ""}
          </div>
        </aside>
      </div>
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
    `${me.role === "admin" ? `<section class="panel"><h2>New chapter</h2><div class="row"><input id="chapter-name" placeholder="Chapter name"><input id="chapter-place" placeholder="City or country"><button class="btn" id="add-chapter">Create</button></div><p class="error" id="err"></p></section>` : ""}
     <input class="search" id="q" placeholder="Search chapters">
     <div class="cards" id="list">${chapters.map((chapter) => chapterCard(chapter, esc)).join("") || `<p class="muted">No chapters yet.</p>`}</div>`,
  );
  const all = chapters;
  const paint = () => {
    const q = document.querySelector("#q").value.trim().toLowerCase();
    const rows = all.filter((chapter) => !q || `${chapter.name} ${chapter.place || ""}`.toLowerCase().includes(q));
    document.querySelector("#list").innerHTML = rows.map((chapter) => chapterCard(chapter, esc)).join("") || `<p class="muted">No match.</p>`;
    bindChapters(main);
  };
  document.querySelector("#q").oninput = paint;
  bindChapters(main);
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
  const teachers = people.filter((person) => person.role === "teacher");
  const leadsPool = people.filter((person) => person.role === "chapter_lead");
  main.innerHTML = page(
    esc(chapter.name),
    esc(chapter.place || "No city yet"),
    `<div class="chips">${leads.map((lead) => `<span class="chip">Lead · ${esc(lead.name)}</span>`).join("") || `<span class="chip">No chapter lead</span>`}</div>
     <div class="split">
       <section class="panel"><h2>Leadership</h2>
         ${typeField("lead-q", "Type a chapter lead")}
         <button class="btn" id="add-lead">Assign lead</button>
         <h2>Add a person</h2>
         ${typeField("member-q", "Type a student or teacher")}
         <button class="btn" id="add-member">Add to chapter</button>
       </section>
       <section class="panel"><h2>Book a block</h2>
         <input id="block-name" placeholder="Saturday block">
         ${typeField("session-q", "Type the teacher who will lead this session")}
         <button class="btn" id="add-block">Book block</button>
         <p class="error" id="err"></p>
         <p class="muted">A session lead is a normal teacher, promoted for this block only.</p>
       </section>
     </div>
     <h2 class="unit">Students</h2>
     <div class="cards">${students.map((student) => personCard(student, esc)).join("") || `<p class="muted">No students in this chapter yet.</p>`}</div>
     <h2 class="unit">Blocks</h2>
     ${blocks.map((block) => blockCard(block, esc)).join("") || `<p class="muted">No blocks yet.</p>`}`,
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
}

async function studentsPage(main, api, esc) {
  main.innerHTML = page("Students", "Search by name, email, chapter, or GitHub.", `<input class="search" id="q" placeholder="Search students" autofocus><div class="cards" id="list"></div>`);
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
  const [{ users }, setup] = await Promise.all([api("/api/users"), api("/api/github/setup")]);
  main.innerHTML = page(
    "Accounts",
    "Create people here. Chapters, pairing, and sessions live on their own pages.",
    `<section class="panel"><h2>New account</h2><div class="row">
        <input id="name" placeholder="Name"><input id="email" placeholder="Email">
        <select id="role"><option value="student">Student</option><option value="teacher">Teacher</option><option value="chapter_lead">Chapter lead</option><option value="admin">Admin</option></select>
        <input id="password" placeholder="Password, 8+ characters"><button class="btn" id="create-user">Create</button>
      </div><p class="error" id="err"></p></section>
      <input class="search" id="q" placeholder="Search accounts">
      <table><tbody id="user-rows">${userRows(users, esc)}</tbody></table>
      <section class="panel"><h2>GitHub for students</h2>
        <p>Students link their own GitHub. TeachForth commits only when the student closes a project, using their account. Teachers cannot push.</p>
        <ol class="setup">
          <li>On GitHub, open Settings, Developer settings, OAuth Apps, New OAuth App.</li>
          <li>Homepage URL: <code>${esc(location.origin)}</code></li>
          <li>Authorization callback URL: <code>${esc(setup.callback)}</code></li>
          <li>Paste the client ID and secret here. The secret is stored on this server and is not shown again.</li>
        </ol>
        <div class="row"><input id="gh-id" placeholder="Client ID" value="${esc(setup.clientId)}"><input id="gh-secret" placeholder="${setup.configured ? "Secret saved. Paste a new one to replace it." : "Client secret"}" type="password"><button class="btn" id="save-gh">Save GitHub app</button></div>
        <p class="muted">${setup.configured ? "GitHub app is ready." : "GitHub is not ready yet."}</p>
        <p class="error" id="gh-err"></p>
      </section>
      <p><a class="btn" href="${esc(powerUrl)}">Power panel</a></p>`,
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
        <div class="row">
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
  if (!me.githubLogin) {
    main.innerHTML = page("GitHub", "Your TeachForth account becomes this GitHub account.", `${error}<a class="btn" href="/api/github/connect">Connect GitHub</a>`);
    return;
  }
  const [{ repos }, { projects }] = await Promise.all([
    api("/api/github/repos").catch(() => ({ repos: [] })),
    api("/api/projects"),
  ]);
  const face = me.githubAvatar ? `<img class="avatar lg" src="${esc(me.githubAvatar)}" alt="">` : "";
  main.innerHTML = page(
    "GitHub",
    `This TeachForth account is @${esc(me.githubLogin)}. Only public TeachForth- repositories are used. Closing one commits it.`,
    `${error}<div class="row">${face}<input id="repo-name" placeholder="New project name">${templateSelect("repo-lang")}<button class="btn" id="new-repo">Create {TeachForth} repository</button><button class="btn-ghost" id="sync">Sync</button></div><p class="error" id="err"></p>
     <div class="cards">${(projects.projects || []).map((project) => `<article class="card"><h3>${esc(project.title)}</h3><p class="muted">${project.open ? "Open for class" : "On GitHub"}</p><button class="btn" data-id="${project.id}">Open</button></article>`).join("") || `<p class="muted">No {TeachForth} projects yet.</p>`}</div>
     <h2 class="unit">Public TeachForth repositories</h2>
     ${(repos || []).map((repo) => `<p><a href="${esc(repo.url)}">${esc(repo.fullName)}</a></p>`).join("") || `<p class="muted">None yet. New ones are named TeachForth- and shown here as {TeachForth}.</p>`}`,
  );
  main.querySelector("#new-repo").onclick = async () => {
    try {
      const made = await api("/api/github/repos", { method: "POST", body: { title: main.querySelector("#repo-name").value, language: main.querySelector("#repo-lang").value } });
      location.hash = `#/project/${made.project.id}`;
    } catch (err) {
      main.querySelector("#err").textContent = err.message;
    }
  };
  main.querySelector("#sync").onclick = async () => {
    await api("/api/github/sync", { method: "POST", body: {} });
    const fresh = await api("/api/me");
    me.githubLogin = fresh.user.githubLogin;
    githubPage(main, fresh.user, api, esc);
  };
  for (const button of main.querySelectorAll("[data-id]")) {
    button.onclick = () => { location.hash = `#/project/${button.dataset.id}`; };
  }
}

async function centerPage(main, api, esc) {
  const data = await api("/api/center");
  const live = data.blocks.filter((block) => block.status === "live");
  main.innerHTML = page("Control center", "Students with a teacher in a live block.", liveCards(live, esc) || `<p class="muted">No live block. A chapter lead starts one from Pairing.</p>`);
  bindProfiles(main);
}

function liveCards(blocks, esc) {
  return blocks.map((block) => `<section class="panel"><h2>${esc(block.name)}</h2><p class="muted">${esc(block.chapterName || "")} · lead ${esc(block.leadName || "unassigned")}</p><div class="cards">${(block.students || []).map((student) => `<article class="card"><h3>${esc(student.name)}</h3><p>with ${esc(student.teacherName)}</p><p class="${student.focus ? "live-dot" : "muted"}">${student.focus ? `In ${esc(student.focus.file || "a file")}` : esc(student.latest?.title || "No project yet")}</p><button class="btn" data-student="${student.id}">Profile</button></article>`).join("") || `<p class="muted">No pairs yet.</p>`}</div></section>`).join("");
}

function chapterCard(chapter, esc) {
  return `<button class="card link" data-chapter="${chapter.id}"><h3>${esc(chapter.name)}</h3><p class="muted">${esc(chapter.place || "Chapter")}</p></button>`;
}

function personCard(student, esc) {
  return `<button class="card link" data-student="${student.id}"><span class="avatar">${esc((student.name || "?").slice(0, 1))}</span><h3>${esc(student.name)}</h3><p class="muted">${esc(student.email)}</p><p class="muted">${esc(student.chapters || student.chapter || "")}</p></button>`;
}

function blockCard(block, esc) {
  return `<section class="panel"><div class="row" style="justify-content:space-between"><h2>${esc(block.name)}</h2><span class="chip ${block.status === "live" ? "live" : ""}">${esc(block.status)}</span></div><p class="muted">Session lead ${esc(block.leadName || "not promoted")} · ${(block.pairs || []).length} pairs</p><div class="row">${block.status !== "live" ? `<button class="btn-ghost" data-live="${block.id}">Start</button>` : `<button class="btn-ghost" data-end="${block.id}">End</button>`}</div></section>`;
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

function library(data, esc, canOpen) {
  return `<h2 class="unit">Code library</h2><div class="cards">${(data.projects || []).map((project) => `<article class="card"><h3>${esc(project.title)}</h3><p class="muted">${project.kind === "github" ? (project.open ? "Open for class" : "Stored on GitHub") : esc(project.kind || "project")}</p>${canOpen ? `<button class="btn" data-id="${project.id}">Open</button>` : `<span class="muted">Open during a live session</span>`}</article>`).join("") || `<p class="muted">No projects yet.</p>`}</div>`;
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
  return `<select id="${id}"><option value="web">Web page</option><option value="python">Python</option><option value="javascript">JavaScript</option><option value="markdown">Markdown</option><option value="empty">Empty</option></select>`;
}

function roleName(role) {
  return { admin: "Admin", chapter_lead: "Chapter lead", teacher: "Teacher", student: "Student" }[role] || String(role || "").replaceAll("_", " ");
}

async function peoplePage(main, me, api, esc) {
  const { people } = await api("/api/people?scope=manage");
  main.innerHTML = page(
    "People",
    me.role === "admin" ? "Every account. Open one to change role, password, sandbox, or access." : "People you can open.",
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
  const reports = folder && staff ? `<aside><h2 class="unit">Session reports</h2>
      ${folder.canOpen ? `<section class="panel"><p class="muted">The student never sees this. The diff is their code since the previous report.</p><textarea id="report-body" placeholder="What did you work on?"></textarea><pre class="diff">${esc(folder.preview || "")}</pre><button class="btn" id="save-report">Save report</button></section>` : `<p class="muted">A new report can be written when this student is in a live session with you.</p>`}
      <div class="timeline">${(folder.reports || []).map((report) => `<article class="panel"><strong>${esc(report.authorName)}</strong> <span class="muted">${esc(String(report.createdAt).replace("T", " ").slice(0, 16))}</span><p>${esc(report.body)}</p><pre class="diff">${esc(report.diff)}</pre></article>`).join("") || `<p class="muted">No reports yet.</p>`}</div>
      ${folder.githubLogin && folder.canOpen && me.role !== "student" ? `<section class="panel"><h2>Start a repository</h2><p class="muted">This uses the student's GitHub account. Only the student can commit.</p><div class="row"><input id="repo-name" placeholder="Project name">${templateSelect("repo-lang")}<button class="btn" id="new-student-repo">Create</button></div><p class="error" id="repo-err"></p></section>` : ""}
    </aside>` : `<aside class="panel"><h2>Access</h2><p>${esc(profile.access)}</p>${person.role === "student" && me.id === person.id ? `<a class="btn" href="#/github">GitHub</a>` : ""}</aside>`;
  main.innerHTML = page("", "", `${head}<div class="split">${libraryBlock}${sandbox}${manage ? "" : ""}${reports}</div>${manage}`);
  main.querySelector(".page-head").hidden = true;
  bindProfiles(main);
  const save = main.querySelector("#save-report");
  if (save) save.onclick = async () => {
    await api(`/api/folders/${id}/reports`, { method: "POST", body: { body: main.querySelector("#report-body").value } });
    personPage(main, id, me, api, esc, ago);
  };
  const box = main.querySelector("#new-box");
  if (box) box.onclick = async () => {
    const made = await api("/api/sandbox", { method: "POST", body: { title: main.querySelector("#box-name").value || "Sandbox", language: main.querySelector("#box-lang").value, ownerId: person.id } });
    location.hash = `#/project/${made.project.id}`;
  };
  const repo = main.querySelector("#new-student-repo");
  if (repo) repo.onclick = async () => {
    try {
      const made = await api(`/api/folders/${id}/repos`, { method: "POST", body: { title: main.querySelector("#repo-name").value, language: main.querySelector("#repo-lang").value } });
      location.hash = `#/project/${made.project.id}`;
    } catch (err) {
      main.querySelector("#repo-err").textContent = err.message;
    }
  };
  const savePerson = main.querySelector("#save-person");
  if (savePerson) savePerson.onclick = async () => {
    try {
      await api(`/api/users/${id}`, { method: "PATCH", body: { name: main.querySelector("#person-name").value, email: main.querySelector("#person-email").value, role: main.querySelector("#person-role").value } });
      personPage(main, id, me, api, esc, ago);
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
}
