import React from "react";
import { fmtDate } from "./api.js";

// Path from root to folder id, e.g. [{id:1,name:"Referater"},{id:4,name:"2026"}]
export function folderPath(folders, id) {
  const byId = Object.fromEntries(folders.map((f) => [f.id, f]));
  const path = [];
  let cur = byId[id];
  while (cur) { path.unshift(cur); cur = byId[cur.parent_id]; }
  return path;
}

// All folders as an indented list for <select>, excluding `exclude` and its descendants
export function folderOptions(folders, exclude = null) {
  const out = [];
  const walk = (parent, depth) => {
    folders.filter((f) => (f.parent_id ?? null) === parent && f.id !== exclude)
      .sort((a, b) => a.name.localeCompare(b.name, "da"))
      .forEach((f) => { out.push([f.id, "  ".repeat(depth) + (depth ? "↳ " : "") + f.name]); walk(f.id, depth + 1); });
  };
  walk(null, 0);
  return out;
}

const countIn = (folders, docs, id) => {
  const sub = folders.filter((f) => f.parent_id === id);
  return docs.filter((d) => d.folder_id === id).length + sub.reduce((n, f) => n + countIn(folders, docs, f.id), 0);
};

export function FolderView({ folders, docs, current, setCurrent, onOpenFolder, onOpenDoc, editable }) {
  const path = current ? folderPath(folders, current) : [];
  const subFolders = folders.filter((f) => (f.parent_id ?? null) === (current ?? null)).sort((a, b) => a.name.localeCompare(b.name, "da"));
  const here = docs.filter((d) => (d.folder_id ?? null) === (current ?? null));
  return (
    <>
      <div className="row small" style={{ marginBottom: 12 }}>
        <a href="#" onClick={(e) => { e.preventDefault(); setCurrent(null); }}>📁 Dokumenter</a>
        {path.map((f) => (
          <React.Fragment key={f.id}>
            <span className="muted">/</span>
            <a href="#" onClick={(e) => { e.preventDefault(); setCurrent(f.id); }}>{f.name}</a>
          </React.Fragment>
        ))}
      </div>
      <div className="table-wrap"><table>
        <thead><tr><th>Navn</th><th>Type</th><th>Dato</th>{editable && <th>Synlighed</th>}<th></th></tr></thead>
        <tbody>
          {current && (
            <tr><td colSpan={editable ? 5 : 4}><a href="#" onClick={(e) => { e.preventDefault(); setCurrent(path.length > 1 ? path[path.length - 2].id : null); }}>↑ Op</a></td></tr>
          )}
          {subFolders.map((f) => (
            <tr key={"f" + f.id}>
              <td><a href="#" onClick={(e) => { e.preventDefault(); setCurrent(f.id); }}><b>📁 {f.name}</b></a></td>
              <td className="muted">Mappe · {countIn(folders, docs, f.id)} dok.</td>
              <td></td>
              {editable && <td>{f.visibility === "members" ? "Medlemmer" : "Bestyrelsen"}</td>}
              <td style={{ textAlign: "right" }}>{editable && <button className="btn small ghost" onClick={() => onOpenFolder(f)}>Redigér</button>}</td>
            </tr>
          ))}
          {here.map((d) => (
            <tr key={"d" + d.id}>
              <td>📄 {d.url ? <a href={d.url} target="_blank" rel="noreferrer">{d.title}</a> : d.title}{d.body && <div className="muted small article-body">{d.body}</div>}</td>
              <td><span className="pill">{d.category}</span></td>
              <td>{fmtDate(d.doc_date || d.created_at)}</td>
              {editable && <td>{d.visibility === "members" ? "Medlemmer" : "Bestyrelsen"}</td>}
              <td style={{ textAlign: "right" }}>{editable && <button className="btn small ghost" onClick={() => onOpenDoc(d)}>Åbn</button>}</td>
            </tr>
          ))}
          {!subFolders.length && !here.length && <tr><td colSpan={editable ? 5 : 4} className="empty">Mappen er tom.</td></tr>}
        </tbody>
      </table></div>
    </>
  );
}
