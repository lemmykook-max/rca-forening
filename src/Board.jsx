import React, { useEffect, useState } from "react";
import { api, fmtDate, MONTHS, download } from "./api.js";
import { Modal } from "./Modal.jsx";

const TABS = [
  ["overblik", "Overblik"], ["medlemmer", "Medlemmer"], ["arrangementer", "Arrangementer"],
  ["dokumenter", "Dokumenter"], ["opgaver", "Opgaver"], ["aarshjul", "Årshjul"],
  ["viden", "Videnscenter"], ["log", "Log"],
];

export default function Board({ me }) {
  const [tab, setTab] = useState(() => window.location.hash.split("/")[2] || "overblik");
  const pick = (t) => { setTab(t); window.location.hash = "/bestyrelse/" + t; };
  return (
    <>
      <h1>Bestyrelsesrum</h1>
      <div className="tabs">
        {TABS.map(([k, l]) => <button key={k} className={tab === k ? "active" : ""} onClick={() => pick(k)}>{l}</button>)}
      </div>
      {tab === "overblik" && <Dashboard pick={pick} />}
      {tab === "medlemmer" && <Members me={me} />}
      {tab === "arrangementer" && <Crud {...EVENTS} />}
      {tab === "dokumenter" && <Crud {...DOCS} />}
      {tab === "opgaver" && <Crud {...TASKS} />}
      {tab === "aarshjul" && <YearWheel />}
      {tab === "viden" && <Crud {...ARTICLES} />}
      {tab === "log" && <AuditLog />}
    </>
  );
}

/* ---------- dashboard ---------- */
function Dashboard({ pick }) {
  const [d, setD] = useState(null); const [err, setErr] = useState("");
  useEffect(() => { api("admin/dashboard").then(setD).catch((e) => setErr(e.message)); }, []);
  if (err) return <div className="error">{err}</div>;
  if (!d) return <p className="muted">Indlæser …</p>;
  const c = d.counts;
  return (
    <>
      <div className="grid">
        <Stat n={c.active} label="Aktive medlemmer" onClick={() => pick("medlemmer")} />
        <Stat n={c.pending} label="Afventer godkendelse" warn={c.pending > 0} onClick={() => pick("medlemmer")} />
        <Stat n={c.unpaid} label={`Mangler kontingent ${new Date().getFullYear()}`} warn={c.unpaid > 0} onClick={() => pick("medlemmer")} />
        {c.deletion > 0 && <Stat n={c.deletion} label="Anmodninger om sletning (GDPR)" warn onClick={() => pick("medlemmer")} />}
      </div>
      <div className="grid section">
        <div className="card">
          <h3>Næste 60 dage i årshjulet</h3>
          {!d.upcoming.length ? <p className="muted">Intet planlagt.</p> : d.upcoming.map((r) => (
            <div key={r.id} className="wheel"><div className="item"><b>{r.title}</b><div className="muted small">{fmtDate(r.next)} · om {r.daysLeft} dage{r.owner ? ` · ${r.owner}` : ""}</div></div></div>
          ))}
        </div>
        <div className="card">
          <h3>Åbne opgaver</h3>
          {!d.tasks.length ? <p className="muted">Ingen åbne opgaver.</p> : d.tasks.map((t) => (
            <div key={t.id} style={{ marginBottom: 8 }}><b>{t.title}</b><div className="muted small">{t.owner || "Ingen ansvarlig"}{t.due_date ? ` · frist ${fmtDate(t.due_date)}` : ""}</div></div>
          ))}
        </div>
        <div className="card">
          <h3>Kommende arrangementer</h3>
          {!d.events.length ? <p className="muted">Ingen planlagt.</p> : d.events.map((e) => (
            <div key={e.id} style={{ marginBottom: 8 }}><b>{e.title}</b><div className="muted small">{fmtDate(e.starts_at, true)} · {e.signups} tilmeldt</div></div>
          ))}
        </div>
      </div>
    </>
  );
}
const Stat = ({ n, label, warn, onClick }) => (
  <button className="card" onClick={onClick} style={{ textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit", borderColor: warn ? "var(--terra)" : undefined }}>
    <div className="stat" style={{ color: warn ? "var(--terra)" : undefined }}>{n}</div>
    <div className="muted small">{label}</div>
  </button>
);

/* ---------- members ---------- */
function Members({ me }) {
  const [rows, setRows] = useState(null); const [filter, setFilter] = useState("alle"); const [search, setSearch] = useState("");
  const [edit, setEdit] = useState(null); const [err, setErr] = useState("");
  const [adding, setAdding] = useState(false); const [added, setAdded] = useState(null);
  const year = new Date().getFullYear();
  const load = () => api("admin/members").then(setRows).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  const patch = async (m, body) => { setErr(""); try { await api(`admin/members/${m.id}`, { method: "PATCH", body }); load(); } catch (e) { setErr(e.message); } };
  const remove = async (m) => {
    if (!confirm(`Slet ${m.name || m.email} permanent? Dette kan ikke fortrydes.`)) return;
    try { await api(`admin/members/${m.id}`, { method: "DELETE" }); setEdit(null); load(); } catch (e) { setErr(e.message); }
  };
  if (!rows) return <p className="muted">{err || "Indlæser …"}</p>;
  const shown = rows.filter((m) => {
    if (filter === "afventer" && m.status !== "pending") return false;
    if (filter === "ubetalt" && !(m.status === "active" && !(m.fee_paid_year >= year))) return false;
    if (filter === "sletning" && !m.deletion_requested_at) return false;
    if (filter === "bestyrelse" && m.role !== "board") return false;
    const s = search.toLowerCase();
    return !s || (m.name || "").toLowerCase().includes(s) || m.email.includes(s);
  });
  return (
    <>
      <div className="row" style={{ marginBottom: 14, justifyContent: "space-between" }}>
        <div className="row">
          {["alle", "afventer", "ubetalt", "sletning", "bestyrelse"].map((f) => (
            <button key={f} className={"btn small " + (filter === f ? "" : "ghost")} onClick={() => setFilter(f)}>{f[0].toUpperCase() + f.slice(1)}</button>
          ))}
        </div>
        <div className="row">
          <input placeholder="Søg navn eller e-mail" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 220 }} />
          <button className="btn ghost small" onClick={() => download("admin/members/export.csv", "rca-medlemmer.csv")}>Eksportér CSV</button>
          <button className="btn small" onClick={() => { setAdded(null); setAdding(true); }}>+ Tilføj medlem</button>
        </div>
      </div>
      {err && <div className="error">{err}</div>}
      <div className="table-wrap"><table>
        <thead><tr><th>Navn</th><th>Kontakt</th><th>Tilknytning</th><th>Status</th><th>Kontingent</th><th></th></tr></thead>
        <tbody>
          {!shown.length && <tr><td colSpan={6} className="empty">Ingen medlemmer i denne visning.</td></tr>}
          {shown.map((m) => (
            <tr key={m.id}>
              <td><b>{m.name || "—"}</b>{m.role === "board" && <> <span className="pill board">Bestyrelse</span></>}<div className="muted small">Indmeldt {fmtDate(m.created_at)}</div></td>
              <td>{m.email}<div className="muted small">{[m.phone, [m.postal_code, m.city].filter(Boolean).join(" ")].filter(Boolean).join(" · ")}</div></td>
              <td>{m.affiliation || <span className="muted">—</span>}</td>
              <td>
                <span className={"pill " + m.status}>{{ pending: "Afventer", active: "Aktiv", ended: "Udmeldt" }[m.status]}</span>
                {m.deletion_requested_at && <div className="small" style={{ color: "var(--terra)" }}>Ønsker sletning</div>}
              </td>
              <td>{m.fee_paid_year >= year ? <span className="pill">Betalt {m.fee_paid_year}</span> : <button className="btn small ghost" onClick={() => patch(m, { fee_paid_year: year })}>Markér betalt {year}</button>}</td>
              <td className="row">
                {m.status === "pending" && <button className="btn small" onClick={() => patch(m, { status: "active" })}>Godkend</button>}
                <button className="btn small ghost" onClick={() => setEdit(m)}>Redigér</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
      {adding && (
        <Modal onClose={() => setAdding(false)}>
          {added ? <Invite m={added} /> : (
            <>
              <h2>Tilføj medlem</h2>
              <p className="muted">Personen bliver oprettet som aktivt medlem. Bagefter opretter de selv en konto med samme e-mail og får adgang med det samme.</p>
              <AddMember onSave={async (body) => { const row = await api("admin/members", { method: "POST", body }); setAdded(row); load(); }} />
            </>
          )}
        </Modal>
      )}
      {edit && (
        <Modal onClose={() => setEdit(null)}>
          <h2>{edit.name || edit.email}</h2>
          <MemberEdit m={edit} me={me} onSave={async (body) => { await patch(edit, body); setEdit(null); }} onDelete={() => remove(edit)} />
        </Modal>
      )}
    </>
  );
}
function AddMember({ onSave }) {
  const [f, setF] = useState({ name: "", email: "", phone: "", postal_code: "", city: "", affiliation: "", role: "member", fee_paid_year: "" });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <form className="stack" onSubmit={async (e) => { e.preventDefault(); setErr(""); setBusy(true); try { await onSave(f); } catch (e2) { setErr(e2.message); } setBusy(false); }}>
      <div className="form-grid">
        <label>Navn<input required value={f.name} onChange={set("name")} /></label>
        <label>E-mail<input required type="email" value={f.email} onChange={set("email")} /></label>
        <label>Rolle<select value={f.role} onChange={set("role")}><option value="member">Medlem</option><option value="board">Bestyrelse</option></select></label>
        <label>Telefon<input value={f.phone} onChange={set("phone")} /></label>
        <label>Postnr.<input value={f.postal_code} onChange={set("postal_code")} /></label>
        <label>By<input value={f.city} onChange={set("city")} /></label>
        <label>Tilknytning<select value={f.affiliation} onChange={set("affiliation")}><option value="">Ikke oplyst</option>{["Adopteret", "Adoptivforælder", "Pårørende", "Fagperson / forsker", "Støttemedlem", "Andet"].map((a) => <option key={a}>{a}</option>)}</select></label>
        <label>Kontingent betalt for år<input type="number" value={f.fee_paid_year} onChange={set("fee_paid_year")} /></label>
      </div>
      <p className="muted small">Telefon, postnummer og by kan medlemmet selv udfylde, når de logger ind første gang.</p>
      {err && <div className="error">{err}</div>}
      <div><button className="btn" disabled={busy}>Opret medlem</button></div>
    </form>
  );
}
function Invite({ m }) {
  const url = window.location.origin + "/#/login";
  const subject = "Din adgang til RCA's foreningsplatform";
  const text = `Hej ${m.name.split(" ")[0]}\n\nDu er nu oprettet${m.role === "board" ? " som bestyrelsesmedlem" : " som medlem"} på RCA's foreningsplatform.\n\nGå ind på ${url}, vælg "Bliv medlem" og opret en konto med denne e-mail: ${m.email}\n\nNår du har bekræftet din e-mail og logget ind, har du adgang med det samme.\n\nVenlig hilsen\nRessourcecenter for Adopterede`;
  const [copied, setCopied] = useState(false);
  return (
    <>
      <h2>{m.name} er oprettet ✓</h2>
      <p>Send en besked til {m.email}, så de kan oprette deres login:</p>
      <textarea readOnly value={text} style={{ minHeight: 200 }} />
      <div className="row" style={{ marginTop: 12 }}>
        <a className="btn" href={`mailto:${m.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`}>Åbn i mail</a>
        <button className="btn ghost" onClick={() => { navigator.clipboard.writeText(text); setCopied(true); }}>{copied ? "Kopieret ✓" : "Kopiér tekst"}</button>
      </div>
    </>
  );
}
function MemberEdit({ m, me, onSave, onDelete }) {
  const [f, setF] = useState(m);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); const { name, phone, postal_code, city, affiliation, role, status, fee_paid_year, notes } = f; onSave({ name, phone, postal_code, city, affiliation, role, status, fee_paid_year: fee_paid_year ? Number(fee_paid_year) : null, notes }); }}>
      <div className="form-grid">
        <label>Navn<input value={f.name || ""} onChange={set("name")} /></label>
        <label>Telefon<input value={f.phone || ""} onChange={set("phone")} /></label>
        <label>Postnr.<input value={f.postal_code || ""} onChange={set("postal_code")} /></label>
        <label>By<input value={f.city || ""} onChange={set("city")} /></label>
        <label>Status<select value={f.status} onChange={set("status")}><option value="pending">Afventer</option><option value="active">Aktiv</option><option value="ended">Udmeldt</option></select></label>
        <label>Rolle<select value={f.role} onChange={set("role")} disabled={m.id === me.id}><option value="member">Medlem</option><option value="board">Bestyrelse</option></select></label>
        <label>Kontingent betalt for år<input type="number" value={f.fee_paid_year || ""} onChange={set("fee_paid_year")} /></label>
      </div>
      <label>Interne noter (kun bestyrelsen – undgå følsomme oplysninger)<textarea value={f.notes || ""} onChange={set("notes")} /></label>
      <p className="muted small">Privatlivspolitik accepteret: {fmtDate(m.privacy_accepted_at, true) || "—"}{m.deletion_requested_at ? ` · Sletning anmodet ${fmtDate(m.deletion_requested_at)}` : ""}</p>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <button className="btn">Gem</button>
        {m.id !== me.id && <button type="button" className="btn danger" onClick={onDelete}>Slet permanent</button>}
      </div>
    </form>
  );
}

/* ---------- generic CRUD ---------- */
const EVENTS = {
  resource: "events", title: "Arrangementer", newLabel: "Nyt arrangement",
  fields: [
    { k: "title", l: "Titel", req: true }, { k: "starts_at", l: "Tidspunkt", type: "datetime-local", req: true },
    { k: "location", l: "Sted" }, { k: "online_url", l: "Online-link" }, { k: "capacity", l: "Max deltagere", type: "number" },
    { k: "visibility", l: "Synlighed", type: "select", opts: [["members", "Kun medlemmer"], ["public", "Offentligt"]], def: "members" },
    { k: "description", l: "Beskrivelse", type: "textarea", wide: true },
  ],
  cols: [["title", "Titel"], ["starts_at", "Tidspunkt", (v) => fmtDate(v, true)], ["location", "Sted"], ["visibility", "Synlighed", (v) => (v === "public" ? "Offentligt" : "Medlemmer")]],
  extra: (row) => <Signups id={row.id} />,
};
const DOCS = {
  resource: "documents", title: "Dokumenter", newLabel: "Nyt dokument",
  intro: "Link til referater, vedtægter m.m. i Google Drive-mappen “RessourceCenter for Adopterede RCA”, eller skriv teksten direkte.",
  fields: [
    { k: "title", l: "Titel", req: true }, { k: "doc_date", l: "Dato", type: "date" },
    { k: "category", l: "Type", type: "select", opts: [["referat", "Referat"], ["vedtægter", "Vedtægter"], ["regnskab", "Regnskab"], ["politik", "Politik"], ["andet", "Andet"]], def: "referat" },
    { k: "visibility", l: "Hvem kan se det", type: "select", opts: [["board", "Kun bestyrelsen"], ["members", "Alle medlemmer"]], def: "board" },
    { k: "url", l: "Link (fx Google Drive)", wide: true }, { k: "body", l: "Tekst / resumé", type: "textarea", wide: true },
  ],
  cols: [["title", "Titel", (v, r) => (r.url ? <a href={r.url} target="_blank" rel="noreferrer">{v}</a> : v)], ["category", "Type"], ["doc_date", "Dato", (v) => fmtDate(v)], ["visibility", "Synlighed", (v) => (v === "members" ? "Medlemmer" : "Bestyrelsen")]],
};
const TASKS = {
  resource: "tasks", title: "Opgaver", newLabel: "Ny opgave",
  fields: [
    { k: "title", l: "Opgave", req: true }, { k: "owner", l: "Ansvarlig" }, { k: "due_date", l: "Frist", type: "date" },
    { k: "status", l: "Status", type: "select", opts: [["todo", "Ikke startet"], ["doing", "I gang"], ["done", "Færdig"]], def: "todo" },
    { k: "notes", l: "Noter", type: "textarea", wide: true },
  ],
  cols: [["title", "Opgave"], ["owner", "Ansvarlig"], ["due_date", "Frist", (v) => {
    if (!v) return "";
    const late = new Date(v) < new Date(new Date().toDateString());
    return <span style={{ color: late ? "#a33" : undefined }}>{fmtDate(v)}</span>;
  }], ["status", "Status", (v) => <span className={"pill " + (v === "done" ? "ended" : v === "doing" ? "" : "pending")}>{{ todo: "Ikke startet", doing: "I gang", done: "Færdig" }[v]}</span>]],
  quick: (row, save) => row.status !== "done" && <button className="btn small ghost" onClick={() => save(row, { status: "done" })}>Færdig ✓</button>,
};
const ARTICLES = {
  resource: "articles", title: "Videnscenter", newLabel: "Ny artikel / ressource",
  fields: [
    { k: "title", l: "Titel", req: true }, { k: "tags", l: "Emner (kommasepareret)" },
    { k: "visibility", l: "Hvem kan læse", type: "select", opts: [["public", "Alle"], ["members", "Kun medlemmer"]], def: "public" },
    { k: "published", l: "Udgivet", type: "checkbox" }, { k: "source_url", l: "Kilde-link", wide: true },
    { k: "summary", l: "Kort resumé", type: "textarea", wide: true }, { k: "body", l: "Tekst", type: "textarea", wide: true },
  ],
  cols: [["title", "Titel"], ["tags", "Emner"], ["visibility", "Synlighed", (v) => (v === "public" ? "Alle" : "Medlemmer")], ["published", "Udgivet", (v) => (v ? "Ja" : "Kladde")]],
};

const toInput = (f, v) => {
  if (v == null) return f.type === "checkbox" ? false : "";
  if (f.type === "datetime-local") { const d = new Date(v); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
  if (f.type === "date") return String(v).slice(0, 10);
  return v;
};
const fromInput = (f, v) => {
  if (f.type === "datetime-local") return v ? new Date(v).toISOString() : null;
  if (f.type === "number") return v === "" ? null : Number(v);
  return v;
};

function Crud({ resource, newLabel, fields, cols, intro, extra, quick }) {
  const [rows, setRows] = useState(null); const [edit, setEdit] = useState(null); const [err, setErr] = useState("");
  const load = () => api(`admin/${resource}`).then(setRows).catch((e) => setErr(e.message));
  useEffect(() => { setRows(null); load(); }, [resource]);
  const save = async (row, body) => {
    setErr("");
    try {
      if (row?.id) await api(`admin/${resource}/${row.id}`, { method: "PATCH", body });
      else await api(`admin/${resource}`, { method: "POST", body });
      setEdit(null); load();
    } catch (e) { setErr(e.message); }
  };
  const del = async (row) => {
    if (!confirm(`Slet “${row.title}”?`)) return;
    await api(`admin/${resource}/${row.id}`, { method: "DELETE" }); setEdit(null); load();
  };
  const blank = Object.fromEntries(fields.map((f) => [f.k, f.def ?? (f.type === "checkbox" ? false : "")]));
  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
        <p className="muted" style={{ margin: 0 }}>{intro}</p>
        <button className="btn" onClick={() => setEdit(blank)}>+ {newLabel}</button>
      </div>
      {err && <div className="error">{err}</div>}
      {!rows ? <p className="muted">Indlæser …</p> : (
        <div className="table-wrap"><table>
          <thead><tr>{cols.map(([k, l]) => <th key={k}>{l}</th>)}<th></th></tr></thead>
          <tbody>
            {!rows.length && <tr><td colSpan={cols.length + 1} className="empty">Intet endnu.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                {cols.map(([k, , fmt]) => <td key={k}>{fmt ? fmt(r[k], r) : r[k]}</td>)}
                <td className="row" style={{ justifyContent: "flex-end" }}>{quick && quick(r, save)}<button className="btn small ghost" onClick={() => setEdit(r)}>Åbn</button></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      {edit && (
        <Modal onClose={() => setEdit(null)}>
          <h2>{edit.id ? edit.title : newLabel}</h2>
          <CrudForm fields={fields} row={edit} onSave={(body) => save(edit, body)} onDelete={edit.id ? () => del(edit) : null} />
          {edit.id && extra && <div className="section">{extra(edit)}</div>}
        </Modal>
      )}
    </>
  );
}
function CrudForm({ fields, row, onSave, onDelete }) {
  const [f, setF] = useState(() => Object.fromEntries(fields.map((x) => [x.k, toInput(x, row[x.k])])));
  const set = (k, type) => (e) => setF({ ...f, [k]: type === "checkbox" ? e.target.checked : e.target.value });
  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); onSave(Object.fromEntries(fields.map((x) => [x.k, fromInput(x, f[x.k])]))); }}>
      <div className="form-grid">
        {fields.filter((x) => !x.wide && x.type !== "textarea").map((x) => <Field key={x.k} x={x} v={f[x.k]} on={set(x.k, x.type)} />)}
      </div>
      {fields.filter((x) => x.wide || x.type === "textarea").map((x) => <Field key={x.k} x={x} v={f[x.k]} on={set(x.k, x.type)} />)}
      <div className="row" style={{ justifyContent: "space-between" }}>
        <button className="btn">Gem</button>
        {onDelete && <button type="button" className="btn danger" onClick={onDelete}>Slet</button>}
      </div>
    </form>
  );
}
function Field({ x, v, on }) {
  if (x.type === "checkbox") return <label className="check" style={{ alignSelf: "end" }}><input type="checkbox" checked={!!v} onChange={on} />{x.l}</label>;
  if (x.type === "select") return <label>{x.l}<select value={v} onChange={on}>{x.opts.map(([val, lab]) => <option key={val} value={val}>{lab}</option>)}</select></label>;
  if (x.type === "textarea") return <label>{x.l}<textarea value={v} onChange={on} /></label>;
  return <label>{x.l}<input type={x.type || "text"} required={x.req} value={v} onChange={on} /></label>;
}
function Signups({ id }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { api(`admin/events/${id}/signups`).then(setRows).catch(() => setRows([])); }, [id]);
  if (!rows) return null;
  return (
    <>
      <h3>Tilmeldte ({rows.length})</h3>
      {!rows.length ? <p className="muted">Ingen endnu.</p> : (
        <>
          <ul>{rows.map((r) => <li key={r.email}>{r.name} · <span className="muted">{r.email}</span></li>)}</ul>
          <button className="btn ghost small" onClick={() => navigator.clipboard.writeText(rows.map((r) => r.email).join(", "))}>Kopiér e-mails</button>
        </>
      )}
    </>
  );
}

/* ---------- year wheel ---------- */
const WHEEL_FIELDS = [
  { k: "title", l: "Aktivitet", req: true },
  { k: "month", l: "Måned", type: "select", opts: MONTHS.map((m, i) => [String(i + 1), m[0].toUpperCase() + m.slice(1)]), def: "1" },
  { k: "day", l: "Dag (valgfri)", type: "number" }, { k: "owner", l: "Ansvarlig" },
  { k: "description", l: "Beskrivelse", type: "textarea", wide: true },
];
function YearWheel() {
  const [rows, setRows] = useState(null); const [edit, setEdit] = useState(null);
  const load = () => api("admin/year-wheel").then(setRows);
  useEffect(() => { load(); }, []);
  const save = async (body) => {
    body.month = Number(body.month);
    if (edit.id) await api(`admin/year-wheel/${edit.id}`, { method: "PATCH", body });
    else await api("admin/year-wheel", { method: "POST", body });
    setEdit(null); load();
  };
  const del = async () => { if (confirm("Slet punktet fra årshjulet?")) { await api(`admin/year-wheel/${edit.id}`, { method: "DELETE" }); setEdit(null); load(); } };
  if (!rows) return <p className="muted">Indlæser …</p>;
  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
        <p className="muted" style={{ margin: 0 }}>Foreningens faste gøremål. Punkterne de næste 60 dage vises på overblikket.</p>
        <button className="btn" onClick={() => setEdit({ month: String(new Date().getMonth() + 1) })}>+ Nyt punkt</button>
      </div>
      <div className="wheel">
        {MONTHS.map((m, i) => (
          <div className="card" key={m}>
            <div className="month">{m[0].toUpperCase() + m.slice(1)}</div>
            {rows.filter((r) => r.month === i + 1).map((r) => (
              <div className="item" key={r.id} onClick={() => setEdit({ ...r, month: String(r.month) })} style={{ cursor: "pointer" }}>
                <b>{r.day ? `${r.day}. ` : ""}{r.title}</b>{r.owner && <div className="muted small">{r.owner}</div>}
              </div>
            ))}
            {!rows.some((r) => r.month === i + 1) && <p className="muted small">—</p>}
          </div>
        ))}
      </div>
      {edit && (
        <Modal onClose={() => setEdit(null)}>
          <h2>{edit.id ? edit.title : "Nyt punkt i årshjulet"}</h2>
          <CrudForm fields={WHEEL_FIELDS} row={edit} onSave={save} onDelete={edit.id ? del : null} />
        </Modal>
      )}
    </>
  );
}

function AuditLog() {
  const [rows, setRows] = useState(null);
  useEffect(() => { api("admin/audit").then(setRows); }, []);
  if (!rows) return <p className="muted">Indlæser …</p>;
  return (
    <>
      <p className="muted">Hvem har ændret hvad – bruges til at dokumentere behandling af persondata (GDPR).</p>
      <div className="table-wrap"><table>
        <thead><tr><th>Tidspunkt</th><th>Hvem</th><th>Handling</th><th>Detalje</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id}><td>{fmtDate(r.created_at, true)}</td><td>{r.actor}</td><td>{r.action}</td><td className="muted">{r.detail}</td></tr>)}</tbody>
      </table></div>
    </>
  );
}
