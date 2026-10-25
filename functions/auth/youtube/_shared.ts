export const ALLOWED_HANDLE = "@TheyLeakedYou";
export const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.force-ssl",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
].join(" ");
export interface Env {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  CF_API_TOKEN?: string;
  CF_ACCOUNT_ID?: string;
  CF_PROJECT?: string;
}
export const ready = (e: Env) =>
  Boolean(
    e.GOOGLE_CLIENT_ID &&
      e.GOOGLE_CLIENT_SECRET &&
      e.CF_API_TOKEN &&
      e.CF_ACCOUNT_ID &&
      e.CF_PROJECT === "theyleakedyou",
  );
export const redirectUri = (_req?: Request) =>
  "https://theyleakedyou.pages.dev/auth/youtube/callback";
const enc = new TextEncoder();
export const b64u = (b: Uint8Array) =>
  btoa(String.fromCharCode(...b))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
export const random = () => b64u(crypto.getRandomValues(new Uint8Array(32)));
export const challenge = async (s: string) =>
  b64u(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s))));
async function hmac(secret: string, msg: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return b64u(
    new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(msg))),
  );
}
export async function makeState(
  secret: string,
  nonce: string,
  now = Date.now(),
) {
  const value = `${now}.${nonce}`;
  return `${value}.${await hmac(secret, value)}`;
}
export async function checkState(
  secret: string,
  state: string | null,
  nonce: string | undefined,
  now = Date.now(),
) {
  if (!state || !nonce) return false;
  const [stamp, randomPart, signature, extra] = state.split(".");
  const time = Number(stamp);
  if (
    extra ||
    !Number.isFinite(time) ||
    now - time > 600_000 ||
    time > now ||
    randomPart !== nonce ||
    !signature
  )
    return false;
  const expected = await hmac(secret, `${stamp}.${randomPart}`);
  if (signature.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++)
    diff |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
export function cookies(req: Request): Record<string, string> {
  return Object.fromEntries(
    (req.headers.get("cookie") || "")
      .split(";")
      .map((s) => s.trim().split("="))
      .filter((p) => p.length === 2),
  );
}
export const cookie = (name: string, value: string, age = 600) =>
  `${name}=${value}; Path=/; Max-Age=${age}; HttpOnly; Secure; SameSite=Lax`;
export function clearCookies(response: Response) {
  response.headers.append("set-cookie", cookie("__Host-yt-state", "", 0));
  response.headers.append("set-cookie", cookie("__Host-yt-verifier", "", 0));
  return response;
}
export interface Channel {
  id: string;
  title: string;
  handle: string;
}
export function channelCheck(
  ch: Channel | null,
  allowedHandle = ALLOWED_HANDLE,
  pinnedId?: string,
): { ok: true } | { ok: false; why: string } {
  if (!ch?.id || !/^UC[\w-]{22}$/.test(ch.id))
    return { ok: false, why: "No valid YouTube channel was returned" };
  if (pinnedId)
    return ch.id === pinnedId
      ? { ok: true }
      : {
          ok: false,
          why: "This site is permanently tied to a different channel",
        };
  const norm = (s: string) => `@${s.trim().toLowerCase().replace(/^@/, "")}`;
  return ch.handle && norm(ch.handle) === norm(allowedHandle)
    ? { ok: true }
    : { ok: false, why: `Select ${ALLOWED_HANDLE}, not another channel` };
}
export async function projectVars(
  e: Env,
): Promise<Record<string, { value?: string } | null>> {
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${e.CF_ACCOUNT_ID}/pages/projects/${e.CF_PROJECT}`,
    { headers: { authorization: `Bearer ${e.CF_API_TOKEN}` } },
  );
  const j: any = await r.json();
  if (!r.ok || !j.success)
    throw new Error("Could not read connection settings");
  return j.result?.deployment_configs?.production?.env_vars ?? {};
}
export async function saveVars(e: Env, vars: Record<string, string>) {
  const env_vars = Object.fromEntries(
    Object.entries(vars).map(([k, value]) => [
      k,
      { type: "plain_text", value },
    ]),
  );
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${e.CF_ACCOUNT_ID}/pages/projects/${e.CF_PROJECT}`,
    {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${e.CF_API_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        deployment_configs: { production: { env_vars } },
      }),
    },
  );
  const j: any = await r.json();
  if (!r.ok || !j.success) throw new Error("Could not save connection");
}
export const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function page(title: string, body: string, status = 200) {
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)} | They Leaked You</title><body><main><h1>${esc(title)}</h1>${body}<p>We never ask for your information. Facts from public breach notices.</p><p><a href="/privacy/">Privacy</a> · <a href="/terms/">Terms</a></p></main></body></html>`,
    {
      status,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
        "x-content-type-options": "nosniff",
        "content-security-policy":
          "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      },
    },
  );
}
