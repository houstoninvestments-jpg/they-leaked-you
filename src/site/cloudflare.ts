import { path, readJson, writeJson } from "../lib/util.js";

/**
 * Cloudflare Pages (free plan) through its API, with the same Pages-only token Scam or Not uses.
 * The site goes to theyleakedyou.pages.dev only.
 */

export const CF_PROJECT_CANDIDATES = ["theyleakedyou"];
export const WRANGLER = "wrangler@4.151.2";
const CF_API = "https://api.cloudflare.com/client/v4";
const SAVED = () =>
  process.env.SITE_TARGET_FILE || path("data/site-target.json");

export type SiteTarget =
  | { kind: "github-pages"; baseUrl: string }
  | { kind: "cloudflare"; baseUrl: string; project: string; account: string };

interface CfResponse<T> {
  success: boolean;
  errors: { code: number; message: string }[];
  result: T;
}
export interface CfEnvVar {
  type: "plain_text" | "secret_text";
  value: string;
}
export interface CfProject {
  name: string;
  subdomain: string;
  deployment_configs?: {
    production?: { env_vars?: Record<string, CfEnvVar | null> };
  };
}

export function cloudflareApi(token: string, fetchImpl: typeof fetch = fetch) {
  const call = async <T>(
    method: string,
    rel: string,
    body?: unknown,
  ): Promise<CfResponse<T> & { status: number }> => {
    const res = await fetchImpl(`${CF_API}${rel}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = (await res
      .json()
      .catch(() => ({
        success: false,
        errors: [{ code: res.status, message: res.statusText }],
        result: null,
      }))) as CfResponse<T>;
    return { ...j, status: res.status };
  };
  return {
    accounts: () => call<{ id: string; name: string }[]>("GET", "/accounts"),
    get: (a: string, name: string) =>
      call<CfProject>("GET", `/accounts/${a}/pages/projects/${name}`),
    create: (a: string, name: string) =>
      call<CfProject>("POST", `/accounts/${a}/pages/projects`, {
        name,
        production_branch: "main",
      }),
    /** Change only the named variables (null removes one). Others are kept by Cloudflare. */
    setEnv: (a: string, name: string, vars: Record<string, CfEnvVar | null>) =>
      call<CfProject>("PATCH", `/accounts/${a}/pages/projects/${name}`, {
        deployment_configs: { production: { env_vars: vars } },
      }),
  };
}

export type CfApi = ReturnType<typeof cloudflareApi>;

/** The account ID if given; otherwise the token's only account, so one less value to paste. */
export async function resolveAccount(
  api: CfApi,
  given?: string,
): Promise<string> {
  if (given) return given;
  const r = await api.accounts();
  if (r.success && r.result?.length === 1) return r.result[0].id;
  throw new Error(
    `could not work out the Cloudflare account (${r.result?.length ?? 0} accounts visible); set CLOUDFLARE_ACCOUNT_ID`,
  );
}
