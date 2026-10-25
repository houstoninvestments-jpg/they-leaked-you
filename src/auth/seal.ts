/**
 * Seals the YouTube refresh token so it can sit in a readable place (a Cloudflare Pages
 * variable) without being readable. Key = SHA-256 of a label plus the OAuth client secret,
 * which only GitHub Actions secrets and the Pages project secrets hold. AES-256-GCM.
 * Plain WebCrypto, so the same code runs in Node and in the Cloudflare Pages Function.
 */

const LABEL = "they-leaked-you:youtube-refresh-token:v1:";
const enc = new TextEncoder();

const b64u = (b: Uint8Array) =>
  btoa(String.fromCharCode(...b))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const unb64u = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
    c.charCodeAt(0),
  );

async function key(clientSecret: string) {
  const raw = await crypto.subtle.digest(
    "SHA-256",
    enc.encode(LABEL + clientSecret),
  );
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function seal(
  token: string,
  clientSecret: string,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      await key(clientSecret),
      enc.encode(token),
    ),
  );
  return `v1.${b64u(iv)}.${b64u(ct)}`;
}

export async function unseal(
  sealed: string,
  clientSecret: string,
): Promise<string> {
  const [v, iv, ct] = sealed.split(".");
  if (v !== "v1" || !iv || !ct)
    throw new Error("sealed token has an unknown format");
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: unb64u(iv) },
    await key(clientSecret),
    unb64u(ct),
  );
  return new TextDecoder().decode(pt);
}
