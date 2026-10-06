export async function renderData({ main, me, api, esc }) {
  if (me.role !== "admin") {
    main.innerHTML = `<div class="portal"><p class="error">Only an admin can open the database.</p></div>`;
    return;
  }
  const table = decodeURIComponent(location.hash.split("/")[2] || "");
  const q = new URLSearchParams(location.hash.split("?")[1] || "").get("q") || "";
  let data;
  try {
    data = table
      ? await api(`/api/db/tables/${encodeURIComponent(table)}?limit=40&q=${encodeURIComponent(q)}`)
      : await api("/api/db/tables");
  } catch (err) {
    main.innerHTML = `<div class="portal"><p class="error">${esc(err.message)}</p></div>`;
    return;
  }
  const names = table ? [] : data.tables;
  if (!table) {
    main.innerHTML = `<div class="portal">
      <header class="page-head"><div><h1>Database</h1><p class="muted">Class data. Passwords and tokens stay hidden.</p></div></header>
      <div class="cards">${names.map((item) => `<a class="card" href="#/data/${encodeURIComponent(item.name)}"><h3>${esc(item.name)}</h3><p class="muted">${item.columns.length} columns</p></a>`).join("")}</div>
      <section class="panel"><h2>SQL</h2><p class="muted">One statement. A change needs the confirm box.</p>
        <textarea id="sql" rows="4" placeholder="SELECT id, name, role FROM users"></textarea>
        <label class="check"><input id="sql-confirm" type="checkbox"> This statement should change data</label>
        <button class="btn" id="sql-run" type="button">Run</button>
        <pre id="sql-out" class="muted"></pre>
      </section>
    </div>`;
    main.querySelector("#sql-run").onclick = () => runSql(main, api);
    return;
  }
  const cols = data.columns.map((col) => col.name);
  main.innerHTML = `<div class="portal">
    <header class="page-head"><div><h1>${esc(table)}</h1><p class="muted">${data.total} rows. Secrets stay masked.</p></div>
      <div class="row"><a class="btn-ghost" href="#/data">Tables</a>
        <a class="btn-ghost" href="/api/db/tables/${encodeURIComponent(table)}/export?format=csv">CSV</a>
        <a class="btn-ghost" href="/api/db/tables/${encodeURIComponent(table)}/export?format=json">JSON</a></div>
    </header>
    <form class="form-row" id="find"><input id="q" value="${esc(q)}" placeholder="Search this table"><button class="btn" type="submit">Search</button></form>
    <section class="panel"><h2>Structure</h2><p class="muted">${data.columns.map((col) => `${esc(col.name)} ${esc(col.type || "")}${col.pk ? " pk" : ""}`).join(" · ")}</p></section>
    <div class="data-scroll"><table class="data-table"><thead><tr><th></th>${cols.map((col) => `<th>${esc(col)}</th>`).join("")}</tr></thead>
      <tbody>${data.rows.map((row) => `<tr data-rowid="${row._rowid}">${["", ...cols].map((col, i) => `<td>${esc(clip(i ? row[col] : "Edit"))}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${cols.length + 1}">No rows</td></tr>`}</tbody></table></div>
    <section class="panel" id="edit-box" hidden><h2 id="edit-title">Row</h2><div id="edit-fields"></div><p class="error" id="edit-err"></p><div class="row"><button class="btn" id="save-row" type="button">Save</button><button class="btn-ghost danger" id="delete-row" type="button">Delete</button></div></section>
    <section class="panel"><h2>Insert</h2><div class="stack">${cols.map((col) => `<label>${esc(col)}<input data-insert="${esc(col)}"></label>`).join("")}</div><button class="btn" id="insert-row" type="button">Insert</button><p class="error" id="insert-err"></p></section>
  </div>`;
  main.querySelector("#find").onsubmit = (event) => {
    event.preventDefault();
    location.hash = `#/data/${encodeURIComponent(table)}?q=${encodeURIComponent(main.querySelector("#q").value)}`;
  };
  for (const row of main.querySelectorAll("[data-rowid]")) {
    row.onclick = () => openRow(main, table, data, row.dataset.rowid, api, esc);
  }
  main.querySelector("#insert-row").onclick = () => insertRow(main, table, cols, api);
}

function clip(value) {
  const text = value == null ? "" : String(value);
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

function openRow(main, table, data, rowid, api, esc) {
  const row = data.rows.find((item) => String(item._rowid) === String(rowid));
  if (!row) return;
  const box = main.querySelector("#edit-box");
  box.hidden = false;
  main.querySelector("#edit-title").textContent = `Row ${rowid}`;
  const fields = Object.keys(row).filter((key) => key !== "_rowid");
  main.querySelector("#edit-fields").innerHTML = fields.map((key) => `<label>${esc(key)}<textarea data-field="${esc(key)}" rows="2">${esc(row[key] ?? "")}</textarea></label>`).join("");
  main.querySelector("#save-row").onclick = async () => {
    const values = {};
    for (const input of main.querySelectorAll("[data-field]")) values[input.dataset.field] = input.value;
    try {
      await api(`/api/db/tables/${encodeURIComponent(table)}/rows`, { method: "PATCH", body: { confirm: true, rowid: Number(rowid), values } });
      location.reload();
    } catch (err) {
      main.querySelector("#edit-err").textContent = err.message;
    }
  };
  main.querySelector("#delete-row").onclick = async () => {
    if (!confirm("Delete this row?")) return;
    try {
      await api(`/api/db/tables/${encodeURIComponent(table)}/rows`, { method: "DELETE", body: { confirm: true, rowid: Number(rowid) } });
      location.hash = `#/data/${encodeURIComponent(table)}`;
      location.reload();
    } catch (err) {
      main.querySelector("#edit-err").textContent = err.message;
    }
  };
}

async function insertRow(main, table, cols, api) {
  const values = {};
  for (const input of main.querySelectorAll("[data-insert]")) {
    if (input.value !== "") values[input.dataset.insert] = input.value;
  }
  try {
    await api(`/api/db/tables/${encodeURIComponent(table)}/rows`, { method: "POST", body: { confirm: true, values } });
    location.reload();
  } catch (err) {
    main.querySelector("#insert-err").textContent = err.message;
  }
}

async function runSql(main, api) {
  const out = main.querySelector("#sql-out");
  try {
    const result = await api("/api/db/query", {
      method: "POST",
      body: { sql: main.querySelector("#sql").value, confirm: main.querySelector("#sql-confirm").checked },
    });
    out.textContent = JSON.stringify(result.rows || result, null, 2).slice(0, 4000);
  } catch (err) {
    out.textContent = err.message;
  }
}
