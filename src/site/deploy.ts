import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { armAuthFunction } from "../auth/store.js";
import { cloudflareApi, resolveAccount, WRANGLER } from "./cloudflare.js";
import { path, requireEnv, writeJson } from "../lib/util.js";
import { DISCLAIMER } from "../types.js";
const PROJECT = "theyleakedyou";
const OWNER_VAR = "TLY_PROJECT_OWNER";
export interface DeploymentResult {
  project: string;
  baseUrl: string;
  authorizationUrl?: string;
}
function validateStatic(directory: string) {
  if (resolve(directory) !== resolve(path("dist")))
    throw Error("Only the repository dist directory may be deployed");
  if (!existsSync(join(directory, "index.html")))
    throw Error("Build the site before deploying");
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name);
      if (entry.isSymbolicLink())
        throw Error("Symlinks are not allowed in deployment output");
      if (entry.isDirectory()) walk(file);
      else if (entry.name.endsWith(".html")) {
        const html = readFileSync(file, "utf8");
        if (!html.includes(DISCLAIMER))
          throw Error("A page is missing the required disclaimer");
        if (html.includes("Offline preview. Not AI-validated for publication."))
          throw Error("Offline previews cannot be deployed publicly");
      }
    }
  };
  walk(directory);
}
async function prepare(allowCreate: boolean) {
  const token = requireEnv("CLOUDFLARE_API_TOKEN");
  const owner = requireEnv("GITHUB_REPOSITORY");
  if (!/^[\w.-]+\/[\w.-]+$/.test(owner))
    throw Error("Invalid repository identity");
  const api = cloudflareApi(token),
    account = await resolveAccount(api, process.env.CLOUDFLARE_ACCOUNT_ID);
  let result = await api.get(account, PROJECT);
  if (!result.success) {
    if (result.status !== 404)
      throw Error(
        "Project lookup failed; refusing to create or overwrite anything",
      );
    if (!allowCreate)
      throw Error("Run the manual setup workflow before deployment");
    result = await api.create(account, PROJECT);
    if (!result.success || !result.result)
      throw Error("Could not create the dedicated Pages project");
    if (result.result.subdomain !== `${PROJECT}.pages.dev`)
      throw Error(
        "Exact public address is unavailable; nothing was deployed and no project was deleted",
      );
    const marked = await api.setEnv(account, PROJECT, {
      [OWNER_VAR]: { type: "plain_text", value: owner },
    });
    if (!marked.success)
      throw Error("Could not mark project ownership; no files were deployed");
  } else {
    if (result.result.subdomain !== `${PROJECT}.pages.dev`)
      throw Error("Unexpected project address; refusing deployment");
    if (
      result.result.deployment_configs?.production?.env_vars?.[OWNER_VAR]
        ?.value !== owner
    )
      throw Error(
        "Existing project is not marked as owned by this repository; refusing to overwrite it",
      );
  }
  writeJson(path("data/site-target.json"), {
    project: PROJECT,
    address: `https://${PROJECT}.pages.dev`,
  });
  return { account };
}
function upload(directory: string, account: string) {
  const result = spawnSync(
    "npx",
    [
      "--yes",
      WRANGLER,
      "pages",
      "deploy",
      directory,
      `--project-name=${PROJECT}`,
      "--branch=main",
      "--commit-dirty=true",
    ],
    {
      cwd: path(),
      stdio: "inherit",
      env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: account },
    },
  );
  if (result.error || result.status !== 0)
    throw Error(
      "Pages deployment failed; authorization setup was not reported as complete",
    );
}
/** Existing, repository-marked project only. Does not modify authorization settings. */
export async function deploySite(
  directory = path("dist"),
): Promise<DeploymentResult> {
  validateStatic(directory);
  const { account } = await prepare(false);
  upload(directory, account);
  return { project: PROJECT, baseUrl: `https://${PROJECT}.pages.dev` };
}
/** Manual owner-triggered setup; no credential creation and no uploads to YouTube. */
export async function setupSite(
  directory = path("dist"),
): Promise<DeploymentResult> {
  requireEnv("YOUTUBE_CLIENT_ID");
  requireEnv("YOUTUBE_CLIENT_SECRET");
  validateStatic(directory);
  const { account } = await prepare(true);
  // Deploy the legal pages and guarded Functions first, before installing authorization secrets.
  upload(directory, account);
  await armAuthFunction();
  // Pages takes an environment snapshot per deployment, so deploy again to activate settings.
  upload(directory, account);
  return {
    project: PROJECT,
    baseUrl: `https://${PROJECT}.pages.dev`,
    authorizationUrl: `https://${PROJECT}.pages.dev/auth/youtube`,
  };
}
