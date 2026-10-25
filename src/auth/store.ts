import {
  cloudflareApi,
  resolveAccount,
  type CfApi,
  type CfEnvVar,
} from "../site/cloudflare.js";
import { env, path, readJson } from "../lib/util.js";
import { unseal } from "./seal.js";

/**
 * The one-link YouTube authorization. The founder opens /auth/youtube on our site, picks the
 * channel and clicks Allow. A Cloudflare Pages Function (functions/auth/youtube/) swaps the code
 * for a refresh token, seals it (src/auth/seal.ts) and saves the sealed value as a variable on our
 * own Pages project. The daily job reads it back here and unseals it with the client secret.
 * Nothing to copy or paste.
 */

export const SEALED_VAR = "YT_TOKEN_SEALED";

function project(): string | null {
  return "theyleakedyou";
}

async function cf(): Promise<{
  api: CfApi;
  account: string;
  project: string;
} | null> {
  const token = env("CLOUDFLARE_API_TOKEN");
  const p = project();
  if (!token || !p) return null;
  const api = cloudflareApi(token);
  return {
    api,
    account: await resolveAccount(api, env("CLOUDFLARE_ACCOUNT_ID")),
    project: p,
  };
}

export interface AuthState {
  connected: boolean;
  channelTitle?: string;
  channelId?: string;
  at?: string;
}

async function readVars(): Promise<Record<string, CfEnvVar | null> | null> {
  const c = await cf();
  if (!c) return null;
  const r = await c.api.get(c.account, c.project);
  if (!r.success)
    throw new Error(
      `Cloudflare project read failed: ${r.errors?.[0]?.message ?? r.status}`,
    );
  return r.result.deployment_configs?.production?.env_vars ?? {};
}

export async function authState(): Promise<AuthState> {
  const vars = await readVars();
  const v = (k: string) => vars?.[k]?.value || undefined;
  return {
    connected: Boolean(v(SEALED_VAR)),
    channelTitle: v("YT_CHANNEL_TITLE"),
    channelId: v("YT_CHANNEL_ID"),
    at: v("YT_AUTH_AT"),
  };
}

/** The refresh token: a plain secret if one was set by hand, otherwise the sealed one from the one-link step. */
export async function refreshToken(): Promise<string | undefined> {
  const secret = env("YOUTUBE_CLIENT_SECRET");
  if (!secret) return undefined;
  const sealed = (await readVars())?.[SEALED_VAR]?.value;
  return sealed ? unseal(sealed, secret) : undefined;
}

/**
 * Give the Pages Function what it needs. Values come from GitHub secrets; Cloudflare stores the
 * secret ones write-only. The sealed token is carried over so it can never be dropped by this call.
 */
export async function armAuthFunction(): Promise<string> {
  const c = await cf();
  const id = env("YOUTUBE_CLIENT_ID");
  const secret = env("YOUTUBE_CLIENT_SECRET");
  if (!c) return "Cloudflare not set up yet";
  if (!id || !secret) return "Google sign-in client not added yet";
  const current = await readVars();
  const keep = (k: string) =>
    current?.[k]?.value
      ? { [k]: { type: "plain_text" as const, value: current[k]!.value } }
      : {};
  const r = await c.api.setEnv(c.account, c.project, {
    GOOGLE_CLIENT_ID: { type: "plain_text", value: id },
    GOOGLE_CLIENT_SECRET: { type: "secret_text", value: secret },
    CF_API_TOKEN: { type: "secret_text", value: env("CLOUDFLARE_API_TOKEN")! },
    CF_ACCOUNT_ID: { type: "plain_text", value: c.account },
    CF_PROJECT: { type: "plain_text", value: c.project },
    ALLOWED_HANDLE: { type: "plain_text", value: "@TheyLeakedYou" },
    ...keep(SEALED_VAR),
    ...keep("YT_CHANNEL_TITLE"),
    ...keep("YT_CHANNEL_ID"),
    ...keep("YT_AUTH_AT"),
    ...keep("YT_PINNED_CHANNEL_ID"),
    ...keep("TLY_PROJECT_OWNER"),
  });
  if (!r.success)
    throw new Error(
      `could not arm the authorize link: ${r.errors?.[0]?.message ?? r.status}`,
    );
  return `authorize link ready at https://${c.project}.pages.dev/auth/youtube`;
}

/**
 * Forget the stored YouTube connection, so the one link can be used again (reset_youtube in the daily job).
 * The pinned channel ID stays: a reconnect must be the same channel.
 */
export async function resetAuth(): Promise<void> {
  const c = await cf();
  if (!c) return;
  const result = await c.api.setEnv(c.account, c.project, {
    [SEALED_VAR]: null,
    YT_CHANNEL_TITLE: null,
    YT_CHANNEL_ID: null,
    YT_AUTH_AT: null,
  });
  if (!result.success)
    throw new Error(
      "Could not reset the connection; pinned identity was not changed",
    );
}

/** Immutable identity, never cleared by resetAuth. */
export async function pinnedChannelId(): Promise<string | undefined> {
  return (await readVars())?.YT_PINNED_CHANNEL_ID?.value || undefined;
}
