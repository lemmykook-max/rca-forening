import React, { useEffect, useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import {
  getUser, login, logout, signup, handleAuthCallback, acceptInvite,
  requestPasswordRecovery, recoverPassword, onAuthChange,
} from "@netlify/identity";
import { api, fmtDate, download, MEMBERSHIP } from "./api.js";
import Board from "./Board.jsx";
import { Modal } from "./Modal.jsx";
import { FolderView } from "./Folders.jsx";
import "./styles.css";

const AFFILIATIONS = ["Adopteret", "Adoptivforælder", "Pårørende", "Fagperson / forsker", "Støttemedlem", "Andet"];

function useHash() {
  const [hash, setHash] = useState(() => window.location.hash.replace(/^#\/?/, "") || "");
  useEffect(() => {
    const on = () => setHash(window.location.hash.replace(/^#\/?/, "") || "");
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash;
}
const go = (p) => { window.location.hash = "/" + p; };

function App() {
  const route = useHash();
  const [user, setUser] = useState(undefined);
  const [member, setMember] = useState(null);
  const [callback, setCallback] = useState(null);
  const [flash, setFlash] = useState("");

  const loadMe = useCallback(async () => {
    const u = await getUser().catch(() => null);
    setUser(u);
    if (u) {
      try { setMember((await api("me")).member); } catch { setMember(null); }
    } else setMember(null);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await handleAuthCallback();
        if (res?.type === "invite" || res?.type === "recovery") setCallback(res);
        else if (res?.type === "signup" || res?.type === "confirmation") setFlash("Din e-mail er bekræftet. Velkommen!");
      } catch (e) { setFlash("Linket kunne ikke bruges: " + e.message); }
      await loadMe();
    })();
    return onAuthChange(() => loadMe());
  }, [loadMe]);

  const isBoard = member?.role === "board";
  const isActive = member && (member.status === "active" || isBoard);

  let page;
  if (user === undefined) page = <p className="muted">Indlæser …</p>;
  else if (callback) page = <CallbackForm cb={callback} done={() => { setCallback(null); loadMe(); go("medlem"); }} />;
  else if (route === "" ) page = <Home user={user} member={member} />;
  else if (route === "viden") page = <Knowledge loggedIn={!!isActive} />;
  else if (route === "arrangementer") page = <Events user={user} isActive={isActive} />;
  else if (route === "privatliv") page = <Privacy />;
  else if (route === "login") page = <Auth onDone={async () => { await loadMe(); go("medlem"); }} />;
  else if (!user) page = <Auth onDone={async () => { await loadMe(); }} />;
  else if (!member || !member.privacy_accepted_at) page = <JoinForm onDone={loadMe} email={user.email} existing={member} />;
  else if (route === "medlem") page = <MyMembership member={member} reload={loadMe} />;
  else if (route === "dokumenter") page = isActive ? <MemberDocs /> : <Pending />;
  else if (route.startsWith("bestyrelse")) page = isBoard ? <Board me={member} /> : <p>Kun for bestyrelsen.</p>;
  else page = <p>Siden findes ikke. <a href="#/">Til forsiden</a></p>;

  const nav = [
    ["", "Forside"], ["arrangementer", "Arrangementer"], ["viden", "Videnscenter"],
    ...(isActive ? [["dokumenter", "Dokumenter"]] : []),
    ...(user ? [["medlem", "Mit medlemskab"]] : []),
    ...(isBoard ? [["bestyrelse", "Bestyrelse"]] : []),
  ];

  return (
    <>
      <header className="site-header">
        <div className="wrap">
          <a className="brand" href="#/"><b>RCA</b><span>Ressourcecenter for Adopterede</span></a>
          <nav className="nav">
            {nav.map(([p, l]) => (
              <a key={p} href={"#/" + p} className={(route.split("/")[0] === p) ? "active" : ""}>{l}</a>
            ))}
            {user ? (
              <button className="btn ghost small" onClick={async () => { await logout(); setUser(null); setMember(null); go(""); }}>Log ud</button>
            ) : (
              <a className="btn small" href="#/login" style={{ color: "#fff" }}>Log ind / Bliv medlem</a>
            )}
          </nav>
        </div>
      </header>
      <main>
        <div className="wrap">
          {flash && <div className="notice ok">{flash}</div>}
          {page}
        </div>
      </main>
      <footer>
        <div className="wrap row" style={{ justifyContent: "space-between" }}>
          <span>Ressourcecenter for Adopterede (RCA) · Stiftet 15. november 2026</span>
          <span className="row"><a href="#/privatliv">Privatlivspolitik</a><a href="https://rca-website.netlify.app/">Hjemmeside</a></span>
        </div>
      </footer>
    </>
  );
}

/* ---------------- public ---------------- */
function Home({ user, member }) {
  return (
    <>
      <section className="hero">
        <span className="badge">Foreningsplatform · for medlemmer og bestyrelse</span>
        <h1>Velkommen til RCA's medlemsområde</h1>
        <p className="muted" style={{ maxWidth: 640 }}>
          Her melder du dig ind, tilmelder dig arrangementer og finder viden om adoption. Bestyrelsen bruger platformen til
          medlemsliste, referater, opgaver og årshjul.
        </p>
        <div className="row">
          {!user && <a className="btn" href="#/login">Bliv medlem</a>}
          {user && !member && <a className="btn" href="#/medlem">Udfyld din indmeldelse</a>}
          {member && <a className="btn" href="#/medlem">Mit medlemskab</a>}
          <a className="btn ghost" href="#/arrangementer">Se arrangementer</a>
        </div>
      </section>
      <div className="grid section">
        <div className="card"><h3>Viden og dokumentation</h3><p className="muted">Forskning, rapporter og erfaringer samlet ét sted i videnscentret.</p><a href="#/viden">Gå til videnscentret →</a></div>
        <div className="card"><h3>Støtte og fællesskab</h3><p className="muted">Mødesteder, temaaftener og netværk for adopterede og deres nærmeste.</p><a href="#/arrangementer">Se arrangementer →</a></div>
        <div className="card"><h3>Stemme og rettigheder</h3><p className="muted">Sammen giver vi adopterede en tydelig stemme i debatten.</p><a href="https://rca-website.netlify.app/">Læs om RCA →</a></div>
      </div>
    </>
  );
}

function Knowledge({ loggedIn }) {
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(null);
  const [tag, setTag] = useState("");
  useEffect(() => { api(loggedIn ? "articles" : "public/articles").then(setItems).catch(() => setItems([])); }, [loggedIn]);
  const tags = [...new Set((items || []).flatMap((a) => (a.tags || "").split(",").map((t) => t.trim()).filter(Boolean)))];
  const shown = (items || []).filter((a) => !tag || (a.tags || "").includes(tag));
  return (
    <>
      <h1>Videnscenter</h1>
      <p className="muted">Viden, forskning og ressourcer om adoption.{!loggedIn && " Medlemmer har adgang til flere ressourcer."}</p>
      {tags.length > 0 && (
        <div className="row" style={{ marginBottom: 16 }}>
          <button className={"btn small " + (tag ? "ghost" : "")} onClick={() => setTag("")}>Alle</button>
          {tags.map((t) => <button key={t} className={"btn small " + (tag === t ? "" : "ghost")} onClick={() => setTag(t)}>{t}</button>)}
        </div>
      )}
      {!items ? <p className="muted">Indlæser …</p> : !shown.length ? <div className="card empty">Ingen artikler endnu.</div> : (
        <div className="grid">
          {shown.map((a) => (
            <div className="card" key={a.id}>
              {a.visibility === "members" && <span className="pill" style={{ marginBottom: 8 }}>Kun medlemmer</span>}
              <h3>{a.title}</h3>
              <p className="muted small">{fmtDate(a.created_at)}{a.tags ? " · " + a.tags : ""}</p>
              <p>{a.summary}</p>
              <button className="btn ghost small" onClick={() => setOpen(a)}>Læs</button>
            </div>
          ))}
        </div>
      )}
      {open && (
        <Modal onClose={() => setOpen(null)}>
          <h2>{open.title}</h2>
          <p className="muted small">{fmtDate(open.created_at)}{open.tags ? " · " + open.tags : ""}</p>
          <div className="article-body">{open.body}</div>
          {open.source_url && <p style={{ marginTop: 16 }}><a href={open.source_url} target="_blank" rel="noreferrer">Kilde →</a></p>}
        </Modal>
      )}
    </>
  );
}

function Events({ user, isActive }) {
  const [items, setItems] = useState(null);
  const [msg, setMsg] = useState("");
  const load = () => api(isActive ? "events" : "public/events").then(setItems).catch(() => setItems([]));
  useEffect(() => { load(); }, [isActive]);
  const toggle = async (e) => {
    setMsg("");
    try { await api(`events/${e.id}/signup`, { method: e.mine ? "DELETE" : "POST" }); load(); }
    catch (er) { setMsg(er.message); }
  };
  return (
    <>
      <h1>Arrangementer</h1>
      {!isActive && <p className="muted">{user ? "Når dit medlemskab er godkendt, kan du se alle arrangementer og tilmelde dig." : "Log ind som medlem for at se alle arrangementer og tilmelde dig."}</p>}
      {msg && <div className="error">{msg}</div>}
      {!items ? <p className="muted">Indlæser …</p> : !items.length ? <div className="card empty">Ingen kommende arrangementer lige nu.</div> : (
        <div className="grid">
          {items.map((e) => {
            const full = e.capacity && e.signups >= e.capacity && !e.mine;
            return (
              <div className="card" key={e.id}>
                <p className="small" style={{ color: "var(--terra)", fontWeight: 600, marginBottom: 6 }}>{fmtDate(e.starts_at, true)}</p>
                <h3>{e.title}</h3>
                {e.location && <p className="muted small">📍 {e.location}</p>}
                {e.description && <p>{e.description}</p>}
                {e.online_url && (isActive || e.visibility === "public") && <p className="small"><a href={e.online_url} target="_blank" rel="noreferrer">Online-link</a></p>}
                {isActive && (
                  <div className="row">
                    <button className={"btn small " + (e.mine ? "ghost" : "")} disabled={full} onClick={() => toggle(e)}>
                      {e.mine ? "Afmeld" : full ? "Fuldt booket" : "Tilmeld mig"}
                    </button>
                    <span className="muted small">{e.signups}{e.capacity ? ` / ${e.capacity}` : ""} tilmeldt</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function Privacy() {
  const [cfg, setCfg] = useState({});
  useEffect(() => { api("public/config").then(setCfg).catch(() => {}); }, []);
  return (
    <div className="card" style={{ maxWidth: 760 }}>
      <h1>Privatlivspolitik</h1>
      <p><b>Dataansvarlig:</b> Ressourcecenter for Adopterede (RCA){cfg.contactEmail ? `, ${cfg.contactEmail}` : ""}.</p>
      <h3>Hvilke oplysninger vi behandler</h3>
      <p>Navn, e-mail, telefon, postnummer og by, din tilknytning til adoptionsområdet (valgfrit), kontingentstatus og tilmeldinger til arrangementer. Vi beder ikke om oplysninger om din adoptionshistorie, oprindelsesland, helbred eller andre følsomme forhold.</p>
      <h3>Formål og grundlag</h3>
      <p>Vi behandler oplysningerne for at administrere dit medlemskab, opkræve kontingent, indkalde til generalforsamling og invitere til arrangementer (GDPR art. 6, stk. 1, litra b – medlemsforholdet).</p>
      <h3>Hvem ser dine oplysninger</h3>
      <p>Kun foreningens bestyrelse. Vi videregiver ikke oplysninger til andre. Platformen hostes hos Netlify, som er databehandler for foreningen.</p>
      <h3>Opbevaring</h3>
      <p>Vi opbevarer dine oplysninger, så længe du er medlem. Efter udmeldelse gemmer vi navn, kontaktoplysninger, medlemsnummer, medlemstype og medlemsperiode i 5 år fra udgangen af det år, hvor du meldte dig ud. Det er nødvendigt, for at foreningen kan dokumentere sine medlemmer over for pengeinstitut (hvidvaskreglerne) og tilskudsgivere (GDPR art. 6, stk. 1, litra c og f). Derefter sletter vi oplysningerne.</p>
      <h3>Dine rettigheder</h3>
      <p>Du kan se, rette og downloade dine data og melde dig ud under <a href="#/medlem">Mit medlemskab</a>. Du kan bede bestyrelsen om at slette oplysninger, som foreningen ikke er forpligtet til at gemme. Du kan klage til Datatilsynet (datatilsynet.dk).</p>
    </div>
  );
}

/* ---------------- auth ---------------- */
function Auth({ onDone }) {
  const [mode, setMode] = useState("login");
  const [f, setF] = useState({ email: "", password: "", name: "" });
  const [msg, setMsg] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setErr(""); setMsg(""); setBusy(true);
    try {
      if (mode === "login") { await login(f.email, f.password); await onDone(); }
      else if (mode === "signup") {
        const u = await signup(f.email, f.password, { full_name: f.name });
        if (u?.confirmedAt) { await onDone(); }
        else setMsg("Tjek din e-mail og klik på bekræftelseslinket. Derefter kan du logge ind og udfylde din indmeldelse.");
      } else { await requestPasswordRecovery(f.email); setMsg("Hvis e-mailen findes, har vi sendt et link til at nulstille din adgangskode."); }
    } catch (e2) { setErr(e2.message || "Noget gik galt"); }
    setBusy(false);
  };
  return (
    <div className="card narrow" style={{ margin: "0 auto" }}>
      <div className="tabs">
        <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Log ind</button>
        <button className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>Bliv medlem</button>
        <button className={mode === "reset" ? "active" : ""} onClick={() => setMode("reset")}>Glemt kode</button>
      </div>
      {mode === "signup" && <p className="muted small">Opret først en konto. Bagefter udfylder du indmeldelsen, og bestyrelsen godkender dit medlemskab.</p>}
      <form className="stack" onSubmit={submit}>
        {mode === "signup" && <label>Navn<input required value={f.name} onChange={set("name")} autoComplete="name" /></label>}
        <label>E-mail<input required type="email" value={f.email} onChange={set("email")} autoComplete="email" /></label>
        {mode !== "reset" && <label>Adgangskode<input required type="password" minLength={8} value={f.password} onChange={set("password")} autoComplete={mode === "login" ? "current-password" : "new-password"} /></label>}
        {err && <div className="error">{err}</div>}
        {msg && <div className="notice ok">{msg}</div>}
        <button className="btn" disabled={busy}>{mode === "login" ? "Log ind" : mode === "signup" ? "Opret konto" : "Send link"}</button>
      </form>
    </div>
  );
}

function CallbackForm({ cb, done }) {
  const [pw, setPw] = useState(""); const [err, setErr] = useState("");
  const submit = async (e) => {
    e.preventDefault(); setErr("");
    try {
      if (cb.type === "invite") await acceptInvite(cb.token, pw);
      else await recoverPassword(cb.token, pw);
      done();
    } catch (e2) { setErr(e2.message); }
  };
  return (
    <div className="card narrow" style={{ margin: "0 auto" }}>
      <h2>{cb.type === "invite" ? "Velkommen – vælg en adgangskode" : "Vælg en ny adgangskode"}</h2>
      <form className="stack" onSubmit={submit}>
        <label>Adgangskode<input type="password" required minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></label>
        {err && <div className="error">{err}</div>}
        <button className="btn">Gem</button>
      </form>
    </div>
  );
}

/* ---------------- member ---------------- */
function ProfileFields({ f, set }) {
  return (
    <>
    <fieldset className="card" style={{ boxShadow: "none", margin: 0 }}>
      <legend className="small" style={{ color: "var(--muted)", padding: "0 6px" }}>Medlemstype · 0 kr. indtil videre</legend>
      <div className="stack" style={{ gap: 10 }}>
        {MEMBERSHIP.map(([v, label, desc]) => (
          <label key={v} className="check">
            <input type="radio" name="membership_type" value={v} required checked={f.membership_type === v} onChange={set("membership_type")} />
            <b>{label}</b><br /><span className="muted small">{desc}</span>
          </label>
        ))}
      </div>
    </fieldset>
    <div className="form-grid">
      <label>Fulde navn<input required value={f.name || ""} onChange={set("name")} /></label>
      <label>Telefon<input required type="tel" value={f.phone || ""} onChange={set("phone")} autoComplete="tel" /></label>
      <label>Postnummer<input required inputMode="numeric" pattern="[0-9]{4}" title="4 cifre" value={f.postal_code || ""} onChange={set("postal_code")} autoComplete="postal-code" /></label>
      <label>By<input required value={f.city || ""} onChange={set("city")} autoComplete="address-level2" /></label>
      <label>Tilknytning (valgfrit)
        <select value={f.affiliation || ""} onChange={set("affiliation")}>
          <option value="">Vil ikke oplyse</option>
          {AFFILIATIONS.map((a) => <option key={a}>{a}</option>)}
        </select>
      </label>
    </div>
    </>
  );
}

function JoinForm({ onDone, email, existing }) {
  const [f, setF] = useState(() => ({ ...(existing || { name: "" }), privacy_accepted: false }));
  const [err, setErr] = useState(""); const [cfg, setCfg] = useState({});
  useEffect(() => { getUser().then((u) => u?.name && setF((x) => ({ ...x, name: x.name || u.name }))); api("public/config").then(setCfg).catch(() => {}); }, []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setErr("");
    try { await api("me", { method: "POST", body: f }); await onDone(); go("medlem"); } catch (e2) { setErr(e2.message); }
  };
  return (
    <div className="card" style={{ maxWidth: 760 }}>
      <h1>{existing ? "Velkommen til RCA" : "Indmeldelse i RCA"}</h1>
      <p className="muted">Du er logget ind som {email}. {existing ? "Bestyrelsen har oprettet dig som medlem. Tjek dine oplysninger og accepter privatlivspolitikken." : "Udfyld dine oplysninger, så behandler bestyrelsen din indmeldelse."}</p>
      <form className="stack" onSubmit={submit}>
        <ProfileFields f={f} set={set} />
        <label className="check"><input type="checkbox" required checked={f.privacy_accepted} onChange={set("privacy_accepted")} />Jeg har læst <a href="#/privatliv" target="_blank">privatlivspolitikken</a> og ved, hvordan RCA behandler mine oplysninger.</label>
        {cfg.feeText && <p className="muted small">{cfg.feeText}</p>}
        {err && <div className="error">{err}</div>}
        <div><button className="btn">{existing ? "Gem og fortsæt" : "Send indmeldelse"}</button></div>
      </form>
    </div>
  );
}

function Pending() {
  return <div className="notice">Tak for din indmeldelse! Bestyrelsen godkender den snarest. Derefter får du adgang til dokumenter og tilmelding til arrangementer.</div>;
}

function MyMembership({ member, reload }) {
  const [f, setF] = useState(member);
  const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  useEffect(() => setF(member), [member]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const save = async (e) => {
    e.preventDefault(); setErr(""); setMsg("");
    try { await api("me", { method: "POST", body: f }); await reload(); setMsg("Gemt."); } catch (e2) { setErr(e2.message); }
  };
  const year = new Date().getFullYear();
  const typeText = (MEMBERSHIP.find(([v]) => v === member.membership_type) || [])[1];
  const statusText = { pending: "Afventer godkendelse", active: "Aktivt medlem", ended: "Udmeldt" }[member.status] || member.status;
  return (
    <>
      <h1>Mit medlemskab</h1>
      {member.status === "pending" && <Pending />}
      {!member.membership_type && <div className="notice">Vælg venligst din medlemstype nedenfor og gem.</div>}
      <div className="grid" style={{ marginBottom: 22 }}>
        <div className="card"><p className="muted small">Status</p><p className="stat" style={{ fontSize: "1.5rem" }}>{statusText}</p>{typeText && <p className="muted small" style={{ marginTop: 8 }}>{typeText}</p>}{member.role === "board" && <span className="pill board">Bestyrelse</span>}</div>
        <div className="card"><p className="muted small">Kontingent {year}</p><p className="stat" style={{ fontSize: "1.5rem" }}>{member.fee_paid_year >= year ? "Betalt ✓" : "Ikke registreret"}</p></div>
        <div className="card"><p className="muted small">Medlemsnummer</p><p className="stat" style={{ fontSize: "1.5rem" }}>{member.member_no}</p><p className="muted small" style={{ marginTop: 8 }}>{member.joined_at ? `Medlem siden ${fmtDate(member.joined_at)}` : `Indmeldt ${fmtDate(member.created_at)}`}{member.ended_at ? ` · udmeldt ${fmtDate(member.ended_at)}` : ""}</p></div>
      </div>
      <div className="card">
        <h2>Mine oplysninger</h2>
        <form className="stack" onSubmit={save}>
          <ProfileFields f={f} set={set} />
          {err && <div className="error">{err}</div>}
          {msg && <div className="notice ok">{msg}</div>}
          <div><button className="btn">Gem ændringer</button></div>
        </form>
      </div>
      <div className="card section">
        <h2>Dine data og udmeldelse</h2>
        <p className="muted">Du kan downloade alt, hvad RCA har registreret om dig. Melder du dig ud, gemmer vi dit medlemsnummer og din medlemsperiode i 5 år, så foreningen kan dokumentere sine medlemmer (se <a href="#/privatliv">privatlivspolitikken</a>).</p>
        <div className="row">
          <button className="btn ghost" onClick={() => download("me/export", "mine-data-rca.json")}>Download mine data</button>
          {member.status === "ended" ? (
            <span className="pill ended">Udmeldt {fmtDate(member.ended_at)}</span>
          ) : member.role !== "board" && (
            <button className="btn danger" onClick={async () => {
              if (!confirm("Vil du melde dig ud af RCA?")) return;
              await api("me/resign", { method: "POST" }); reload();
            }}>Meld mig ud</button>
          )}
        </div>
      </div>
    </>
  );
}

function MemberDocs() {
  const [data, setData] = useState(null);
  const [current, setCurrent] = useState(null);
  useEffect(() => { api("documents").then(setData).catch(() => setData({ folders: [], docs: [] })); }, []);
  if (!data) return <p className="muted">Indlæser …</p>;
  // Mapper/dokumenter, hvis overmappe kun er for bestyrelsen, vises i roden
  const ids = new Set(data.folders.map((f) => f.id));
  const folders = data.folders.map((f) => ({ ...f, parent_id: ids.has(f.parent_id) ? f.parent_id : null }));
  const docs = data.docs.map((d) => ({ ...d, folder_id: ids.has(d.folder_id) ? d.folder_id : null }));
  return (
    <>
      <h1>Dokumenter</h1>
      <p className="muted">Vedtægter, referater fra generalforsamlinger og andre dokumenter for medlemmer.</p>
      <FolderView folders={folders} docs={docs} current={current} setCurrent={setCurrent} />
    </>
  );
}

createRoot(document.getElementById("root")).render(<App />);
