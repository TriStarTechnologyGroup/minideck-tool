// Dependency-free CSV helpers (client + server safe). Used by the bulk import UI
// and CSV export. Handles quoted fields, embedded commas/newlines, and "" escaping.

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const s = text.replace(/\r\n?/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n") {
      row.push(field); field = "";
      rows.push(row); row = [];
    } else field += c;
  }
  row.push(field);
  rows.push(row);
  // Drop fully-empty trailing rows.
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

const HEADERS: Record<string, string[]> = {
  first_name: ["first name", "first", "firstname", "fname", "given name"],
  last_name: ["last name", "last", "lastname", "lname", "surname", "family name"],
  position: ["position", "title", "job title", "jobtitle", "role"],
  company: ["company", "organization", "organisation", "org", "account"],
  email: ["email", "e-mail", "email address"],
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ParsedContact = {
  first_name: string;
  last_name: string;
  position: string | null;
  company: string | null;
  email: string;
};
export type CsvParseResult = {
  rows: ParsedContact[];
  errors: { line: number; reason: string }[];
  mappedHeaders: Record<string, number>;
};

/** Parse pasted/uploaded CSV text into validated contact rows. Requires a header row. */
export function parseContactsCsv(text: string): CsvParseResult {
  const grid = parseCsv(text);
  const errors: { line: number; reason: string }[] = [];
  if (grid.length === 0) return { rows: [], errors: [{ line: 0, reason: "No data" }], mappedHeaders: {} };

  const header = grid[0].map((h) => h.trim().toLowerCase());
  const map: Record<string, number> = {};
  for (const [field, names] of Object.entries(HEADERS)) {
    const idx = header.findIndex((h) => names.includes(h));
    if (idx >= 0) map[field] = idx;
  }
  if (map.email === undefined) {
    return { rows: [], errors: [{ line: 1, reason: "Missing an 'email' column in the header row" }], mappedHeaders: map };
  }

  const rows: ParsedContact[] = [];
  for (let i = 1; i < grid.length; i++) {
    const cells = grid[i];
    const get = (f: string) => (map[f] !== undefined ? (cells[map[f]] ?? "").trim() : "");
    const email = get("email").toLowerCase();
    const first_name = get("first_name");
    const last_name = get("last_name");
    if (!email) { errors.push({ line: i + 1, reason: "Missing email" }); continue; }
    if (!EMAIL_RE.test(email)) { errors.push({ line: i + 1, reason: `Invalid email: ${email}` }); continue; }
    if (!first_name || !last_name) { errors.push({ line: i + 1, reason: `Missing first/last name for ${email}` }); continue; }
    rows.push({
      first_name,
      last_name,
      position: get("position") || null,
      company: get("company") || null,
      email,
    });
  }
  return { rows, errors, mappedHeaders: map };
}

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Serialize an array of objects to CSV text given ordered columns. */
export function toCsv(columns: { key: string; label: string }[], rows: Record<string, unknown>[]): string {
  const head = columns.map((c) => csvCell(c.label)).join(",");
  const body = rows.map((r) => columns.map((c) => csvCell(r[c.key])).join(",")).join("\n");
  return `${head}\n${body}`;
}

/** Trigger a client-side CSV download. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
