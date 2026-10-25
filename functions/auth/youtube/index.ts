import {
  ALLOWED_HANDLE,
  SCOPES,
  challenge,
  cookie,
  makeState,
  page,
  projectVars,
  random,
  ready,
  redirectUri,
  type Env,
} from "./_shared";
export async function onRequestGet({
  request,
  env,
}: {
  request: Request;
  env: Env;
}) {
  if (!ready(env))
    return page(
      "Not ready yet",
      "<p>The owner must finish the Google client setup.</p>",
      503,
    );
  if (new URL(request.url).searchParams.get("agree") !== "yes")
    return page(
      "Connect the owner channel",
      `<p>This connects only ${ALLOWED_HANDLE}. Google will request upload, video-management and channel analytics permissions for the owner's publishing workflow. No visitor sign-in is provided.</p><p>Read our <a href="/privacy/">Privacy Policy</a> and <a href="/terms/">Terms</a> before continuing.</p><form method="get"><button name="agree" value="yes">I agree and authorize with Google</button></form>`,
    );
  try {
    const vars = await projectVars(env);
    if (vars.YT_TOKEN_SEALED?.value)
      return page(
        "Already connected",
        "<p>No change was made. Reconnection requires the owner to reset the stored connection, preserving its pinned channel ID.</p>",
      );
    const nonce = random(),
      verifier = random();
    const q = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID!,
      redirect_uri: redirectUri(),
      response_type: "code",
      scope: SCOPES,
      access_type: "offline",
      prompt: "consent select_account",
      state: await makeState(env.GOOGLE_CLIENT_SECRET!, nonce),
      code_challenge: await challenge(verifier),
      code_challenge_method: "S256",
    });
    const response = new Response(null, {
      status: 302,
      headers: {
        location: `https://accounts.google.com/o/oauth2/v2/auth?${q}`,
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
      },
    });
    response.headers.append("set-cookie", cookie("__Host-yt-state", nonce));
    response.headers.append(
      "set-cookie",
      cookie("__Host-yt-verifier", verifier),
    );
    return response;
  } catch {
    return page(
      "Connection unavailable",
      "<p>No credentials were displayed. Try again after the owner checks setup.</p>",
      503,
    );
  }
}
