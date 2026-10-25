import { durableUpload } from "../publish/checkpoint.js";
import { join } from "node:path";
import { config } from "../lib/config.js";
import { path, readJson, writeJson, slugify, today } from "../lib/util.js";
import type { Ledger, Leak } from "../types.js";
import { scout, eligible } from "../scout/index.js";
import { templateScript, write, videoTitle } from "../writer/index.js";
import {
  check,
  mechanicalCheck,
  spokenLines,
  severity,
} from "../checker/index.js";
import type { LLM } from "../llm/client.js";
import { synthesize } from "../voice/index.js";
import {
  prepareTimeline,
  renderShort,
  probe,
  assertShort,
  readWindowChecks,
  assertReadWindowChecks,
  extractCover,
} from "../render/index.js";
import { CLOSER, DISCLAIMER, type BreachProps } from "../../remotion/props.js";
import {
  publicationGate,
  publish,
  uploadRequest,
  verifyConnectedIdentity,
} from "../publish/youtube.js";
import { buildSite } from "../site/build.js";
import { deploySite } from "../site/deploy.js";
import { learn, chooseHook, clearRetention } from "../learn/index.js";
import { health } from "../health/index.js";
export async function runDaily(opts: {
  dryRun: boolean;
  offline: boolean;
  llm: LLM | null;
  slot?: number;
}) {
  if (opts.dryRun) opts = { ...opts, offline: true, llm: null };
  const work = path("work/latest");
  const date = today("America/Los_Angeles");
  const report: any = {
    date,
    dryRun: opts.dryRun,
    status: "failed",
    review: "offline-not-ai-validated",
    steps: [],
    errors: [],
  };
  const ledgerFile = path(
    opts.dryRun ? "work/dry-ledger.json" : "data/ledger.json",
  );
  const ledger: Ledger = opts.dryRun
    ? { nextNumber: 1, leaks: [], slots: [] }
    : readJson<Ledger>(ledgerFile, {
        nextNumber: 1,
        leaks: [],
        slots: [],
      });
  try {
    if (!opts.dryRun) {
      const attempts = readJson<{ state: string }[]>(
        path("data/upload-attempts.json"),
        [],
      );
      if (attempts.some((a) => a.state === "pending"))
        throw Error(
          "Prior upload outcome uncertain; owner must reconcile before another attempt",
        );
      publicationGate(false, "two-live-checkers");
      if (!opts.llm || opts.llm.mode !== "live")
        throw Error("Live model client required");
      await verifyConnectedIdentity();
      if (![1, 2, 3].includes(opts.slot ?? 0))
        throw Error("Live run requires valid Pacific schedule slot");
      if (
        ledger.slots.includes(`${date}:${opts.slot}`) ||
        ledger.leaks.filter((l) => l.date === date && l.status !== "rendered")
          .length >= 3
      ) {
        report.status = "skipped";
        return report;
      }
    }
    if (!opts.dryRun) await learn(false);
    const notices = eligible(await scout(opts.offline), ledger);
    report.steps.push({ step: "scout", count: notices.length });
    let chosen: Leak | undefined;
    for (const n of notices.slice(0, 8)) {
      if (
        severity(n) === "UNKNOWN" ||
        videoTitle(n, ledger.nextNumber).length > 100
      ) {
        report.steps.push({
          step: "skip",
          id: n.id,
          reason: "Risk category uncertain or exact title too long",
        });
        continue;
      }
      const hook = chooseHook(n.company, n.count, n.countScope, ledger.leaks);
      const s =
        opts.llm?.mode === "live"
          ? await write(opts.llm, n, hook.text)
          : templateScript(n);
      if (opts.llm?.mode !== "live") s.hook = hook.text;
      const mech = mechanicalCheck(s, n);
      if (!mech.ok) {
        report.steps.push({
          step: "mechanical",
          id: n.id,
          problems: mech.problems,
        });
        continue;
      }
      const verdict = await check(opts.llm, s, n);
      report.steps.push({
        step: "independent-fact-checks",
        id: n.id,
        ...verdict,
      });
      if (!verdict.pass && (!opts.dryRun || opts.llm?.mode === "live"))
        continue;
      chosen = {
        number: ledger.nextNumber,
        slug: `${String(ledger.nextNumber).padStart(3, "0")}-${slugify(n.company)}`,
        date,
        notice: n,
        script: s,
        status: "rendered",
        review: verdict.pass ? "two-live-checkers" : "offline-not-ai-validated",
        hookVariant: hook.id,
      };
      break;
    }
    if (!chosen) {
      report.status = "skipped";
      report.errors.push("No notice safely qualified");
      return report;
    }
    report.review = chosen.review;
    const voice = synthesize(
      spokenLines(chosen.script).map((text, i) => ({
        id: ["hook", "receipt", "result", "stamp", "closer"][i],
        text,
      })),
      join(work, "audio"),
    );
    const publicDir = join(work, "public");
    const timeline = prepareTimeline(voice, publicDir);
    const n = chosen.notice;
    const props: BreachProps = {
      number: chosen.number,
      hook: chosen.script.hook,
      card: {
        company: n.company,
        reportDate: n.reportedDate,
        affectedCount: n.count?.toLocaleString("en-US") ?? "Not reported",
        countScope: n.countScope,
        dataTypes: n.dataTypes,
        sourceLabel: n.publisher,
        sourceUrl: n.sourceUrl,
        emailOnly: n.emailOnly,
      },
      severity: severity(n),
      timeline,
      testLabel:
        chosen.review === "offline-not-ai-validated"
          ? "OFFLINE PREVIEW · NOT AI-VALIDATED"
          : opts.dryRun
            ? "DRY RUN · NOT PUBLISHED"
            : "",
      voiceLabel: voice.label,
      closer: CLOSER,
      disclaimer: DISCLAIMER,
    };
    writeJson(join(work, "props.json"), props);
    const file = join(work, "leak-001-preview.mp4");
    await renderShort(props, publicDir, file);
    const video = probe(file);
    assertShort(video);
    const pixels = readWindowChecks(file, timeline.beats);
    assertReadWindowChecks(pixels);
    extractCover(file, file.replace(".mp4", "-cover.jpg"));
    report.video = file;
    report.steps.push({ step: "render", video, pixels });
    writeJson(join(work, "upload-request.json"), uploadRequest(chosen));
    if (!opts.dryRun) {
      const attempts = readJson<any[]>(path("data/upload-attempts.json"), []);
      const attempt = {
        noticeId: n.id,
        at: new Date().toISOString(),
        state: "pending",
        videoId: "",
      };
      attempts.push(attempt);
      writeJson(path("data/upload-attempts.json"), attempts);
      const uploaded = await durableUpload(() => publish(chosen!, file, false));
      attempt.videoId = uploaded.id;
      writeJson(path("data/upload-attempts.json"), attempts);
      chosen.youtubeId = uploaded.id;
      chosen.status = uploaded.state as Leak["status"];
      ledger.slots.push(`${date}:${opts.slot}`);
    }
    ledger.leaks.push(chosen);
    ledger.nextNumber++;
    writeJson(ledgerFile, ledger);
    if (!opts.dryRun) {
      const attempts = readJson<any[]>(path("data/upload-attempts.json"), []);
      for (const a of attempts)
        if (a.videoId === chosen.youtubeId) a.state = "complete";
      writeJson(path("data/upload-attempts.json"), attempts);
    }
    await buildSite(ledger.leaks, path("dist"));
    if (!opts.dryRun) await deploySite();
    report.steps.push({
      step: "site",
      status: opts.dryRun
        ? "built locally; deployment not performed in dry run"
        : "deployed to dedicated Cloudflare project",
    });
    report.learning = await learn(opts.dryRun);
    report.status = opts.dryRun ? "rendered" : chosen.status;
    return report;
  } catch (e) {
    report.errors.push(e instanceof Error ? e.message : String(e));
    return report;
  } finally {
    clearRetention();
    const calls = opts.llm?.calls ?? [];
    report.cost = {
      basis:
        "estimated USD from inherited reference rate table dated 2026-10-06; not verified billing",
      calls,
      usd: calls.some((c) => c.usd === null)
        ? null
        : calls.reduce((a, c) => a + (c.usd ?? 0), 0),
      actualModelCalls: calls.length,
    };
    const costs = readJson<unknown[]>(path("data/costs.json"), []);
    costs.push({
      at: new Date().toISOString(),
      status: report.status,
      dryRun: opts.dryRun,
      ...report.cost,
    });
    writeJson(path("data/costs.json"), costs);
    writeJson(join(work, "run-report.json"), report);
    writeJson(join(work, "health.json"), health());
  }
}
