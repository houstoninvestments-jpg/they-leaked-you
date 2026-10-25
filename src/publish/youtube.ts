import { readFileSync, statSync } from "node:fs";
import { DISCLAIMER, type Leak } from "../types.js";
import { config } from "../lib/config.js";
import { requireEnv } from "../lib/util.js";
import { refreshToken, pinnedChannelId } from "../auth/store.js";
import { videoTitle } from "../writer/index.js";
export function uploadRequest(l: Leak) {
  return {
    snippet: {
      title: videoTitle(l.notice, l.number),
      description: [
        l.script.description,
        `Official notice: ${l.notice.sourceUrl}`,
        `Details and safe steps: ${config().site.baseUrl}/leaks/${l.slug}/`,
        DISCLAIMER,
        "AI voice disclosure: Narration uses an AI-generated Kokoro voice.",
        "#TheyLeakedYou #DataBreach #Privacy #Shorts",
      ].join("\n\n"),
      categoryId: "25",
      defaultLanguage: "en",
      defaultAudioLanguage: "en",
    },
    status: {
      privacyStatus: "private",
      selfDeclaredMadeForKids: false,
      containsSyntheticMedia: true,
    },
  };
}
export const REQUIRED_SECRETS = [
  "ANTHROPIC_API_KEY",
  "YOUTUBE_CLIENT_ID",
  "YOUTUBE_CLIENT_SECRET",
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
];
export function publicationGate(dryRun: boolean, review: string) {
  if (dryRun) throw Error("Dry run: all external writes prohibited");
  if (process.env.ENABLE_PUBLICATION !== "true")
    throw Error("Publication disabled until owner explicitly enables it");
  if (review !== "two-live-checkers")
    throw Error("Two actual independent AI checks required");
  const missing = REQUIRED_SECRETS.filter((k) => !process.env[k]);
  if (missing.length)
    throw Error("Missing required secrets: " + missing.join(", "));
}
export async function accessToken() {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: (await refreshToken()) ?? "",
      client_id: requireEnv("YOUTUBE_CLIENT_ID"),
      client_secret: requireEnv("YOUTUBE_CLIENT_SECRET"),
    }),
  });
  if (!r.ok) throw Error("OAuth refresh failed");
  return ((await r.json()) as { access_token: string }).access_token;
}
export async function verifyConnectedIdentity() {
  const token = await accessToken();
  const headers = { authorization: `Bearer ${token}` };
  const who = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
    { headers },
  );
  if (!who.ok) throw Error("Unable to verify channel");
  const channels = (
    (await who.json()) as {
      items: { id: string; snippet: { customUrl: string } }[];
    }
  ).items;
  const pin = await pinnedChannelId();
  if (!pin) throw Error("No pinned channel identity; authorize first");
  if (
    channels.length !== 1 ||
    channels[0].id !== pin ||
    channels[0].snippet.customUrl.toLowerCase().replace(/^@/, "") !==
      "theyleakedyou"
  )
    throw Error(
      "Pinned channel ID and @TheyLeakedYou must match before upload",
    );
  return token;
}
export async function publish(l: Leak, file: string, dryRun: boolean) {
  publicationGate(dryRun, l.review);
  const token = await verifyConnectedIdentity();
  const headers = { authorization: `Bearer ${token}` };
  const meta = uploadRequest(l);
  if (process.env.APPROVE_PUBLIC_UPLOADS === "true")
    meta.status.privacyStatus = "public";
  if (meta.snippet.title.length > 100)
    throw Error("YouTube title exceeds100 chars");
  const r = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        ...headers,
        "content-type": "application/json",
        "x-upload-content-length": String(statSync(file).size),
        "x-upload-content-type": "video/mp4",
      },
      body: JSON.stringify(meta),
    },
  );
  if (!r.ok) throw Error("Upload initiation failed");
  const location = r.headers.get("location");
  if (!location || new URL(location).hostname !== "www.googleapis.com")
    throw Error("Unexpected upload destination");
  const response = await fetch(location, {
    method: "PUT",
    headers: { ...headers, "content-type": "video/mp4" },
    body: readFileSync(file),
  });
  if (!response.ok)
    throw Error("Video upload failed; check account before retry");
  const id = ((await response.json()) as { id: string }).id;
  const verify = await fetch(
    "https://www.googleapis.com/youtube/v3/videos?part=status&id=" +
      encodeURIComponent(id),
    { headers },
  );
  if (!verify.ok)
    throw Error("Uploaded but status uncertain; inspect YouTube before retry");
  const observed = (
    (await verify.json()) as {
      items: { status: { privacyStatus: string; uploadStatus: string } }[];
    }
  ).items[0]?.status;
  if (!observed)
    throw Error(
      "Uploaded but no status readback; inspect YouTube before retry",
    );
  const state =
    observed.privacyStatus === "public" && observed.uploadStatus === "processed"
      ? "published"
      : observed.privacyStatus === "private"
        ? "uploaded-private"
        : "uploaded-pending";
  return { id, state };
}
