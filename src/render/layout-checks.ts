import {
  CAPTIONS,
  CARD,
  FOOTER,
  HEAD,
  RESULT,
  W,
  H,
  SAFE_RIGHT,
  SAFE_BOTTOM,
  overlaps,
} from "../../remotion/layout.js";
import {
  CLOSER,
  DISCLAIMER,
  supportedSeverity,
  type BreachProps,
} from "../../remotion/props.js";
/** Conservative text budgets; browser-measured overflow and pixel checks are independent gates. */
export function assertTextLayout(p: BreachProps): void {
  const zones = { HEAD, CARD, RESULT, CAPTIONS, FOOTER };
  const entries = Object.entries(zones);
  for (const [name, b] of entries) {
    if (b.x < 0 || b.y < 0 || b.x + b.w > W || b.y + b.h > H)
      throw new Error(`${name} outside frame`);
    if (b.x + b.w > SAFE_RIGHT || b.y + b.h > SAFE_BOTTOM)
      throw new Error(`${name} enters Shorts overlay safe area`);
    for (const [other, c] of entries)
      if (name !== other && overlaps(b, c))
        throw new Error(`${name} overlaps ${other}`);
  }
  const budget = (name: string, s: string, max: number) => {
    if (!s.trim() || s.length > max)
      throw new Error(`${name} exceeds safe text budget (${max})`);
  };
  budget("hook", p.hook, 82);
  budget("company", p.card.company, 48);
  budget("report date", p.card.reportDate, 28);
  budget("affected count", p.card.affectedCount, 22);
  if (p.card.countScope) budget("count scope", p.card.countScope, 32);
  budget("data types", p.card.dataTypes.join(" · ") || "Not specified", 112);
  budget("source label", p.card.sourceLabel, 54);
  budget("voice label", p.voiceLabel, 30);
  if (p.testLabel.length > 60) throw new Error("Test label too long");
  for (const c of p.timeline.captions) budget("caption", c.text, 55);
  if (p.closer !== CLOSER || p.disclaimer !== DISCLAIMER)
    throw new Error("Required closer/disclaimer changed");
  if (p.severity !== supportedSeverity(p.card))
    throw new Error("Severity is not supported by the disclosed data types");
  if (
    p.timeline.fps !== 30 ||
    p.timeline.total <= 0 ||
    p.timeline.total >= 1200
  )
    throw new Error("Timeline must be 30fps and under 40 seconds");
}
