import { path, readJson } from "../lib/util.js";
import type { Ledger } from "../types.js";
import { accessToken } from "../publish/youtube.js";
interface Retention {
  expiresAt?: string;
  rows?: {
    hookVariant: string;
    views: number;
    averageViewPercentage: number;
  }[];
}
let inMemory: Retention = {};
export function clearRetention() {
  inMemory = {};
}
export async function learn(offline = true) {
  clearRetention();
  if (offline)
    return {
      status: "skipped",
      reason:
        "Offline dry run: no analytics calls, no fabricated retention learning",
    };
  const ledger = readJson<Ledger>(path("data/ledger.json"), {
    nextNumber: 1,
    leaks: [],
    slots: [],
  });
  const token = await accessToken();
  const rows = [];
  for (const l of ledger.leaks
    .filter(
      (l) => l.youtubeId && Date.now() - Date.parse(l.date) < 30 * 86400000,
    )
    .slice(-50)) {
    const u = new URL("https://youtubeanalytics.googleapis.com/v2/reports");
    u.search = new URLSearchParams({
      ids: "channel==MINE",
      startDate: l.date,
      endDate: new Date().toISOString().slice(0, 10),
      metrics: "views,averageViewPercentage",
      filters: "video==" + l.youtubeId,
    }).toString();
    const r = await fetch(u, { headers: { authorization: "Bearer " + token } });
    if (!r.ok) continue;
    const j = (await r.json()) as { rows?: number[][] };
    if (j.rows?.length)
      rows.push({
        number: l.number,
        hookVariant: l.hookVariant,
        views: j.rows[0][0],
        averageViewPercentage: j.rows[0][1],
      });
  }
  inMemory = { expiresAt: new Date(Date.now() + 3600000).toISOString(), rows };
  return { status: rows.length ? "available" : "insufficient" };
}
/** Use only measured retention; small samples remain exploration, never fabricated winners. */
export function chooseHook(
  company: string,
  count: number | null,
  scope: string,
  history: { hookVariant: string }[],
  retention?: {
    expiresAt?: string;
    rows?: {
      hookVariant: string;
      views: number;
      averageViewPercentage: number;
    }[];
  },
) {
  const options = [
    { id: "brand-direct-v1", text: "They leaked you." },
    { id: "brand-company-v1", text: `They leaked you. ${company}.` },
    {
      id: "brand-count-v1",
      text: count
        ? `They leaked you. ${count.toLocaleString("en-US")} ${scope}.`
        : "They leaked you.",
    },
  ];
  const saved = retention ?? inMemory;
  const rows =
    saved.expiresAt && Date.parse(saved.expiresAt) > Date.now()
      ? (saved.rows ?? [])
      : [];
  const eligible = options.filter(
    (o) =>
      rows.filter(
        (r) =>
          r.hookVariant === o.id &&
          r.views >= 100 &&
          Number.isFinite(r.averageViewPercentage),
      ).length >= 3,
  );
  if (eligible.length >= 2) {
    // Rank direct provider observations. Never derive weighted averages or additional API metrics.
    const observations = rows
      .filter(
        (r) =>
          eligible.some((o) => o.id === r.hookVariant) &&
          r.views >= 100 &&
          Number.isFinite(r.averageViewPercentage),
      )
      .sort((a, b) => b.averageViewPercentage - a.averageViewPercentage);
    const selected = eligible.find(
      (o) => o.id === observations[0].hookVariant,
    )!;
    return { ...selected, basis: "measured retention" };
  }
  const counts = options
    .map((o) => ({
      ...o,
      used: history.slice(-9).filter((r) => r.hookVariant === o.id).length,
    }))
    .sort((a, b) => a.used - b.used);
  return {
    ...counts[0],
    basis: "balanced exploration; insufficient retention evidence",
  };
}
