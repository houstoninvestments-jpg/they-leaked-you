import type { VoiceSegment, Word } from "../voice/index.js";

export const FPS = 30;
export const MAX_SECONDS = 39.5; // the brief: under 40 seconds
export const READ_SECONDS = 1.6; // silent hold on the breach notice card; nothing on it may change
export const SCOREBOARD_SECONDS = 3; // last 3 seconds
const GAP = 0.22;
const TAIL = 0.4;

export type BeatId =
  | "hook"
  | "receipt"
  | "read"
  | "result"
  | "stamp"
  | "scoreboard"
  | "tail";

export interface Beat {
  id: BeatId;
  from: number; // frame
  to: number; // frame (exclusive)
  audio?: string; // file inside the render's public dir
  text?: string;
}

export interface Caption {
  from: number;
  to: number;
  text: string;
}

export interface Timeline {
  fps: number;
  total: number;
  beats: Beat[];
  captions: Caption[];
}

const f = (s: number) => Math.round(s * FPS);

/** Short caption chunks, timed by real word timings when the voice gives them. */
export function captionChunks(
  seg: VoiceSegment,
  startSec: number,
  maxWords = 4,
): Caption[] {
  const words: Word[] =
    seg.words && seg.words.length
      ? seg.words
      : (() => {
          const ws = seg.text.split(/\s+/).filter(Boolean);
          const weight = ws.map((w) => w.length + 2);
          const totalW = weight.reduce((a, b) => a + b, 0);
          let t = 0;
          return ws.map((w, i) => {
            const d = (weight[i] / totalW) * seg.duration;
            const out = { word: w, start: t, end: t + d };
            t += d;
            return out;
          });
        })();
  const out: Caption[] = [];
  for (let i = 0; i < words.length; ) {
    let j = i + 1;
    while (
      j < words.length &&
      j - i < maxWords &&
      !/[.,!?;:]$/.test(words[j - 1].word)
    )
      j++;
    const chunk = words.slice(i, j);
    out.push({
      from: f(startSec + chunk[0].start),
      to: f(startSec + chunk.at(-1)!.end),
      text: chunk.map((w) => w.word).join(" "),
    });
    i = j;
  }
  for (let k = 0; k < out.length - 1; k++)
    out[k].to = Math.max(out[k].to, out[k + 1].from);
  return out;
}

/**
 * Hook, breach notice card (voice, then a silent read), result, stamp, then the closer card for the
 * last 3 seconds with the closer. Throws if it would run 40 seconds or more.
 */
export function buildTimeline(
  segs: Record<string, VoiceSegment>,
  audioName: (id: string) => string,
): Timeline {
  for (const id of ["hook", "receipt", "result", "stamp", "closer"]) {
    const s = segs[id];
    if (!s || !Number.isFinite(s.duration) || s.duration <= 0)
      throw new Error(`Missing/invalid voice segment: ${id}`);
  }
  const beats: Beat[] = [];
  const captions: Caption[] = [];
  let t = 0.15;
  const spoken = (id: BeatId, seg: VoiceSegment, minSec = 0) => {
    const len = Math.max(seg.duration, minSec);
    beats.push({
      id,
      from: f(t),
      to: f(t + len + GAP),
      audio: audioName(seg.id),
      text: seg.text,
    });
    captions.push(...captionChunks(seg, t));
    t += len + GAP;
  };
  spoken("hook", segs.hook);
  spoken("receipt", segs.receipt, 2.4);
  beats.push({ id: "read", from: f(t), to: f(t + READ_SECONDS) });
  t += READ_SECONDS;
  spoken("result", segs.result, 2.4);
  spoken("stamp", segs.stamp, 1.6);
  // Scoreboard: exactly the last 3 seconds of the video (closer voice inside it, tail included).
  const closer = segs.closer;
  const sbLen = Math.max(SCOREBOARD_SECONDS, closer.duration + 0.6);
  beats.push({
    id: "scoreboard",
    from: f(t),
    to: f(t + sbLen - TAIL),
    audio: audioName(closer.id),
    text: closer.text,
  });
  captions.push(...captionChunks(closer, t));
  t += sbLen - TAIL;
  beats.push({ id: "tail", from: f(t), to: f(t + TAIL) });
  t += TAIL;
  if (t >= MAX_SECONDS)
    throw new Error(`video would run ${t.toFixed(1)}s; limit is under 40s`);
  return { fps: FPS, total: f(t), beats, captions };
}
