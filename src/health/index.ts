import { existsSync } from "node:fs";
import { path, readJson } from "../lib/util.js";
import { REQUIRED_SECRETS } from "../publish/youtube.js";
export function health() {
  const missing = REQUIRED_SECRETS.filter((k) => !process.env[k]);
  const report = readJson<Record<string, unknown>>(
    path("work/latest/run-report.json"),
    {},
  );
  const siteBuilt = existsSync(path("dist/index.html"));
  const healthy =
    report.status === "skipped" ||
    ((report.status === "rendered" ||
      report.status === "published" ||
      report.status === "uploaded-private" ||
      report.status === "uploaded-pending") &&
      siteBuilt);
  return {
    healthy,
    at: new Date().toISOString(),
    uploadEnabled: process.env.ENABLE_PUBLICATION === "true",
    missingSecrets: missing,
    siteBuilt,
    lastRun: report.status ?? "not run",
    readyForPublication:
      healthy && !missing.length &&
      process.env.ENABLE_PUBLICATION === "true" &&
      report.review === "two-live-checkers",
  };
}
