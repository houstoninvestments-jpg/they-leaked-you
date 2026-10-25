import { it, expect, vi } from "vitest";
const state = vi.hoisted(() => ({ writes: [] as string[], noNotices: false }));
vi.mock("../src/voice/index.js", () => ({
  synthesize: () => ({
    provider: "kokoro",
    label: "AI voice (Kokoro open model)",
    segments: [],
  }),
}));
vi.mock("../src/render/index.js", () => ({
  prepareTimeline: () => ({ fps: 30, total: 900, beats: [], captions: [] }),
  renderShort: async () => "/preview.mp4",
  probe: () => ({ width: 1080, height: 1920, seconds: 30, hasAudio: true }),
  assertShort: () => {},
  assertReadWindowChecks: () => {},
  readWindowChecks: () => ({ card: 0, result: 0 }),
  extractCover: () => ({ file: "/preview.jpg" }),
}));
vi.mock("../src/site/build.js", () => ({ buildSite: vi.fn(() => "/dist") }));
vi.mock("../src/lib/util.js", async (importOriginal) => {
  const original = await importOriginal<any>();
  return {
    ...original,
    writeJson: (name: string) => {
      state.writes.push(name);
    },
    readJson: (name: string, fallback: any) =>
      state.noNotices && name.endsWith("notices.json") ? [] : name.endsWith("notices.json") || name.endsWith("channel.json")
        ? original.readJson(name)
        : fallback,
  };
});
import { runDaily } from "../src/pipeline/daily.js";
it("dry-run never calls any network, AI, upload or deploy even with all credentials present", async () => {
  const trap = vi.fn(() => {
    throw Error("Network call forbidden in offline preview");
  });
  vi.stubGlobal("fetch", trap);
  for (const key of [
    "ANTHROPIC_API_KEY",
    "YOUTUBE_CLIENT_ID",
    "YOUTUBE_CLIENT_SECRET",
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_ACCOUNT_ID",
  ])
    vi.stubEnv(key, "dummy-not-real");
  vi.stubEnv("ENABLE_PUBLICATION", "true");
  const result = await runDaily({
    dryRun: true,
    offline: false,
    llm: {
      mode: "live",
      calls: [],
      json: async () => {
        throw Error("Paid AI forbidden");
      },
    },
  });
  expect(result.status).toBe("rendered");
  expect(result.review).toBe("offline-not-ai-validated");
  expect(result.cost.actualModelCalls).toBe(0);
  expect(trap).not.toHaveBeenCalled();
  expect(state.writes.some((p) => p.endsWith("data/ledger.json"))).toBe(false);
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

import {buildSite} from "../src/site/build.js";
it("no qualified notice rebuilds the existing local site without upload",async()=>{
 state.noNotices=true;vi.mocked(buildSite).mockClear();const trap=vi.fn(()=>{throw Error("Network forbidden")});vi.stubGlobal("fetch",trap);
 try {const result=await runDaily({dryRun:true,offline:true,llm:null});expect(result.status).toBe("skipped");expect(result.errors).toEqual([]);expect(result.reason).toBe("No notice safely qualified");expect(buildSite).toHaveBeenCalledOnce();expect(trap).not.toHaveBeenCalled();}
 finally{state.noNotices=false;vi.unstubAllGlobals();}
});
