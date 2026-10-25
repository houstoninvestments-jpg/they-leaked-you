import { z } from "zod";
export const DISCLAIMER =
  "We never ask for your information. Facts from public breach notices.";
export const Evidence = z.object({
  field: z.string(),
  quote: z.string().min(1),
  url: z.string().url(),
});
export const Notice = z.object({
  id: z.string(),
  company: z.string(),
  characterization: z.string(),
  reportedDate: z.string(),
  exposedDate: z.string().nullable(),
  count: z.number().int().positive().nullable(),
  countScope: z.string(),
  dataTypes: z.array(z.string()),
  emailOnly: z.boolean().default(false),
  sourceUrl: z.string().url(),
  humanNoticeUrl: z.string().url().optional(),
  publisher: z.string(),
  evidence: z.array(Evidence),
  verifiedAt: z.string(),
});
export type Notice = z.infer<typeof Notice>;
export const Script = z.object({
  hook: z.string(),
  noticeSay: z.string(),
  dataSay: z.string(),
  actionSay: z.string(),
  description: z.string(),
});
export type Script = z.infer<typeof Script>;
export const Verdict = z.object({
  verdict: z.enum(["publish", "skip"]),
  confidence: z.number().min(0).max(1),
  problems: z.array(z.string()),
});
export type Verdict = z.infer<typeof Verdict>;
export interface Leak {
  number: number;
  slug: string;
  date: string;
  notice: Notice;
  script: Script;
  status: "rendered" | "uploaded-private" | "uploaded-pending" | "published";
  review: "offline-not-ai-validated" | "two-live-checkers";
  youtubeId?: string;
  hookVariant: string;
}
export interface Ledger {
  nextNumber: number;
  leaks: Leak[];
  slots: string[];
}
