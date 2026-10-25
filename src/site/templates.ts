import { DISCLAIMER, type Leak } from "../types.js";
export const BASE = "https://theyleakedyou.pages.dev";
export const esc = (s: string | number) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function safeUrl(s: string): string {
  try {
    const u = new URL(s);
    return u.protocol === "https:" && !u.username && !u.password ? u.href : "#";
  } catch {
    return "#";
  }
}
export const noticePath = (l: Leak) => `/leaks/${encodeURIComponent(l.slug)}/`;
export function page(title: string, body: string, path = "/") {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="Public breach notices, what was exposed, and calm next steps. No personal data collection."><link rel="canonical" href="${BASE}${path}"><title>${esc(title)} | They Leaked You</title><style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#101419;color:#f4f6f8;font:18px/1.65 system-ui,sans-serif}a{color:#9be5c3;text-underline-offset:.2em}header,main,footer{max-width:920px;margin:auto;padding:24px}header{display:flex;gap:20px;justify-content:space-between;flex-wrap:wrap;border-bottom:1px solid #3a4149}nav{display:flex;gap:20px;flex-wrap:wrap}h1{font-size:clamp(2.4rem,6vw,4rem);line-height:1.08;letter-spacing:-.04em}h2{line-height:1.25}p,li{max-width:72ch}.tag{color:#9be5c3;text-transform:uppercase;font-size:.78rem;letter-spacing:.16em}.card{background:#192128;border:1px solid #3a4149;border-radius:12px;padding:24px;margin:22px 0}.small{color:#bac3ce;font-size:.9rem}footer{border-top:1px solid #3a4149;margin-top:40px}a:focus-visible{outline:3px solid #ffcf70;outline-offset:4px}li{margin:.5em 0}.badge{display:inline-block;padding:4px 10px;border:1px solid #9be5c3;border-radius:6px}</style></head><body><header><a href="/" aria-label="They Leaked You home">THEY LEAKED YOU</a><nav aria-label="Main"><a href="/today/">Today</a><a href="/archive/">Archive</a><a href="/privacy/">Privacy</a></nav></header><main>${body}</main><footer><p>${DISCLAIMER}</p><nav aria-label="Footer"><a href="/privacy/">Privacy</a><a href="/terms/">Terms</a><a href="https://www.youtube.com/@TheyLeakedYou">YouTube</a></nav><p class="small">Public notices, not individual exposure checks. No victim records. No company logos.</p></footer></body></html>`;
}
export function card(l: Leak) {
  return `<article class="card"><p class="tag">Leak ${esc(l.number)} · ${esc(l.date)}</p>${l.review !== "two-live-checkers" ? '<p class="badge">Offline preview. Not AI-validated for publication.</p>' : l.status !== "published" ? '<p class="badge">Not publicly published on YouTube.</p>' : ""}<h2><a href="${noticePath(l)}">${esc(l.notice.company)}</a></h2><p>${esc(l.notice.characterization)}</p><p class="small">Reported ${esc(l.notice.reportedDate)} · Source: ${esc(l.notice.publisher)}</p></article>`;
}
