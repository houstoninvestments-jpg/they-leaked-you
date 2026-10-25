import { setupSite, deploySite } from "./site/deploy.js";
import { runDaily } from "./pipeline/daily.js";
import { AnthropicLLM } from "./llm/client.js";
import { health } from "./health/index.js";
import { learn } from "./learn/index.js";
import { buildSite } from "./site/build.js";
import { path, readJson, writeJson } from "./lib/util.js";
import { slotFor } from "./pipeline/slots.js";
import type { Ledger } from "./types.js";
const args = process.argv.slice(2);
const command = args[0];
if (command === "daily") {
  // Explicit --live and ENABLE_PUBLICATION both required. Default is always zero-paid-call offline preview.
  const dryRun = !args.includes("--live") || args.includes("--dry-run");
  const offline = dryRun || args.includes("--offline");
  let slot: number | undefined;
  if (process.env.SCHEDULE_CRON) {
    const gate = slotFor(process.env.SCHEDULE_CRON);
    if (!gate.go) {
      console.log(gate.why);
      writeJson(path("work/latest/run-report.json"), {
        status: "skipped",
        reason: gate.why,
      });
      process.exit(0);
    }
    slot = gate.slot;
  }
  if (args.includes("--slot")) slot = Number(args[args.indexOf("--slot") + 1]);
  const llm =
    !dryRun && process.env.ANTHROPIC_API_KEY ? new AnthropicLLM() : null;
  const report = await runDaily({ dryRun, offline, llm, slot });
  console.log(JSON.stringify(report, null, 2));
  if (report.status === "failed") process.exitCode = 1;
} else if (command === "setup") console.log(await setupSite());
else if (command === "deploy") console.log(await deploySite());
else if (command === "health") {
  const result = health();
  console.log(JSON.stringify(result, null, 2));
  if (!result.healthy) process.exitCode = 1;
} else if (command === "learn")
  console.log(await learn(!args.includes("--live")));
else if (command === "site")
  await buildSite(
    readJson<Ledger>(path("data/ledger.json"), {
      leaks: [],
      nextNumber: 1,
      slots: [],
    }).leaks,
    path("dist"),
  );
else throw Error("Use daily, site, learn or health");
