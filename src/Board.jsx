import React, { useEffect, useState } from "react";
import { api, fmtDate, MONTHS, download, MEMBERSHIP, membershipLabel, IDEA_STATUS, IDEA_CATEGORIES, ideaStatus } from "./api.js";
import { Modal } from "./Modal.jsx";
import { FolderView, folderOptions } from "./Folders.jsx";

const TABS = [
  ["overblik", "Overblik"], ["medlemmer", "Medlemmer"], ["arrangementer", "Arrangementer"],
  ["dokumenter", "Dokumenter"], ["opgaver", "Opgaver"], ["aarshjul", "Årshjul"],
  ["hoering", "Høring"], ["idebank", "Idébank"], ["viden", "Videnscenter"], ["log", "Log"],
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
      {tab === "dokumenter" && <Documents />}
      {tab === "opgaver" && <Crud {...TASKS} />}
      {tab === "aarshjul" && <YearWheel />}
      {tab === "hoering" && <Crud {...HEARINGS} />}
      {tab === "idebank" && <BoardIdeas />}
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
        <Stat n={c.new_ideas} label="Nye idéer fra medlemmer" warn={c.new_ideas > 0} onClick={() => pick("idebank")} />
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
  const [inYear, setInYear] = useState("");
  const year = new Date().getFullYear();
  const load = () => api("admin/members").then(setRows).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  const patch = async (m, body) => { setErr(""); try { await api(`admin/members/${m.id}`, { method: "PATCH", body }); load(); } catch (e) { setErr(e.message); } };
  const remove = async (m) => {
    if (!confirm(`Slet indmeldelsen fra ${m.name || m.email}? Dette kan ikke fortrydes.`)) return;
    try { await api(`admin/members/${m.id}`, { method: "DELETE" }); setEdit(null); load(); } catch (e) { setErr(e.message); }
  };
  if (!rows) return <p className="muted">{err || "Indlæser …"}</p>;
  const memberInYear = (m, y) => m.joined_at && new Date(m.joined_at) < new Date(y + 1, 0, 1) && (!m.ended_at || new Date(m.ended_at) >= new Date(y, 0, 1));
  const firstYear = Math.min(year, ...rows.filter((m) => m.joined_at).map((m) => new Date(m.joined_at).getFullYear()));
  const years = Array.from({ length: year - firstYear + 1 }, (_, i) => year - i);
  const shown = rows.filter((m) => {
    if (inYear) { if (!memberInYear(m, Number(inYear))) return false; }
    else if (filter === "alle" && m.status === "ended") return false;
    if (filter === "afventer" && m.status !== "pending") return false;
    if (filter === "udmeldte" && m.status !== "ended") return false;
    if (filter === "ubetalt" && !(m.status === "active" && !(m.fee_paid_year >= year))) return false;
    if (filter === "bestyrelse" && m.role !== "board") return false;
    const s = search.toLowerCase();
    return !s || (m.name || "").toLowerCase().includes(s) || m.email.includes(s);
  });
  return (
    <>
      <div className="row" style={{ marginBottom: 14, justifyContent: "space-between" }}>
        <div className="row">
          {[["alle", "Aktuelle"], ["afventer", "Afventer"], ["ubetalt", "Ubetalt"], ["udmeldte", "Udmeldte"], ["bestyrelse", "Bestyrelse"]].map(([f, l]) => (
            <button key={f} className={"btn small " + (filter === f && !inYear ? "" : "ghost")} onClick={() => { setInYear(""); setFilter(f); }}>{l}</button>
          ))}
          <select value={inYear} onChange={(e) => { setInYear(e.target.value); setFilter("alle"); }} style={{ width: "auto" }} title="Alle, der var medlem på et tidspunkt i året – også udmeldte">
            <option value="">Medlemmer i år …</option>
            {years.map((y) => <option key={y} value={y}>Medlemmer i {y}</option>)}
          </select>
        </div>
        <div className="row">
          <input placeholder="Søg navn eller e-mail" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 220 }} />
          <button className="btn ghost small" onClick={() => inYear ? download(`admin/members/export.csv?year=${inYear}`, `rca-medlemmer-${inYear}.csv`) : download("admin/members/export.csv", "rca-medlemmer-aktuelle.csv")}>Eksportér CSV{inYear ? ` (${inYear})` : ""}</button>
          <button className="btn small" onClick={() => { setAdded(null); setAdding(true); }}>+ Tilføj medlem</button>
        </div>
      </div>
      {err && <div className="error">{err}</div>}
      <div className="table-wrap"><table>
        <thead><tr><th>Nr.</th><th>Navn</th><th>Kontakt</th><th>Medlemstype</th><th>Status</th><th>Kontingent</th><th></th></tr></thead>
        <tbody>
          {!shown.length && <tr><td colSpan={7} className="empty">Ingen medlemmer i denne visning.</td></tr>}
          {shown.map((m) => (
            <tr key={m.id}>
              <td className="muted">{m.member_no}</td>
              <td><b>{m.name || "—"}</b>{m.role === "board" && <> <span className="pill board">Bestyrelse</span></>}<div className="muted small">{m.joined_at ? `Medlem fra ${fmtDate(m.joined_at)}` : `Indmeldt ${fmtDate(m.created_at)}`}{m.ended_at ? ` til ${fmtDate(m.ended_at)}` : ""}</div></td>
              <td>{m.email}<div className="muted small">{[m.phone, [m.postal_code, m.city].filter(Boolean).join(" ")].filter(Boolean).join(" · ")}</div></td>
              <td>{membershipLabel(m.membership_type) || <span className="muted">Ikke valgt</span>}{m.affiliation && <div className="muted small">{m.affiliation}</div>}</td>
              <td>
                <span className={"pill " + m.status}>{{ pending: "Afventer", active: "Aktiv", ended: "Udmeldt" }[m.status]}</span>
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
  const [f, setF] = useState({ name: "", email: "", phone: "", postal_code: "", city: "", affiliation: "", membership_type: "fuldt", role: "member", fee_paid_year: "" });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <form className="stack" onSubmit={async (e) => { e.preventDefault(); setErr(""); setBusy(true); try { await onSave(f); } catch (e2) { setErr(e2.message); } setBusy(false); }}>
      <div className="form-grid">
        <label>Navn<input required value={f.name} onChange={set("name")} /></label>
        <label>E-mail<input required type="email" value={f.email} onChange={set("email")} /></label>
        <label>Rolle<select value={f.role} onChange={set("role")}><option value="member">Medlem</option><option value="board">Bestyrelse</option></select></label>
        <label>Medlemstype<select value={f.membership_type || ""} onChange={set("membership_type")}><option value="">Ikke valgt</option>{MEMBERSHIP.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
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
    <form className="stack" onSubmit={(e) => { e.preventDefault(); const { name, phone, postal_code, city, affiliation, membership_type, role, status, fee_paid_year, notes } = f; onSave({ name, phone, postal_code, city, affiliation, membership_type, role, status, fee_paid_year: fee_paid_year ? Number(fee_paid_year) : null, notes }); }}>
      <div className="form-grid">
        <label>Navn<input value={f.name || ""} onChange={set("name")} /></label>
        <label>Telefon<input value={f.phone || ""} onChange={set("phone")} /></label>
        <label>Postnr.<input value={f.postal_code || ""} onChange={set("postal_code")} /></label>
        <label>By<input value={f.city || ""} onChange={set("city")} /></label>
<label>Medlemstype<select value={f.membership_type || ""} onChange={set("membership_type")}><option value="">Ikke valgt</option>{MEMBERSHIP.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label>Status<select value={f.status} onChange={set("status")}><option value="pending">Afventer</option><option value="active">Aktiv</option><option value="ended">Udmeldt</option></select></label>
        <label>Rolle<select value={f.role} onChange={set("role")} disabled={m.id === me.id}><option value="member">Medlem</option><option value="board">Bestyrelse</option></select></label>
        <label>Kontingent betalt for år<input type="number" value={f.fee_paid_year || ""} onChange={set("fee_paid_year")} /></label>
      </div>
      <label>Interne noter (kun bestyrelsen – undgå følsomme oplysninger)<textarea value={f.notes || ""} onChange={set("notes")} /></label>
      <p className="muted small">Privatlivspolitik accepteret: {fmtDate(m.privacy_accepted_at, true) || "—"} · Medlemsnr. {m.member_no}{m.joined_at ? ` · medlem fra ${fmtDate(m.joined_at)}` : ""}{m.ended_at ? ` til ${fmtDate(m.ended_at)}` : ""}</p>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <button className="btn">Gem</button>
        {m.id !== me.id && !m.joined_at && <button type="button" className="btn danger" onClick={onDelete}>Slet indmeldelse</button>}
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
const HEARINGS = {
  resource: "hearings", title: "Høringer", newLabel: "Ny høring",
  intro: "Kun godkendte medlemmer kan svare. Link til høringen: medlem.rcfa.dk/#/hoering",
  fields: [
    { k: "title", l: "Titel", req: true }, { k: "deadline", l: "Høringsfrist (sidste dag)", type: "date", req: true },
    { k: "status", l: "Status", type: "select", opts: [["open", "Åben (lukker automatisk efter fristen)"], ["closed", "Lukket"], ["hidden", "Skjult for medlemmer"]], def: "open" },
    { k: "documents_url", l: "Link til høringsmateriale", wide: true },
    { k: "sections", l: "Valgmuligheder for paragraf (kommasepareret)", wide: true },
    { k: "description", l: "Tekst til medlemmerne", type: "textarea", wide: true },
  ],
  cols: [["title", "Høring"], ["deadline", "Frist", (v) => fmtDate(v)], ["status", "Status", (v) => <span className={"pill " + (v === "open" ? "" : "ended")}>{{ open: "Åben", closed: "Lukket", hidden: "Skjult" }[v]}</span>]],
  extra: (row) => <HearingResponses id={row.id} />,
};
function HearingResponses({ id }) {
  const [rows, setRows] = useState(null); const [open, setOpen] = useState(null);
  const load = () => api(`admin/hearings/${id}/responses`).then(setRows).catch(() => setRows([]));
  useEffect(() => { load(); }, [id]);
  if (!rows) return null;
  const groups = {};
  rows.forEach((r) => { (groups[r.section || "Ingen paragraf valgt"] ||= []).push(r); });
  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>Høringssvar ({rows.length})</h3>
        {rows.length > 0 && (
          <div className="row">
            <button className="btn small ghost" onClick={() => download(`admin/hearings/${id}/export.csv`, `hoeringssvar-${id}.csv`)}>Eksportér CSV</button>
            <button className="btn small danger" onClick={async () => {
              if (!confirm(`Slet alle ${rows.length} høringssvar permanent? Gør det først efter generalforsamlingen.`)) return;
              await api(`admin/hearings/${id}/responses`, { method: "DELETE" }); load();
            }}>Slet alle svar</button>
          </div>
        )}
      </div>
      {!rows.length && <p className="muted">Ingen svar endnu.</p>}
      {Object.entries(groups).sort(([a], [b]) => a.localeCompare(b, "da", { numeric: true })).map(([sec, list]) => (
        <div key={sec} style={{ marginTop: 14 }}>
          <button className="btn small ghost" onClick={() => setOpen(open === sec ? null : sec)}>{open === sec ? "▾" : "▸"} {sec} ({list.length})</button>
          {open === sec && list.map((r) => (
            <div key={r.id} style={{ borderLeft: "3px solid var(--terra)", padding: "4px 0 4px 12px", margin: "10px 0" }}>
              <div className="muted small">{r.name} (nr. {r.member_no}) · {fmtDate(r.created_at, true)}</div>
              <div className="article-body">{r.body}</div>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
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

/* ---------- idébank ---------- */
function BoardIdeas() {
  const [rows, setRows] = useState(null); const [open, setOpen] = useState(null); const [err, setErr] = useState("");
  const [filter, setFilter] = useState("aktive");
  const load = () => api("admin/ideas").then(setRows).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  if (!rows) return <p className="muted">{err || "Indlæser …"}</p>;
  const closed = ["done", "parked", "declined"];
  const shown = rows.filter((r) => filter === "alle" || (filter === "nye" ? r.status === "new" : !closed.includes(r.status)));
  const save = async (body) => {
    setErr("");
    try { await api(`admin/ideas/${open.id}`, { method: "PATCH", body }); setOpen(null); load(); } catch (e) { setErr(e.message); }
  };
  const del = async () => {
    if (!confirm(`Slet idéen “${open.title}” permanent? Overvej at skjule den i stedet.`)) return;
    await api(`admin/ideas/${open.id}`, { method: "DELETE" }); setOpen(null); load();
  };
  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
        <p className="muted" style={{ margin: 0, maxWidth: 640 }}>Medlemmernes idéer. Sæt status og skriv et kort svar, som medlemmerne kan se. Link til idébanken: medlem.rcfa.dk/#/idebank</p>
        <div className="row">
          {[["aktive", "Åbne"], ["nye", "Nye"], ["alle", "Alle"]].map(([k, l]) => (
            <button key={k} className={"btn small " + (filter === k ? "" : "ghost")} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
      </div>
      {err && <div className="error">{err}</div>}
      <div className="table-wrap"><table>
        <thead><tr><th>Idé</th><th>Fra</th><th>Støtter</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {!shown.length && <tr><td colSpan={5} className="empty">Ingen idéer i denne visning.</td></tr>}
          {shown.map((r) => {
            const [, label, cls] = ideaStatus(r.status);
            return (
              <tr key={r.id}>
                <td><b>{r.title}</b>{r.hidden && <> <span className="pill ended">Skjult</span></>}<div className="muted small">{[r.category, r.maturity, fmtDate(r.created_at)].filter(Boolean).join(" · ")}</div></td>
                <td>{r.member_name || <span className="muted">Slettet medlem</span>}{r.member_no && <div className="muted small">nr. {r.member_no}{r.show_name ? "" : " · anonym for medlemmer"}</div>}{r.wants_to_help && <div className="small" style={{ color: "var(--terra)" }}>Vil gerne hjælpe</div>}</td>
                <td>{r.supports}</td>
                <td><span className={"pill " + cls}>{label}</span></td>
                <td><button className="btn small ghost" onClick={() => setOpen(r)}>Åbn</button></td>
              </tr>
            );
          })}
        </tbody>
      </table></div>
      {open && (
        <Modal onClose={() => setOpen(null)}>
          <h2>{open.title}</h2>
          <p className="muted small">{[open.category, open.maturity, fmtDate(open.created_at, true)].filter(Boolean).join(" · ")} · {open.supports} støtter</p>
          <p className="small">Fra <b>{open.member_name || "slettet medlem"}</b>{open.member_email ? ` · ${open.member_email}` : ""}{open.member_no ? ` · nr. ${open.member_no}` : ""}{open.wants_to_help ? " · vil gerne være med til at føre idéen ud i livet" : ""}</p>
          {open.body && <div className="article-body card" style={{ boxShadow: "none" }}>{open.body}</div>}
          <div className="section" style={{ marginTop: 20 }}>
            <IdeaReview idea={open} onSave={save} onDelete={del} />
          </div>
        </Modal>
      )}
    </>
  );
}
function IdeaReview({ idea, onSave, onDelete }) {
  const [f, setF] = useState({ status: idea.status, board_reply: idea.board_reply || "", hidden: !!idea.hidden, category: idea.category || "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); onSave(f); }}>
      <div className="form-grid">
        <label>Status<select value={f.status} onChange={set("status")}>{IDEA_STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label>Emne<select value={f.category} onChange={set("category")}><option value="">Ikke valgt</option>{IDEA_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
      </div>
      <label>Svar til medlemmerne (vises ved idéen)<textarea value={f.board_reply} onChange={set("board_reply")} placeholder="Fx Tak for idéen! Vi tager den op på bestyrelsesmødet i januar." /></label>
      <label className="check"><input type="checkbox" checked={f.hidden} onChange={set("hidden")} />Skjul for de andre medlemmer (fx hvis den indeholder personlige oplysninger)</label>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <button className="btn">Gem</button>
        <button type="button" className="btn danger" onClick={onDelete}>Slet</button>
      </div>
    </form>
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

/* ---------- documents with folders ---------- */
function Documents() {
  const [folders, setFolders] = useState(null); const [docs, setDocs] = useState([]);
  const [current, setCurrent] = useState(null);
  const [editDoc, setEditDoc] = useState(null); const [editFolder, setEditFolder] = useState(null);
  const [err, setErr] = useState("");
  const load = async () => {
    try { const [f, d] = await Promise.all([api("admin/folders"), api("admin/documents")]); setFolders(f); setDocs(d); }
    catch (e) { setErr(e.message); }
  };
  useEffect(() => { load(); }, []);
  if (!folders) return <p className="muted">{err || "Indlæser …"}</p>;
  const curFolder = folders.find((f) => f.id === current);
  const folderSelect = (exclude) => ({ k: "folder_id", l: "Mappe", type: "select", opts: [["", "📁 Dokumenter (øverste niveau)"], ...folderOptions(folders, exclude).map(([id, n]) => [String(id), n])] });
  const saveDoc = async (body) => {
    setErr(""); body.folder_id = body.folder_id ? Number(body.folder_id) : null;
    try {
      if (editDoc.id) await api(`admin/documents/${editDoc.id}`, { method: "PATCH", body });
      else await api("admin/documents", { method: "POST", body });
      setEditDoc(null); load();
    } catch (e) { setErr(e.message); }
  };
  const saveFolder = async (body) => {
    setErr(""); body.parent_id = body.folder_id ? Number(body.folder_id) : null; delete body.folder_id;
    try {
      if (editFolder.id) await api(`admin/folders/${editFolder.id}`, { method: "PATCH", body });
      else await api("admin/folders", { method: "POST", body });
      setEditFolder(null); load();
    } catch (e) { setErr(e.message); }
  };
  const del = async (kind, row) => {
    if (!confirm(`Slet “${row.title || row.name}”?`)) return;
    setErr("");
    try { await api(`admin/${kind}/${row.id}`, { method: "DELETE" }); setEditDoc(null); setEditFolder(null); load(); }
    catch (e) { setErr(e.message); }
  };
  const vis = (def) => ({ k: "visibility", l: "Hvem kan se det", type: "select", opts: [["board", "Kun bestyrelsen"], ["members", "Alle medlemmer"]], def });
  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
        <p className="muted" style={{ margin: 0 }}>Link til filer i Google Drive-mappen “RessourceCenter for Adopterede RCA”, eller skriv teksten direkte. Medlemmer ser kun mapper og dokumenter, der er sat til “Alle medlemmer”.</p>
        <div className="row">
          <button className="btn ghost" onClick={() => setEditFolder({ folder_id: current ? String(current) : "", visibility: curFolder?.visibility || "board" })}>+ Ny mappe</button>
          <button className="btn" onClick={() => setEditDoc({ folder_id: current ? String(current) : "", category: "referat", visibility: curFolder?.visibility || "board" })}>+ Nyt dokument</button>
        </div>
      </div>
      {err && <div className="error" style={{ marginBottom: 12 }}>{err}</div>}
      <FolderView folders={folders} docs={docs} current={current} setCurrent={setCurrent} editable
        onOpenFolder={(f) => setEditFolder({ ...f, folder_id: f.parent_id ? String(f.parent_id) : "" })}
        onOpenDoc={(d) => setEditDoc({ ...d, folder_id: d.folder_id ? String(d.folder_id) : "" })} />
      {editFolder && (
        <Modal onClose={() => setEditFolder(null)}>
          <h2>{editFolder.id ? editFolder.name : "Ny mappe"}</h2>
          <CrudForm row={editFolder} onSave={saveFolder} onDelete={editFolder.id ? () => del("folders", editFolder) : null}
            fields={[{ k: "name", l: "Navn", req: true }, { ...folderSelect(editFolder.id), l: "Ligger i" }, vis("board")]} />
        </Modal>
      )}
      {editDoc && (
        <Modal onClose={() => setEditDoc(null)}>
          <h2>{editDoc.id ? editDoc.title : "Nyt dokument"}</h2>
          <CrudForm row={editDoc} onSave={saveDoc} onDelete={editDoc.id ? () => del("documents", editDoc) : null}
            fields={[
              { k: "title", l: "Titel", req: true }, { k: "doc_date", l: "Dato", type: "date" },
              { k: "category", l: "Type", type: "select", opts: [["referat", "Referat"], ["vedtægter", "Vedtægter"], ["regnskab", "Regnskab"], ["politik", "Politik"], ["andet", "Andet"]], def: "referat" },
              vis("board"), folderSelect(null),
              { k: "url", l: "Link (fx Google Drive)", wide: true }, { k: "body", l: "Tekst / resumé", type: "textarea", wide: true },
            ]} />
        </Modal>
      )}
    </>
  );
}
