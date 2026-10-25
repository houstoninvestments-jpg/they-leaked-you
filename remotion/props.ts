import type { Timeline } from "../src/render/timeline.js";
export const CLOSER = "Check if you’re in it." as const;
export const DISCLAIMER =
  "We never ask for your information. Facts from public breach notices." as const;
export type Severity = "SSN" | "PASSWORDS" | "EMAIL ONLY" | "UNKNOWN";
export interface BreachProps {
  number: number;
  hook: string;
  card: {
    company: string;
    reportDate: string;
    affectedCount: string;
    countScope?: string;
    dataTypes: string[];
    sourceLabel: string;
    sourceUrl: string;
    emailOnly?: boolean;
  };
  severity: Severity;
  timeline: Timeline;
  testLabel: string;
  voiceLabel: string;
  closer: typeof CLOSER;
  disclaimer: typeof DISCLAIMER;
  [key: string]: unknown;
}
/** Only explicit positive disclosures count. An incomplete list cannot establish EMAIL ONLY. */
export function supportedSeverity(card: BreachProps["card"]): Severity {
  const types = card.dataTypes.map((t) => t.trim().toLowerCase());
  if (types.some((t) => /^(ssn|ssns|social security numbers?)$/.test(t)))
    return "SSN";
  if (
    types.some((t) =>
      /^(passwords?|hashed passwords?|password hashes)$/.test(t),
    )
  )
    return "PASSWORDS";
  if (
    card.emailOnly &&
    types.length > 0 &&
    types.every((t) => /^(e-?mails?|e-?mail addresses?)$/.test(t))
  )
    return "EMAIL ONLY";
  return "UNKNOWN";
}
