export async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`/api/${path}`, {
    method,
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const type = res.headers.get("content-type") || "";
  const data = type.includes("json") ? await res.json() : await res.text();
  if (!res.ok) throw new Error((data && data.error) || `Fejl ${res.status}`);
  return data;
}

export const fmtDate = (d, withTime = false) => {
  if (!d) return "";
  const date = new Date(d);
  return date.toLocaleDateString("da-DK", {
    day: "numeric", month: "long", year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
};

export const MONTHS = ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"];

export function download(path, filename) {
  const a = document.createElement("a");
  a.href = `/api/${path}`;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export const MEMBERSHIP = [
  ["fuldt", "Fuldt medlemskab", "Fulde medlemsrettigheder, herunder stemmeret"],
  ["studie", "Studie-, pensionist- og børnemedlemskab", "For studerende på SU, pensionister og børn til og med 17 år. Stemmeret fra 18 år"],
  ["stoette", "Støttemedlemskab", "For familie, venner, fagfolk og andre. Taleret, ikke stemmeret"],
];
export const membershipLabel = (v) => ({ fuldt: "Fuldt", studie: "Studie/pension./barn", stoette: "Støtte" }[v] || "");
