import { seal } from "../../../src/auth/seal";
import {
  ALLOWED_HANDLE,
  channelCheck,
  checkState,
  clearCookies,
  cookies,
  esc,
  page,
  projectVars,
  ready,
  redirectUri,
  saveVars,
  type Env,
} from "./_shared";
export async function onRequestGet({
  request,
  env,
}: {
  request: Request;
  env: Env;
}) {
  const done = (title: string, body: string, status = 200) =>
    clearCookies(page(title, body, status));
  if (!ready(env))
    return done("Not ready yet", "<p>Owner setup is incomplete.</p>", 503);
  const url = new URL(request.url),
    jar = cookies(request);
  if (
    !(await checkState(
      env.GOOGLE_CLIENT_SECRET!,
      url.searchParams.get("state"),
      jar["__Host-yt-state"],
    )) ||
    !jar["__Host-yt-verifier"]
  )
    return done(
      "Link expired",
      "<p>Start again from the authorize link in this browser.</p>",
      400,
    );
  if (url.searchParams.has("error") || !url.searchParams.get("code"))
    return done(
      "Not connected",
      "<p>Authorization was not completed. Nothing was saved.</p>",
      400,
    );
  try {
    const vars = await projectVars(env);
    if (vars.YT_TOKEN_SEALED?.value)
      return done("Already connected", "<p>Nothing was changed.</p>");
    // Google's authorization code is single-use; PKCE binds it to this browser's verifier.
    const tok = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: url.searchParams.get("code")!,
        client_id: env.GOOGLE_CLIENT_ID!,
        client_secret: env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: redirectUri(),
        grant_type: "authorization_code",
        code_verifier: jar["__Host-yt-verifier"]!,
      }),
    });
    const t: any = await tok.json();
    if (!tok.ok || !t.refresh_token || !t.access_token)
      return done(
        "Not connected",
        "<p>A long-lived connection was not returned. Start again and review Google's consent screen.</p>",
        400,
      );
    const ch = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
      { headers: { authorization: `Bearer ${t.access_token}` } },
    );
    const c: any = await ch.json();
    const item = ch.ok && c.items?.length === 1 ? c.items[0] : null;
    const channel = item
      ? {
          id: String(item.id),
          title: String(item.snippet?.title ?? ""),
          handle: String(item.snippet?.customUrl ?? ""),
        }
      : null;
    const latest = await projectVars(env);
    const verdict = channelCheck(
      channel,
      ALLOWED_HANDLE,
      latest.YT_PINNED_CHANNEL_ID?.value || undefined,
    );
    if (!verdict.ok) {
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: t.refresh_token }),
      });
      return done(
        "Wrong channel",
        `<p>${esc(verdict.why)}. Nothing was saved.</p>`,
        403,
      );
    }
    if (latest.YT_TOKEN_SEALED?.value)
      return done(
        "Already connected",
        "<p>Another connection finished first. Nothing was changed.</p>",
      );
    await saveVars(env, {
      YT_TOKEN_SEALED: await seal(t.refresh_token, env.GOOGLE_CLIENT_SECRET!),
      YT_CHANNEL_ID: channel!.id,
      YT_PINNED_CHANNEL_ID: latest.YT_PINNED_CHANNEL_ID?.value || channel!.id,
      YT_CHANNEL_TITLE: channel!.title,
      YT_AUTH_AT: new Date().toISOString(),
    });
    return done(
      "Connected",
      `<p>${esc(channel!.title)} is connected. You may close this page.</p>`,
    );
  } catch {
    return done(
      "Connection unavailable",
      "<p>Setup could not be verified. The owner should check the connection before trying again.</p>",
      503,
    );
  }
}
