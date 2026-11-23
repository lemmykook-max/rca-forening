import type { Config, Context } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { getUser } from "@netlify/identity";
import pg from "pg";

// Return DATE columns as plain "YYYY-MM-DD" strings (avoid timezone shifts)
const types = { getTypeParser: (oid: number, fmt?: any) => (oid === 1082 ? (v: string) => v : (pg.types.getTypeParser as any)(oid, fmt)) };

// ---------- helpers ----------
let _db: ReturnType<typeof getDatabase> | null = null;
const db = () => (_db ??= getDatabase());
async function q<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await (db().pool as any).query({ text, values: params, types });
  return res.rows as T[];
}
const json = (data: unknown, status = 200) => Response.json(data, { status });
const err = (msg: string, status = 400) => json({ error: msg }, status);

const IDEA_STATUSES = ["new", "discussing", "planned", "doing", "done", "parked", "declined"];
const IDEA_CATEGORIES = ["Arrangementer", "Fællesskab og netværk", "Viden og research", "Kommunikation", "Politik og rettigheder", "Foreningen", "Andet"];
const IDEA_MATURITY = ["Løs tanke", "Gennemarbejdet forslag"];
const oneOf = (v: unknown, list: string[]) => (list.includes(String(v)) ? String(v) : null);

function ideaInput(body: any) {
  const title = String(body.title || "").trim();
  const text = String(body.body || "").trim();
  if (!title) return { error: "Giv din idé en kort overskrift" };
  if (title.length > 120) return { error: "Overskriften er for lang (højst 120 tegn)" };
  if (text.length > 4000) return { error: "Beskrivelsen er for lang (højst 4.000 tegn)" };
  return {
    values: [title, text || null, oneOf(body.category, IDEA_CATEGORIES), oneOf(body.maturity, IDEA_MATURITY), !!body.show_name, !!body.wants_to_help],
  };
}

const MEMBERSHIP_TYPES = ["fuldt", "studie", "stoette"];
const memberType = (v: unknown) => (MEMBERSHIP_TYPES.includes(String(v)) ? String(v) : null);

const boardEmails = () =>
  (process.env.BOARD_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

type Member = {
  id: number; identity_id: string | null; email: string; name: string; role: string; status: string;
  [k: string]: any;
};

async function audit(actor: string | undefined, action: string, detail = "") {
  try { await q("INSERT INTO audit_log (actor, action, detail) VALUES ($1,$2,$3)", [actor || null, action, detail]); } catch {}
}

async function currentMember() {
  const user = await getUser();
  if (!user || !user.email) return { user: null, member: null as Member | null };
  const email = user.email.toLowerCase();
  let [member] = await q<Member>("SELECT * FROM members WHERE identity_id = $1 OR lower(email) = $2 LIMIT 1", [user.id, email]);
  if (member) {
    const shouldBeBoard = boardEmails().includes(email) && member.role !== "board";
    if (!member.identity_id || shouldBeBoard) {
      [member] = await q<Member>(
        "UPDATE members SET identity_id = $1, role = CASE WHEN $2 THEN 'board' ELSE role END, status = CASE WHEN $2 THEN 'active' ELSE status END, updated_at = NOW() WHERE id = $3 RETURNING *",
        [user.id, shouldBeBoard, member.id],
      );
    }
  }
  return { user, member: member || null };
}

// Whitelisted columns for simple CRUD tables (board only)
const TABLES: Record<string, { cols: string[]; order: string }> = {
  events: { cols: ["title", "description", "starts_at", "location", "online_url", "capacity", "visibility"], order: "starts_at DESC" },
  folders: { cols: ["name", "parent_id", "visibility"], order: "name" },
  documents: { cols: ["title", "category", "url", "body", "visibility", "doc_date", "folder_id"], order: "COALESCE(doc_date, created_at::date) DESC, id DESC" },
  tasks: { cols: ["title", "owner", "due_date", "status", "notes"], order: "status = 'done', due_date NULLS LAST, id" },
  "year-wheel": { cols: ["month", "day", "title", "description", "owner"], order: "month, day NULLS LAST, id" },
  hearings: { cols: ["title", "description", "documents_url", "deadline", "sections", "status"], order: "deadline DESC" },
  articles: { cols: ["title", "summary", "body", "tags", "source_url", "visibility", "published"], order: "created_at DESC" },
};
const tableName = (k: string) => (k === "year-wheel" ? "year_wheel" : k);
const clean = (v: unknown) => (v === "" ? null : v);

async function crud(req: Request, key: string, id: string | undefined, actor: string) {
  const t = TABLES[key];
  const table = tableName(key);
  if (req.method === "GET" && !id) return json(await q(`SELECT * FROM ${table} ORDER BY ${t.order}`));
  if (req.method === "POST" && !id) {
    const body = await req.json();
    const cols = t.cols.filter((c) => c in body);
    if (!cols.length) return err("Ingen felter");
    const rows = await q(
      `INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols.map((_, i) => "$" + (i + 1)).join(",")}) RETURNING *`,
      cols.map((c) => clean(body[c])),
    );
    if (table === "documents") await q("UPDATE documents SET created_by = $1 WHERE id = $2", [actor, (rows[0] as any).id]);
    await audit(actor, `create:${table}`, String((rows[0] as any).id));
    return json(rows[0], 201);
  }
  if (req.method === "PATCH" && id) {
    const body = await req.json();
    const cols = t.cols.filter((c) => c in body);
    if (!cols.length) return err("Ingen felter");
    const rows = await q(
      `UPDATE ${table} SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(", ")} WHERE id = $${cols.length + 1} RETURNING *`,
      [...cols.map((c) => clean(body[c])), Number(id)],
    );
    await audit(actor, `update:${table}`, id);
    return json(rows[0] || null);
  }
  if (req.method === "DELETE" && id) {
    try {
      await q(`DELETE FROM ${table} WHERE id = $1`, [Number(id)]);
    } catch (e: any) {
      if (e?.code === "23503") return err(table === "folders" ? "Mappen er ikke tom. Flyt eller slet indholdet først." : "Kan ikke slettes, fordi andet afhænger af den.");
      throw e;
    }
    await audit(actor, `delete:${table}`, id);
    return json({ ok: true });
  }
  return err("Ikke understøttet", 405);
}

function csvEscape(v: unknown) {
  const s = v == null ? "" : String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function upcomingWheel(wheel: any[], days = 60) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return wheel
    .map((w) => {
      let next = new Date(today.getFullYear(), w.month - 1, w.day || 1);
      if (next < today) next = new Date(today.getFullYear() + 1, w.month - 1, w.day || 1);
      const daysLeft = Math.round((next.getTime() - today.getTime()) / 86400000);
      return { ...w, next: `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`, daysLeft };
    })
    .filter((w) => w.daysLeft <= days)
    .sort((x, y) => x.daysLeft - y.daysLeft);
}

// ---------- handler ----------
export default async (req: Request, _context: Context) => {
  try {
    const url = new URL(req.url);
    const parts = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
    const [a, b, c, d] = parts;

    // ----- public -----
    if (a === "public") {
      if (b === "events")
        return json(await q("SELECT id, title, description, starts_at, location, online_url FROM events WHERE visibility = 'public' AND starts_at > NOW() - interval '1 day' ORDER BY starts_at"));
      if (b === "articles")
        return json(await q("SELECT id, title, summary, body, tags, source_url, created_at FROM articles WHERE published AND visibility = 'public' ORDER BY created_at DESC"));
      if (b === "config")
        return json({
          feeText: process.env.FEE_TEXT || "Kontingentet er 0 kr. indtil videre, jf. beslutningen på den stiftende generalforsamling. Frivillige donationer er velkomne, når foreningen har fået en bankkonto.",
          contactEmail: process.env.CONTACT_EMAIL || "",
        });
      return err("Ikke fundet", 404);
    }

    const { user, member } = await currentMember();
    if (!user) return err("Du skal være logget ind", 401);
    const actor = user.email!;

    // ----- own profile -----
    if (a === "me") {
      if (!b && req.method === "GET") return json({ email: user.email, member });
      if (!b && req.method === "POST") {
        const body = await req.json();
        if (!member?.privacy_accepted_at && !body.privacy_accepted) return err("Du skal acceptere privatlivspolitikken");
        for (const [k, label] of [["name", "Navn"], ["phone", "Telefon"], ["postal_code", "Postnummer"], ["city", "By"]])
          if (!String(body[k] ?? "").trim()) return err(`${label} skal udfyldes`);
        if (!memberType(body.membership_type)) return err("Vælg en medlemstype");
        const fields = [body.name || "", body.phone || null, body.postal_code || null, body.city || null, body.affiliation || null, memberType(body.membership_type)];
        let row;
        if (member) {
          [row] = await q("UPDATE members SET name=$1, phone=$2, postal_code=$3, city=$4, affiliation=$5, membership_type=$6, privacy_accepted_at=COALESCE(privacy_accepted_at, NOW()), updated_at=NOW() WHERE id=$7 RETURNING *", [...fields, member.id]);
        } else {
          const isBoard = boardEmails().includes(actor.toLowerCase());
          [row] = await q(
            "INSERT INTO members (identity_id, email, name, phone, postal_code, city, affiliation, membership_type, privacy_accepted_at, role, status, joined_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),$9,$10, CASE WHEN $10 = 'active' THEN NOW() END) RETURNING *",
            [user.id, actor.toLowerCase(), ...fields, isBoard ? "board" : "member", isBoard ? "active" : "pending"],
          );
          await audit(actor, "member:signup", "");
        }
        return json(row);
      }
      if (b === "export" && member) {
        const signups = await q("SELECT e.title, e.starts_at, s.created_at AS tilmeldt FROM event_signups s JOIN events e ON e.id = s.event_id WHERE s.member_id = $1", [member.id]);
        const ideas = await q("SELECT title, body, category, maturity, show_name AS navn_vist, wants_to_help AS vil_hjaelpe, status, created_at FROM ideas WHERE member_id = $1 ORDER BY created_at", [member.id]);
        const supported = await q("SELECT i.title, s.created_at FROM idea_supports s JOIN ideas i ON i.id = s.idea_id WHERE s.member_id = $1", [member.id]);
        const { identity_id, notes, ...pub } = member;
        return new Response(JSON.stringify({ medlem: pub, tilmeldinger: signups, ideer: ideas, stoettede_ideer: supported, eksporteret: new Date().toISOString() }, null, 2), {
          headers: { "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="mine-data-rca.json"' },
        });
      }
      if (b === "resign" && member && req.method === "POST") {
        if (member.role === "board") return err("Bestyrelsesmedlemmer skal først udtræde af bestyrelsen");
        await q("UPDATE members SET status = 'ended', ended_at = COALESCE(ended_at, NOW()), updated_at = NOW() WHERE id = $1", [member.id]);
        await audit(actor, "member:resign", String(member.id));
        return json({ ok: true });
      }
      return err("Ikke fundet", 404);
    }

    if (!member) return err("Opret din medlemsprofil først", 403);
    const isBoard = member.role === "board";
    const isActive = member.status === "active" || isBoard;

    // ----- members area -----
    if (a === "events" && isActive) {
      if (!b)
        return json(await q(
          `SELECT e.*, (SELECT COUNT(*)::int FROM event_signups s WHERE s.event_id = e.id) AS signups,
                  EXISTS(SELECT 1 FROM event_signups s WHERE s.event_id = e.id AND s.member_id = $1) AS mine
           FROM events e WHERE e.starts_at > NOW() - interval '1 day' ORDER BY e.starts_at`, [member.id]));
      if (c === "signup") {
        if (req.method === "POST") {
          const [ev] = await q<any>("SELECT capacity, (SELECT COUNT(*)::int FROM event_signups WHERE event_id = $1) AS n FROM events WHERE id = $1", [Number(b)]);
          if (!ev) return err("Arrangementet findes ikke", 404);
          if (ev.capacity && ev.n >= ev.capacity) return err("Arrangementet er fuldt");
          await q("INSERT INTO event_signups (event_id, member_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [Number(b), member.id]);
        } else if (req.method === "DELETE") {
          await q("DELETE FROM event_signups WHERE event_id = $1 AND member_id = $2", [Number(b), member.id]);
        }
        return json({ ok: true });
      }
    }
    // Høringer: kun for godkendte medlemmer
    if (a === "hearings" && isActive) {
      const OPEN = "status = 'open' AND deadline >= (NOW() AT TIME ZONE 'Europe/Copenhagen')::date";
      if (!b && req.method === "GET") {
        const hearings = await q<any>(`SELECT *, (${OPEN}) AS is_open FROM hearings WHERE status <> 'hidden' ORDER BY deadline DESC`);
        const mine = await q<any>("SELECT id, hearing_id, section, body, created_at FROM hearing_responses WHERE member_id = $1 ORDER BY created_at", [member.id]);
        return json(hearings.map((h) => ({ ...h, mine: mine.filter((r) => r.hearing_id === h.id) })));
      }
      if (b && c === "responses" && req.method === "POST") {
        const [h] = await q<any>(`SELECT id FROM hearings WHERE id = $1 AND ${OPEN}`, [Number(b)]);
        if (!h) return err("Høringen er lukket");
        const body = await req.json();
        const text = String(body.body || "").trim();
        if (!text) return err("Skriv dit høringssvar");
        if (text.length > 10000) return err("Høringssvaret er for langt (højst 10.000 tegn)");
        const [row] = await q("INSERT INTO hearing_responses (hearing_id, member_id, section, body) VALUES ($1,$2,$3,$4) RETURNING id, hearing_id, section, body, created_at",
          [h.id, member.id, String(body.section || "").slice(0, 100) || null, text]);
        await audit(actor, "hearing:response", `${h.id}`);
        return json(row, 201);
      }
      if (b && c === "responses" && d && req.method === "DELETE") {
        const [h] = await q<any>(`SELECT id FROM hearings WHERE id = $1 AND ${OPEN}`, [Number(b)]);
        if (!h) return err("Høringen er lukket, så svaret kan ikke trækkes tilbage");
        await q("DELETE FROM hearing_responses WHERE id = $1 AND member_id = $2 AND hearing_id = $3", [Number(d), member.id, h.id]);
        return json({ ok: true });
      }
    }
    // Idébank: kun for godkendte medlemmer
    if (a === "ideas" && isActive) {
      if (!b && req.method === "GET")
        return json(await q(
          `SELECT i.id, i.title, i.body, i.category, i.maturity, i.status, i.board_reply, i.hidden, i.created_at,
                  i.show_name, i.wants_to_help,
                  CASE WHEN i.show_name THEN m.name END AS author,
                  (i.member_id = $1) AS mine,
                  (SELECT COUNT(*)::int FROM idea_supports s WHERE s.idea_id = i.id) AS supports,
                  EXISTS(SELECT 1 FROM idea_supports s WHERE s.idea_id = i.id AND s.member_id = $1) AS supported
           FROM ideas i LEFT JOIN members m ON m.id = i.member_id
           WHERE NOT i.hidden OR i.member_id = $1
           ORDER BY i.created_at DESC`, [member.id]));
      if (!b && req.method === "POST") {
        const input = ideaInput(await req.json());
        if (input.error) return err(input.error);
        const [row] = await q("INSERT INTO ideas (member_id, title, body, category, maturity, show_name, wants_to_help) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id",
          [member.id, ...input.values!]);
        await audit(actor, "idea:create", String(row.id));
        return json(row, 201);
      }
      if (b && !c && (req.method === "PATCH" || req.method === "DELETE")) {
        const [own] = await q<any>("SELECT id, status FROM ideas WHERE id = $1 AND member_id = $2", [Number(b), member.id]);
        if (!own) return err("Du kan kun ændre dine egne idéer", 403);
        if (own.status !== "new") return err("Bestyrelsen er gået i gang med idéen, så den kan ikke længere ændres. Skriv til bestyrelsen, hvis noget skal rettes.");
        if (req.method === "DELETE") {
          await q("DELETE FROM ideas WHERE id = $1", [own.id]);
          await audit(actor, "idea:delete", String(own.id));
          return json({ ok: true });
        }
        const input = ideaInput(await req.json());
        if (input.error) return err(input.error);
        await q("UPDATE ideas SET title=$1, body=$2, category=$3, maturity=$4, show_name=$5, wants_to_help=$6, updated_at=NOW() WHERE id=$7", [...input.values!, own.id]);
        return json({ ok: true });
      }
      if (b && c === "support") {
        const [idea] = await q("SELECT id FROM ideas WHERE id = $1 AND NOT hidden", [Number(b)]);
        if (!idea) return err("Idéen findes ikke", 404);
        if (req.method === "POST") await q("INSERT INTO idea_supports (idea_id, member_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [Number(b), member.id]);
        else if (req.method === "DELETE") await q("DELETE FROM idea_supports WHERE idea_id = $1 AND member_id = $2", [Number(b), member.id]);
        return json({ ok: true });
      }
    }
    if (a === "articles" && isActive)
      return json(await q("SELECT * FROM articles WHERE published ORDER BY created_at DESC"));
    if (a === "documents" && isActive)
      return json({
        folders: await q("SELECT id, name, parent_id FROM folders WHERE visibility = 'members' ORDER BY name"),
        docs: await q("SELECT id, title, category, url, body, doc_date, created_at, folder_id FROM documents WHERE visibility = 'members' ORDER BY COALESCE(doc_date, created_at::date) DESC"),
      });
    if (["events", "articles", "documents", "hearings", "ideas"].includes(a)) return err("Dit medlemskab afventer godkendelse fra bestyrelsen", 403);

    // ----- board -----
    if (a === "admin") {
      if (!isBoard) return err("Kun for bestyrelsen", 403);

      if (b === "dashboard") {
        const [counts] = await q<any>(`SELECT
          COUNT(*) FILTER (WHERE status='active')::int AS active,
          COUNT(*) FILTER (WHERE status='pending')::int AS pending,
          COUNT(*) FILTER (WHERE status='active' AND (fee_paid_year IS NULL OR fee_paid_year < EXTRACT(YEAR FROM NOW())))::int AS unpaid,
          (SELECT COUNT(*)::int FROM ideas WHERE status = 'new') AS new_ideas
          FROM members`);
        const tasks = await q("SELECT * FROM tasks WHERE status <> 'done' ORDER BY due_date NULLS LAST LIMIT 8");
        const events = await q("SELECT e.id, e.title, e.starts_at, (SELECT COUNT(*)::int FROM event_signups s WHERE s.event_id=e.id) AS signups FROM events e WHERE starts_at > NOW() ORDER BY starts_at LIMIT 5");
        const wheel = await q<any>("SELECT * FROM year_wheel");
        const upcoming = upcomingWheel(wheel);
        return json({ counts, tasks, events, upcoming });
      }

      if (b === "members") {
        if (!c && req.method === "GET") return json(await q("SELECT * FROM members ORDER BY status = 'pending' DESC, status = 'ended', name"));
        if (!c && req.method === "POST") {
          const body = await req.json();
          const email = String(body.email || "").trim().toLowerCase();
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return err("Ugyldig e-mail");
          if (!String(body.name || "").trim()) return err("Navn skal udfyldes");
          const [exists] = await q("SELECT id FROM members WHERE lower(email) = $1", [email]);
          if (exists) return err("Der findes allerede et medlem med den e-mail");
          const [row] = await q(
            "INSERT INTO members (email, name, phone, postal_code, city, affiliation, role, status, fee_paid_year, notes, membership_type, joined_at) VALUES ($1,$2,$3,$4,$5,$6,$7,'active',$8,$9,$10,NOW()) RETURNING *",
            [email, String(body.name).trim(), clean(body.phone) ?? null, clean(body.postal_code) ?? null, clean(body.city) ?? null, clean(body.affiliation) ?? null,
             body.role === "board" ? "board" : "member", body.fee_paid_year ? Number(body.fee_paid_year) : null, clean(body.notes) ?? null, memberType(body.membership_type)],
          );
          await audit(actor, "member:create", `${row.id} ${body.role === "board" ? "board" : "member"}`);
          return json(row, 201);
        }
        if (c === "export.csv") {
          const year = Number(url.searchParams.get("year")) || null;
          const where = year
            ? "joined_at < make_date($1::int + 1, 1, 1) AND (ended_at IS NULL OR ended_at >= make_date($1::int, 1, 1))"
            : "status <> 'ended'";
          const rows = await q<any>("SELECT member_no, name, email, phone, postal_code, city, affiliation, CASE membership_type WHEN 'fuldt' THEN 'Fuldt' WHEN 'studie' THEN 'Studie/pensionist/barn' WHEN 'stoette' THEN 'Støtte' END AS membership_type, CASE role WHEN 'board' THEN 'Bestyrelse' ELSE 'Medlem' END AS role, CASE status WHEN 'active' THEN 'Aktiv' WHEN 'pending' THEN 'Afventer' ELSE 'Udmeldt' END AS status, fee_paid_year, to_char(joined_at AT TIME ZONE 'Europe/Copenhagen', 'YYYY-MM-DD') AS joined_at, to_char(ended_at AT TIME ZONE 'Europe/Copenhagen', 'YYYY-MM-DD') AS ended_at FROM members WHERE " + where + " ORDER BY member_no", year ? [year] : []);
          const header = ["medlemsnr", "navn", "email", "telefon", "postnr", "by", "tilknytning", "medlemstype", "rolle", "status", "kontingent_betalt_aar", "indmeldt", "udmeldt"];
          const csv = "﻿" + [header.join(";"), ...rows.map((r) => Object.values(r).map(csvEscape).join(";"))].join("\n");
          await audit(actor, "members:export", `${year ?? "aktuelle"}: ${rows.length}`);
          return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="rca-medlemmer-${year ?? "aktuelle"}.csv"` } });
        }
        if (c === "year") {
          const year = Number(d);
          if (!year) return err("Angiv et år");
          return json(await q("SELECT * FROM members WHERE joined_at < make_date($1::int + 1, 1, 1) AND (ended_at IS NULL OR ended_at >= make_date($1::int, 1, 1)) ORDER BY member_no", [year]));
        }
        if (c && req.method === "PATCH") {
          const body = await req.json();
          const allowed = ["name", "phone", "postal_code", "city", "affiliation", "membership_type", "role", "status", "fee_paid_year", "notes"];
          if ("membership_type" in body) body.membership_type = memberType(body.membership_type);
          const cols = allowed.filter((k) => k in body);
          if (Number(c) === member.id && "role" in body && body.role !== "board") return err("Du kan ikke fjerne din egen bestyrelsesrolle");
          if (!cols.length) return err("Ingen felter");
          let [row] = await q<any>(`UPDATE members SET ${cols.map((k, i) => `${k}=$${i + 1}`).join(", ")}, updated_at=NOW() WHERE id=$${cols.length + 1} RETURNING *`, [...cols.map((k) => clean(body[k])), Number(c)]);
          // Hold medlemsperioden ved lige, når status ændres
          if (row && "status" in body)
            [row] = await q<any>(
              `UPDATE members SET
                 joined_at = CASE WHEN status = 'active' AND joined_at IS NULL THEN NOW() ELSE joined_at END,
                 ended_at = CASE WHEN status = 'ended' THEN COALESCE(ended_at, NOW()) WHEN status = 'active' THEN NULL ELSE ended_at END
               WHERE id = $1 RETURNING *`, [row.id]);
          await audit(actor, "member:update", `${c} ${cols.join(",")}`);
          return json(row);
        }
        if (c && req.method === "DELETE") {
          if (Number(c) === member.id) return err("Du kan ikke slette dig selv");
          const [m] = await q<any>("SELECT joined_at FROM members WHERE id = $1", [Number(c)]);
          if (m?.joined_at) return err("Medlemmer, der har været aktive, kan ikke slettes, fordi foreningen skal kunne dokumentere sine medlemmer. Meld dem ud i stedet.");
          await q("DELETE FROM members WHERE id = $1", [Number(c)]);
          await audit(actor, "member:delete", c);
          return json({ ok: true });
        }
      }

      if (b === "events" && d === "signups") {
        return json(await q("SELECT m.name, m.email, s.created_at FROM event_signups s JOIN members m ON m.id = s.member_id WHERE s.event_id = $1 ORDER BY s.created_at", [Number(c)]));
      }

      if (b === "hearings" && c && d === "responses") {
        if (req.method === "DELETE") {
          const r = await q("DELETE FROM hearing_responses WHERE hearing_id = $1 RETURNING id", [Number(c)]);
          await audit(actor, "hearing:delete-responses", `${c}: ${r.length}`);
          return json({ deleted: r.length });
        }
        return json(await q(
          "SELECT r.id, r.section, r.body, r.created_at, m.name, m.email, m.member_no FROM hearing_responses r JOIN members m ON m.id = r.member_id WHERE r.hearing_id = $1 ORDER BY r.created_at",
          [Number(c)]));
      }
      if (b === "hearings" && c && d === "export.csv") {
        const rows = await q<any>(
          "SELECT COALESCE(r.section, 'Ikke angivet') AS section, m.member_no, m.name, m.email, to_char(r.created_at AT TIME ZONE 'Europe/Copenhagen', 'YYYY-MM-DD HH24:MI') AS created, r.body FROM hearing_responses r JOIN members m ON m.id = r.member_id WHERE r.hearing_id = $1 ORDER BY r.section, r.created_at",
          [Number(c)]);
        const csv = "\uFEFF" + [["paragraf", "medlemsnr", "navn", "email", "tidspunkt", "svar"].join(";"), ...rows.map((r) => Object.values(r).map(csvEscape).join(";"))].join("\n");
        await audit(actor, "hearing:export", `${c}: ${rows.length}`);
        return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="hoeringssvar-${c}.csv"` } });
      }

      if (b === "ideas") {
        if (!c && req.method === "GET")
          return json(await q(
            `SELECT i.*, m.name AS member_name, m.email AS member_email, m.member_no,
                    (SELECT COUNT(*)::int FROM idea_supports s WHERE s.idea_id = i.id) AS supports
             FROM ideas i LEFT JOIN members m ON m.id = i.member_id
             ORDER BY i.status = 'new' DESC, i.created_at DESC`));
        if (c && req.method === "PATCH") {
          const body = await req.json();
          const sets: string[] = []; const vals: unknown[] = [];
          if ("status" in body) { const s = oneOf(body.status, IDEA_STATUSES); if (!s) return err("Ukendt status"); vals.push(s); sets.push(`status = $${vals.length}`); }
          if ("board_reply" in body) { vals.push(String(body.board_reply || "").trim().slice(0, 4000) || null); sets.push(`board_reply = $${vals.length}`); }
          if ("hidden" in body) { vals.push(!!body.hidden); sets.push(`hidden = $${vals.length}`); }
          if ("category" in body) { vals.push(oneOf(body.category, IDEA_CATEGORIES)); sets.push(`category = $${vals.length}`); }
          if (!sets.length) return err("Ingen felter");
          vals.push(Number(c));
          const [row] = await q(`UPDATE ideas SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $${vals.length} RETURNING *`, vals);
          await audit(actor, "idea:update", `${c} ${Object.keys(body).join(",")}`);
          return json(row || null);
        }
        if (c && req.method === "DELETE") {
          await q("DELETE FROM ideas WHERE id = $1", [Number(c)]);
          await audit(actor, "idea:delete", c);
          return json({ ok: true });
        }
      }

      if (b === "audit") return json(await q("SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 200"));

      if (b && TABLES[b]) return crud(req, b, c, actor);
    }

    return err("Ikke fundet", 404);
  } catch (e: any) {
    console.error(e);
    return err(e?.message || "Serverfejl", 500);
  }
};

export const config: Config = { path: "/api/*" };
