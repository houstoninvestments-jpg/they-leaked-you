import { describe, it, expect, vi } from "vitest";
import { readJson, path } from "../src/lib/util.js";
import { validateNotice, eligible, officialUrl } from "../src/scout/index.js";
import {
  check,
  mechanicalCheck,
  safeAction,
  severity,
} from "../src/checker/index.js";
import { templateScript, videoTitle } from "../src/writer/index.js";
import { publicationGate, uploadRequest } from "../src/publish/youtube.js";
import { slotFor, cronLines } from "../src/pipeline/slots.js";
import { supportedSeverity } from "../remotion/props.js";
import type { LLM } from "../src/llm/client.js";
import type { Leak } from "../src/types.js";
const n = validateNotice(readJson<unknown[]>(path("data/notices.json"))[0]);
const s = templateScript(n);
const leak: Leak = {
  number: 1,
  slug: "001-poppins",
  date: "2026-10-25",
  notice: n,
  script: s,
  status: "rendered",
  review: "offline-not-ai-validated",
  hookVariant: "brand-direct-v1",
};
describe("Evidence and harm boundaries", () => {
  it("uses official exact aggregate evidence with regional scope", () => {
    expect(n.count).toBe(17954);
    expect(n.countScope).toBe("Washington residents");
    expect(mechanicalCheck(s, n).ok).toBe(true);
    expect(s.noticeSay).toContain("reported");
    expect(s.noticeSay).not.toContain("exposed");
  });
  it("rejects sources and missing provenance", () => {
    expect(
      officialUrl("https://data.wa.gov.attacker.test/resource/sb4j-ca4h.json"),
    ).toBe(false);
    expect(() => validateNotice({ ...n, evidence: [] })).toThrow();
  });
  it("matches safe actions without telephone/link instructions", () => {
    expect(severity(n)).toBe("SSN");
    expect(safeAction(n)).toBe("Consider a free credit freeze.");
    expect(mechanicalCheck({ ...s, actionSay: "Click this link" }, n).ok).toBe(
      false,
    );
  });
  it("never invents email exclusivity", () => {
    expect(severity({ ...n, dataTypes: ["Email"], emailOnly: false })).toBe(
      "UNKNOWN",
    );
    expect(
      supportedSeverity({
        company: "A",
        reportDate: "2026-01-01",
        affectedCount: "1",
        dataTypes: ["Email"],
        sourceLabel: "Official",
        sourceUrl: n.sourceUrl,
        emailOnly: false,
      }),
    ).toBe("UNKNOWN");
  });
  it("no unsupported allegations or victim contact data", () => {
    expect(
      mechanicalCheck(
        { ...s, hook: "They leaked you. Reckless management." },
        n,
      ).ok,
    ).toBe(false);
    const address = ["person", "example.test"].join("@");
    expect(mechanicalCheck({ ...s, description: address }, n).ok).toBe(false);
  });
  it("does not pretend offline checks are AI approval", async () => {
    expect(await check(null, s, n)).toMatchObject({
      pass: false,
      review: "offline-not-ai-validated",
    });
  });
  it("runs two independent calls and skips any uncertainty", async () => {
    const calls: any[] = [];
    const mock: LLM = {
      mode: "live",
      calls: [],
      json: async (c: any) => {
        calls.push(c);
        return {
          verdict: "publish",
          confidence: c.role === "checker-a" ? 1 : 0.98,
          problems: [],
        } as any;
      },
    };
    expect((await check(mock, s, n)).pass).toBe(false);
    expect(calls.map((c) => c.role)).toEqual(["checker-a", "checker-b"]);
    expect(calls[1].user).not.toContain("checker-a");
  });
  it("dry run cannot publish with arbitrary secrets or real checker label", () => {
    process.env.ENABLE_PUBLICATION = "true";
    expect(() => publicationGate(true, "two-live-checkers")).toThrow("Dry run");
    expect(() => publicationGate(false, "offline-not-ai-validated")).toThrow(
      "actual",
    );
    delete process.env.ENABLE_PUBLICATION;
  });
  it("metadata discloses synthetic media and privacy disclaimer", () => {
    const u = uploadRequest(leak);
    expect(u.status.containsSyntheticMedia).toBe(true);
    expect(u.snippet.description).toContain(
      "We never ask for your information. Facts from public breach notices.",
    );
    expect(videoTitle(n, 1)).toContain("17,954 Washington residents");
  });
  it("seven-day company dedup ignores dry previews", () => {
    expect(
      eligible(
        [n],
        { nextNumber: 2, slots: [], leaks: [leak] },
        new Date("2026-10-26"),
      ),
    ).toHaveLength(1);
    expect(
      eligible(
        [n],
        { nextNumber: 2, slots: [], leaks: [{ ...leak, status: "published" }] },
        new Date("2026-10-26"),
      ),
    ).toHaveLength(0);
  });
  it("gates DST paired schedule to eight, thirteen, eighteen Pacific", () => {
    expect(cronLines()).toHaveLength(6);
    expect(slotFor("0 15 * * *", new Date("2026-07-01T15:02:00Z")).go).toBe(
      true,
    );
    expect(slotFor("0 16 * * *", new Date("2026-07-01T16:02:00Z")).go).toBe(
      false,
    );
    expect(slotFor("0 16 * * *", new Date("2026-12-01T16:02:00Z")).go).toBe(
      true,
    );
  });
});
it("rejects tampered aggregate facts and linked ID", () => {
  for (const patch of [
    { count: 17955 },
    { company: "Other Company" },
    { reportedDate: "2026-10-01" },
    { id: "999" },
    { dataTypes: ["Email"] },
    { emailOnly: true },
  ])
    expect(() => validateNotice({ ...n, ...patch })).toThrow();
});
it("permanently deduplicates notice IDs even after company cooldown", () => {
  expect(
    eligible(
      [n],
      {
        nextNumber: 2,
        slots: [],
        leaks: [{ ...leak, status: "uploaded-private" }],
      },
      new Date("2026-12-25"),
    ),
  ).toHaveLength(0);
});
it("rejects unsupported incident date, data categories, description allegations and numbers", () => {
  expect(() => validateNotice({ ...n, exposedDate: "1900-01-01" })).toThrow();
  expect(
    mechanicalCheck(
      { ...s, dataSay: "The notice lists passport numbers and passwords." },
      n,
    ).ok,
  ).toBe(false);
  expect(
    mechanicalCheck(
      { ...s, description: "Reckless management sold your records." },
      n,
    ).ok,
  ).toBe(false);
  expect(
    mechanicalCheck({ ...s, description: "999 people were affected." }, n).ok,
  ).toBe(false);
});
it("rejects invented hook and alternate allegation in notice line", () => {
  expect(
    mechanicalCheck({ ...s, hook: "They leaked you. Other Company." }, n).ok,
  ).toBe(false);
  expect(
    mechanicalCheck({ ...s, noticeSay: s.noticeSay + " They sold it." }, n).ok,
  ).toBe(false);
});
