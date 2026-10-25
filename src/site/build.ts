import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { type Leak } from "../types.js";
import { safeAction, severity } from "../checker/index.js";
import { card, esc, noticePath, page, safeUrl } from "./templates.js";
import { privacyPage, termsPage } from "./legal.js";
export function detailPage(l: Leak) {
  const n = l.notice;
  return page(
    `${n.company} · Leak ${l.number}`,
    `<p class="tag">Leak ${esc(l.number)} · ${esc(l.date)}</p><h1>${esc(n.company)}</h1>${l.review !== "two-live-checkers" ? '<p class="badge">Offline preview. Not AI-validated for publication.</p>' : ""}<p>${esc(n.characterization)}</p><section class="card"><h2>The notice</h2><p>Reported: ${esc(n.reportedDate)}. ${n.exposedDate ? `Incident start date stated in source: ${esc(n.exposedDate)}.` : "Incident start date: not stated here."}</p><p>${n.count === null ? "Count: not established." : `${esc(n.count.toLocaleString("en-US"))} ${esc(n.countScope)} reported. This is the notice's scope, not an independently verified count of distinct people.`}</p><p><a href="${esc(safeUrl(n.humanNoticeUrl ?? n.sourceUrl))}" rel="noopener noreferrer">Read the public notice from ${esc(n.publisher)}</a></p></section><section><h2>What leaked</h2><p class="badge">${esc(severity(n))}</p>${n.dataTypes.length ? `<ul>${n.dataTypes.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : "<p>The data categories were not established.</p>"}<p>These are reported categories, not a finding that your own information was involved.</p></section><section class="card"><h2>Safe steps</h2><p>${esc(safeAction(n))}</p><p>Navigate directly to services you already know. Do not follow unexpected recovery messages or share personal details with someone who contacts you.</p><p><a href="https://haveibeenpwned.com/" rel="noopener noreferrer">Free check at Have I Been Pwned</a></p><p class="small">Independent service. Not every incident is listed there. Any information entered goes to that service, not to us.</p></section>`,
    noticePath(l),
  );
}
export function buildSite(leaks: Leak[], outDir = "dist/site") {
  const root = resolve(outDir);
  mkdirSync(root, { recursive: true });
  const put = (file: string, html: string) => {
    const target = resolve(root, file);
    if (!target.startsWith(root + "/"))
      throw new Error("Invalid site output path");
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, html);
  };
  for (const l of leaks) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(l.slug))
      throw new Error("Invalid notice slug");
    const publicFields = [
      l.notice.company,
      l.notice.characterization,
      l.notice.publisher,
      l.notice.countScope,
      ...l.notice.dataTypes,
    ].join(" ");
    if (/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(publicFields))
      throw new Error("Personal contact details are forbidden on the site");
  }
  const sorted = [...leaks].sort(
    (a, b) => b.date.localeCompare(a.date) || b.number - a.number,
  );
  const latest = sorted[0];
  const intro =
    '<p class="tag">Public facts. Practical next steps.</p><h1>They leaked you.</h1><p>What companies reported. What information was involved. What you can safely do next.</p><p class="small">The name is a warning, not a claim that you personally were affected.</p>';
  const home =
    intro +
    (latest
      ? card(latest)
      : '<section class="card"><h2>No verified notice published yet</h2><p>We skip stories when facts cannot be established.</p></section>') +
    '<p><a href="/archive/">Browse the notice archive</a></p>';
  put("index.html", page("Public breach notices", home));
  put(
    "today/index.html",
    page(
      "Today",
      `<h1>Latest notice</h1><p>Publication dates are shown on each entry; the latest may not be from today.</p>${latest ? card(latest) : "<p>No notice published yet.</p>"}`,
      "/today/",
    ),
  );
  put(
    "archive/index.html",
    page(
      "Archive",
      `<h1>Notice archive</h1><p>Each entry links to the original public notice.</p>${sorted.map(card).join("") || "<p>No notices published yet.</p>"}`,
      "/archive/",
    ),
  );
  for (const l of sorted) put(`leaks/${l.slug}/index.html`, detailPage(l));
  put("privacy/index.html", privacyPage());
  put("terms/index.html", termsPage());
  put(
    "404.html",
    page(
      "Not found",
      '<h1>Page not found</h1><p><a href="/archive/">Go to the notice archive</a>.</p>',
      "/404.html",
    ),
  );
  put(
    "_headers",
    "/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n",
  );
  return root;
}
