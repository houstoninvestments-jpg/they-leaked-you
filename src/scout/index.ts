import { Notice, type Ledger } from "../types.js";
import { path, readJson, writeJson } from "../lib/util.js";
export const SOURCE = "https://data.wa.gov/resource/sb4j-ca4h.json";
export const TYPES = "https://data.wa.gov/resource/padd-mby7.json";
const allowed = new Set(["data.wa.gov"]);
export function officialUrl(value: string) {
  const u = new URL(value);
  return (
    u.protocol === "https:" &&
    allowed.has(u.hostname) &&
    ["/resource/sb4j-ca4h.json", "/resource/padd-mby7.json"].includes(
      u.pathname,
    )
  );
}
export function validateNotice(input: unknown) {
  const n = Notice.parse(input);
  if (!officialUrl(n.sourceUrl) || n.evidence.some((e) => !officialUrl(e.url)))
    throw Error("Unapproved source");
  if (
    !/^\d+$/.test(n.id) ||
    new URL(n.sourceUrl).searchParams.get("id") !== n.id ||
    n.evidence.some((e) => new URL(e.url).searchParams.get("id") !== n.id)
  )
    throw Error("Source ID mismatch");
  const evidence = (field: string) => {
    const entries = n.evidence.filter((e) => e.field === field);
    if (entries.length !== 1)
      throw Error(`Missing or ambiguous evidence: ${field}`);
    return entries[0].quote;
  };
  if (evidence("company") !== n.company)
    throw Error("Company evidence mismatch");
  if (
    evidence("reportedDate").slice(0, 10) !== n.reportedDate ||
    !/^\d{4}-\d{2}-\d{2}$/.test(n.reportedDate) ||
    !Number.isFinite(Date.parse(n.reportedDate))
  )
    throw Error("Report date evidence mismatch");
  if (
    n.count === null ||
    evidence("count") !== String(n.count) ||
    n.countScope !== "Washington residents"
  )
    throw Error("Count evidence mismatch");
  const quotedTypes = evidence("dataTypes")
    .split(";")
    .map((t) => t.trim())
    .sort();
  if (JSON.stringify(quotedTypes) !== JSON.stringify([...n.dataTypes].sort()))
    throw Error("Data category evidence mismatch");
  if (
    n.humanNoticeUrl &&
    (new URL(n.humanNoticeUrl).hostname !== "www.atg.wa.gov" ||
      new URL(n.humanNoticeUrl).protocol !== "https:")
  )
    throw Error("Unapproved human notice URL");
  if (n.emailOnly)
    throw Error("This dataset cannot establish email exclusivity");
  if (n.characterization !== "reported a breach affecting")
    throw Error("Unsupported characterization");
  if (
    n.exposedDate &&
    (evidence("exposedDate").slice(0, 10) !== n.exposedDate ||
      !/^\d{4}-\d{2}-\d{2}$/.test(n.exposedDate) ||
      !Number.isFinite(Date.parse(n.exposedDate)))
  )
    throw Error("Incident start date evidence mismatch");
  if (/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(JSON.stringify(n)))
    throw Error("Personal contact data forbidden");
  return n;
}
export async function scout(offline: boolean) {
  if (offline)
    return readJson<unknown[]>(path("data/notices.json"), []).map(
      validateNotice,
    );
  const robots = await fetch("https://data.wa.gov/robots.txt");
  if (!robots.ok)
    throw Error("Unable to verify source robots policy; source skipped");
  const policy = await robots.text();
  if (/^Disallow:\s*(?:\/\s*$|\/resource)/im.test(policy))
    throw Error(
      "Source robots policy disallows resource access; source skipped",
    );
  await new Promise((r) => setTimeout(r, 1100));
  const response = await fetch(
    SOURCE + "?$limit=30&$order=datesubmitted%20DESC",
  );
  if (!response.ok) throw Error("Official source unavailable");
  const rows = (await response.json()) as Record<string, string>[];
  const out = [];
  const drops: { id: string; reason: string }[] = [];
  for (const row of rows) {
    try {
      if (!/^\d+$/.test(row.id)) continue;
      await new Promise((r) => setTimeout(r, 1100));
      const url = TYPES + "?id=" + row.id;
      const r = await fetch(url);
      if ([403, 429].includes(r.status)) {
        drops.push({
          id: row.id,
          reason: "Source declined or rate limited; stopped without retry",
        });
        break;
      }
      if (!r.ok) {
        drops.push({
          id: row.id,
          reason: "Category request failed: " + r.status,
        });
        continue;
      }
      const types = (await r.json()) as Record<string, string>[];
      const dataTypes = [
        ...new Set(types.map((t) => t.informationtype).filter(Boolean)),
      ];
      if (!dataTypes.length) continue;
      const sourceUrl = SOURCE + "?id=" + row.id;
      const count = Number(row.washingtoniansaffected);
      if (!Number.isSafeInteger(count) || count < 1) continue;
      // Whitelist only aggregate fields. Never persist source response bodies, names of victims or attachments.
      const n = validateNotice({
        id: row.id,
        company: row.name,
        characterization: "reported a breach affecting",
        reportedDate: row.datesubmitted.slice(0, 10),
        exposedDate: row.datestart?.slice(0, 10) ?? null,
        count,
        countScope: "Washington residents",
        dataTypes,
        emailOnly: false,
        sourceUrl,
        publisher: "Washington Attorney General",
        verifiedAt: new Date().toISOString(),
        evidence: [
          { field: "company", quote: row.name, url: sourceUrl },
          { field: "reportedDate", quote: row.datesubmitted, url: sourceUrl },
          { field: "count", quote: row.washingtoniansaffected, url: sourceUrl },
          { field: "dataTypes", quote: dataTypes.join("; "), url },
          ...(row.datestart
            ? [{ field: "exposedDate", quote: row.datestart, url: sourceUrl }]
            : []),
        ],
      });
      out.push(n);
    } catch (error) {
      drops.push({
        id: /^\d+$/.test(row.id) ? row.id : "unknown",
        reason: error instanceof Error ? error.message : "Malformed row",
      });
    }
  }
  writeJson(path("work/latest/source-drops.json"), drops);
  writeJson(path("data/notices.json"), out);
  return out;
}
export function eligible(notices: Notice[], ledger: Ledger, now = new Date()) {
  return notices.filter(
    (n) =>
      !ledger.leaks.some(
        (l) =>
          l.status !== "rendered" &&
          (l.notice.id === n.id ||
            (l.notice.company.trim().replace(/\s+/g, " ").toLowerCase() ===
              n.company.trim().replace(/\s+/g, " ").toLowerCase() &&
              now.getTime() - Date.parse(l.date) < 7 * 86400000)),
      ),
  );
}
