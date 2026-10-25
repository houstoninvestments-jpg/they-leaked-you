import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { resolve } from "node:path";
const path = (...p: string[]) => resolve(process.cwd(), ...p);
const env = (key: string) => process.env[key];

/** Founder decision: this channel's voice is Kokoro "am_michael", en-us, speed 0.95, in dry and live runs. No ElevenLabs. */

export interface Word {
  word: string;
  start: number;
  end: number;
}

export interface VoiceSegment {
  id: string;
  text: string;
  file: string; // absolute path
  duration: number; // seconds
  words?: Word[];
}

export interface VoiceResult {
  provider: "kokoro";
  label: string; // shown in the upload disclosure
  segments: VoiceSegment[];
}

export interface Line {
  id: string;
  text: string;
}

/** Kokoro (Apache-2.0 open model), runs offline. */
export function synthesize(lines: Line[], outDir: string): VoiceResult {
  if (
    !lines.length ||
    lines.some((l) => !/^[a-z][a-z0-9_-]*$/.test(l.id) || !l.text.trim()) ||
    new Set(lines.map((l) => l.id)).size !== lines.length
  )
    throw new Error("Invalid or duplicate voice lines");
  outDir = resolve(outDir);
  const v = { kokoroVoice: "am_michael", lang: "en-us", speed: 0.95 };
  const models = env("KOKORO_DIR") ?? path("models/kokoro");
  const python = env("KOKORO_PYTHON") ?? "python3";
  const job = join(outDir, "kokoro-job.json");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    job,
    JSON.stringify({
      model: join(models, "kokoro-v1.0.int8.onnx"),
      voices: join(models, "voices-v1.0.bin"),
      voice: v.kokoroVoice,
      lang: v.lang,
      speed: v.speed,
      out_dir: outDir,
      lines,
    }),
  );
  const out = execFileSync(
    python,
    ["-I", path("src/voice/kokoro_tts.py"), job],
    { encoding: "utf8", maxBuffer: 1 << 24 },
  );
  const parsed = JSON.parse(out.trim().split("\n").at(-1)!) as {
    segments: { id: string; file: string; duration: number }[];
  };
  if (
    parsed.segments.length !== lines.length ||
    parsed.segments.some(
      (s) =>
        !lines.some((l) => l.id === s.id) ||
        !Number.isFinite(s.duration) ||
        s.duration <= 0 ||
        !existsSync(s.file),
    ) ||
    new Set(parsed.segments.map((s) => s.id)).size !== lines.length
  )
    throw new Error("Kokoro returned incomplete audio");
  return {
    provider: "kokoro",
    label: "AI voice (Kokoro open model)",
    segments: parsed.segments.map((s) => ({
      ...s,
      text: lines.find((l) => l.id === s.id)!.text,
    })),
  };
}
