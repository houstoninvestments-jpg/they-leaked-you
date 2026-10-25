import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import sample from "../remotion/sample-props.json";
import type { BreachProps } from "../remotion/props.js";
import {
  CARD,
  RESULT,
  HEAD,
  CAPTIONS,
  FOOTER,
  SAFE_RIGHT,
  SAFE_BOTTOM,
  overlaps,
} from "../remotion/layout.js";
import { assertTextLayout } from "../src/render/layout-checks.js";
import {
  readWindowChecks,
  assertReadWindowChecks,
} from "../src/render/index.js";
import type { Beat } from "../src/render/timeline.js";
const props = () => structuredClone(sample) as unknown as BreachProps;

describe("phone-safe layout regression gates", () => {
  it("accepts the baseline design and keeps every text region disjoint", () => {
    expect(() => assertTextLayout(props())).not.toThrow();
    const regions = [HEAD, CARD, RESULT, CAPTIONS, FOOTER];
    for (let i = 0; i < regions.length; i++)
      for (let j = i + 1; j < regions.length; j++)
        expect(overlaps(regions[i], regions[j])).toBe(false);
  });
  it("reserves the right rail and bottom Shorts controls", () => {
    for (const b of [HEAD, CARD, RESULT, CAPTIONS, FOOTER]) {
      expect(b.x + b.w).toBeLessThanOrEqual(SAFE_RIGHT);
      expect(b.y + b.h).toBeLessThanOrEqual(SAFE_BOTTOM);
    }
    const original = FOOTER.y;
    try {
      FOOTER.y = 1700;
      expect(() => assertTextLayout(props())).toThrow(/safe area/);
    } finally {
      FOOTER.y = original;
    }
  });
  it("detects a headline/stamp deliberately moved onto the notice", () => {
    const original = HEAD.y;
    try {
      HEAD.y = CARD.y + 20;
      expect(() => assertTextLayout(props())).toThrow(/overlaps/);
    } finally {
      HEAD.y = original;
    }
  });
  it("detects captions deliberately moved onto the disclosure footer", () => {
    const original = CAPTIONS.y;
    try {
      CAPTIONS.y = FOOTER.y;
      expect(() => assertTextLayout(props())).toThrow(/overlaps/);
    } finally {
      CAPTIONS.y = original;
    }
  });
  it.each(["company", "dataTypes", "affectedCount", "sourceLabel"] as const)(
    "rejects overflowing %s instead of hiding text",
    (key) => {
      const p = props();
      if (key === "dataTypes") p.card.dataTypes = ["X".repeat(113)];
      else p.card[key] = "X".repeat(130);
      expect(() => assertTextLayout(p)).toThrow(/text budget/);
    },
  );
  it("rejects an unsupported badge, altered disclaimer and >=40 second duration", () => {
    let p = props();
    p.severity = "SSN";
    expect(() => assertTextLayout(p)).toThrow(/Severity/);
    p = props();
    (p as any).disclaimer = "Not the required disclosure";
    expect(() => assertTextLayout(p)).toThrow(/disclaimer/);
    p = props();
    p.timeline.total = 1200;
    expect(() => assertTextLayout(p)).toThrow(/under 40/);
  });
});

// Real raster checks, not geometry guesses: make a one-second static copy of the
// rendered cover, then deliberately paint over both protected read regions.
// A neutral generated frame keeps this regression test runnable in clean CI.
describe("rendered pixel occlusion regression", () => {
  let dir: string;
  let clean: string;
  let altered: string;
  const beats: Beat[] = [
    { id: "hook", from: 0, to: 1 },
    { id: "receipt", from: 1, to: 5 },
    { id: "read", from: 5, to: 10 },
    { id: "result", from: 10, to: 15 },
    { id: "stamp", from: 15, to: 26 },
    { id: "scoreboard", from: 26, to: 29 },
    { id: "tail", from: 29, to: 30 },
  ];
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "breach-visual-"));
    clean = join(dir, "clean.mp4");
    altered = join(dir, "occluded.mp4");
    const cover = resolve("work/latest/leak-001-preview-cover.jpg");
    const input = existsSync(cover)
      ? ["-loop", "1", "-i", cover]
      : ["-f", "lavfi", "-i", "color=c=white:s=1080x1920:r=30"];
    execFileSync("ffmpeg", [
      "-y",
      "-v",
      "error",
      ...input,
      "-t",
      "1",
      "-r",
      "30",
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      clean,
    ]);
    // Leave reference frames untouched; block the card during read and the result
    // during the stamp. Use white result block to contrast with actual dark layout.
    const filter = `drawbox=x=${CARD.x}:y=${CARD.y}:w=${CARD.w}:h=${CARD.h}:color=black:t=fill:enable='gte(n,4)',drawbox=x=${RESULT.x}:y=${RESULT.y}:w=${RESULT.w}:h=${RESULT.h}:color=red:t=fill:enable='gte(n,16)'`;
    execFileSync("ffmpeg", [
      "-y",
      "-v",
      "error",
      "-i",
      clean,
      "-vf",
      filter,
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "18",
      altered,
    ]);
  }, 60000);
  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });
  it("passes unaltered pixels and rejects intentional card/action occlusion", () => {
    const good = readWindowChecks(clean, beats);
    const bad = readWindowChecks(altered, beats);
    console.log(
      "Pixel regression evidence:",
      JSON.stringify({ unaltered: good, intentionallyOccluded: bad }),
    );
    expect(() => assertReadWindowChecks(good)).not.toThrow();
    expect(bad.card).toBeGreaterThan(0.01);
    expect(bad.result).toBeGreaterThan(0.01);
    expect(() => assertReadWindowChecks(bad)).toThrow(/Pixel occlusion/);
  }, 60000);
});

it.skipIf(process.env.RUN_RENDERED_VISUAL !== "1")(
  "verifies the existing full-length rendered MP4 passes the same pixel gate",
  () => {
    const p = JSON.parse(
      readFileSync("work/latest/props.json", "utf8"),
    ) as BreachProps;
    assertTextLayout(p);
    const pixels = readWindowChecks(
      "work/latest/leak-001-preview.mp4",
      p.timeline.beats,
    );
    console.log("Full rendered MP4 pixel baseline:", JSON.stringify(pixels));
    expect(() => assertReadWindowChecks(pixels)).not.toThrow();
  },
  60000,
);
