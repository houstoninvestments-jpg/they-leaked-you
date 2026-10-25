import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import type { BreachProps } from "../../remotion/props.js";
import { CARD, RESULT, type Box } from "../../remotion/layout.js";
import { resolve } from "node:path";
import { assertTextLayout } from "./layout-checks.js";
const env = (key: string) => process.env[key];
const path = (...p: string[]) => resolve(process.cwd(), ...p);
const log = (s: string) => console.log(s);
import type { VoiceResult } from "../voice/index.js";
import {
  buildTimeline,
  MAX_SECONDS,
  type Beat,
  type Timeline,
} from "./timeline.js";

/** A short stamp thud made with ffmpeg, so no audio files need licensing. */
export function makeSfx(dir: string) {
  mkdirSync(dir, { recursive: true });
  execFileSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "anoisesrc=d=0.35:c=brown:a=0.9",
    "-af",
    "lowpass=f=220,afade=t=out:st=0.05:d=0.3,volume=3",
    join(dir, "stamp.wav"),
  ]);
}

export function prepareTimeline(
  voice: VoiceResult,
  publicDir: string,
): Timeline {
  mkdirSync(publicDir, { recursive: true });
  const segs = Object.fromEntries(voice.segments.map((s) => [s.id, s]));
  const names: Record<string, string> = {};
  for (const s of voice.segments) {
    const name = `vo-${s.id}${extname(s.file)}`;
    copyFileSync(s.file, join(publicDir, name));
    names[s.id] = name;
  }

  copyFileSync(
    path(
      "node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
    ),
    join(publicDir, "inter.woff2"),
  );
  return buildTimeline(segs, (id) => names[id]);
}

function browserExecutable(): string | undefined {
  const fromEnv = env("REMOTION_BROWSER");
  if (fromEnv) return fromEnv;
  const local =
    "/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
  return existsSync(local) ? local : undefined; // otherwise Remotion fetches its own headless shell
}

export async function renderShort(
  props: BreachProps,
  publicDir: string,
  outFile: string,
): Promise<string> {
  assertTextLayout(props);
  const bundled = await bundle({
    entryPoint: path("remotion/index.ts"),
    publicDir,
  });
  const browser = browserExecutable();
  const composition = await selectComposition({
    serveUrl: bundled,
    id: "BreachShort",
    inputProps: props,
    browserExecutable: browser,
  });
  mkdirSync(join(outFile, ".."), { recursive: true });
  let last = -1;
  await renderMedia({
    composition,
    serveUrl: bundled,
    codec: "h264",
    outputLocation: outFile,
    inputProps: props,
    browserExecutable: browser,
    crf: 18,
    audioCodec: "aac",
    onProgress: ({ progress }) => {
      const q = Math.floor(progress * 4);
      if (q !== last) log(`render ${q * 25}%`);
      last = q;
    },
  });
  return outFile;
}

export interface VideoProbe {
  width: number;
  height: number;
  seconds: number;
  hasAudio: boolean;
}

export function probe(file: string): VideoProbe {
  const out = JSON.parse(
    execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "stream=codec_type,width,height:format=duration",
        "-of",
        "json",
        file,
      ],
      { encoding: "utf8" },
    ),
  );
  const v = out.streams.find((s: any) => s.codec_type === "video");
  return {
    width: v.width,
    height: v.height,
    seconds: +(+out.format.duration).toFixed(2),
    hasAudio: out.streams.some((s: any) => s.codec_type === "audio"),
  };
}

/** A Short here is vertical 1080x1920, under 40 seconds, with the voice track. */
export function assertShort(p: VideoProbe) {
  const problems: string[] = [];
  if (p.width !== 1080 || p.height !== 1920)
    problems.push(`size ${p.width}x${p.height}`);
  if (p.seconds >= 40 || p.seconds <= 0) problems.push(`length ${p.seconds}s`);
  if (!p.hasAudio) problems.push("no audio");
  if (problems.length)
    throw new Error(`render check failed: ${problems.join(", ")}`);
}

function regionGray(video: string, frame: number, b: Box): Buffer {
  const r = spawnSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      video,
      "-vf",
      `select=eq(n\\,${frame}),crop=${b.w}:${b.h}:${b.x}:${b.y}`,
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "gray",
      "-",
    ],
    { maxBuffer: 1 << 26 },
  );
  if (r.status !== 0 || !r.stdout?.length)
    throw new Error(
      `could not read frame ${frame}: ${r.stderr?.toString().slice(0, 200)}`,
    );
  return r.stdout as Buffer;
}

/** Share of pixels in a box that changed between a reference frame and a few frames after it (0 = untouched). */
export function regionChange(
  video: string,
  box: Box,
  ref: number,
  frames: number[],
): number {
  const before = regionGray(video, ref, box);
  let worst = 0;
  for (const n of frames) {
    const b = regionGray(video, n, box);
    let changed = 0;
    for (let i = 0; i < before.length; i++)
      if (Math.abs(before[i] - b[i]) > 24) changed++;
    worst = Math.max(worst, changed / before.length);
  }
  return +worst.toFixed(4);
}

/**
 * Read-window pixel check: the disclosed notice stays stable while narration, captions and
 * severity change. The separate action zone must not be covered by a severity badge.
 */
export function readWindowChecks(video: string, beats: Beat[]) {
  const get = (id: string) => beats.find((b) => b.id === id)!;
  const receipt = get("receipt");
  const read = get("read");
  const stamp = get("stamp");
  const board = get("scoreboard");
  const card = regionChange(video, CARD, receipt.from + 2, [
    read.from + 1,
    Math.floor((read.from + read.to) / 2),
    read.to - 1,
    stamp.from + 10,
    board.from - 2,
    Math.floor((board.from + board.to) / 2),
    get("tail").to - 2,
  ]);
  const result = regionChange(video, RESULT, stamp.from - 1, [
    stamp.from + 5,
    Math.min(stamp.from + 15, board.from - 2),
    board.from - 2,
  ]);
  return { card, result };
}

/** Save frame 0 (the cover) as the thumbnail, under YouTube's 2 MB limit. */
export function extractCover(
  video: string,
  outJpg: string,
): { file: string; bytes: number } {
  for (const q of [2, 4, 6, 9, 13]) {
    execFileSync("ffmpeg", [
      "-y",
      "-loglevel",
      "error",
      "-i",
      video,
      "-frames:v",
      "1",
      "-q:v",
      String(q),
      outJpg,
    ]);
    const bytes = statSync(outJpg).size;
    if (bytes <= 2 * 1024 * 1024) return { file: outJpg, bytes };
  }
  throw new Error("cover image stays over 2 MB");
}

/** Production gate shared with the deliberate-occlusion regression tests. */
export function assertReadWindowChecks(checks: {
  card: number;
  result: number;
}): void {
  if (
    !Number.isFinite(checks.card) ||
    !Number.isFinite(checks.result) ||
    checks.card > 0.01 ||
    checks.result > 0.01
  ) {
    throw new Error(
      `Pixel occlusion check failed: card=${checks.card}, result=${checks.result}`,
    );
  }
}
