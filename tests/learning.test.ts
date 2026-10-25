import { it, expect } from "vitest";
import { chooseHook } from "../src/learn/index.js";
it("sparse retention does not invent a winning hook", () => {
  const chosen = chooseHook("Example", 100, "Washington residents", [], {
    expiresAt: "2099-01-01",
    rows: [
      {
        hookVariant: "brand-company-v1",
        views: 10000,
        averageViewPercentage: 99,
      },
    ],
  });
  expect(chosen.id).toBe("brand-direct-v1");
  expect(chosen.basis).toContain("insufficient");
});
it("sufficient measured retention guides only supported hook wording", () => {
  const rows = ["brand-direct-v1", "brand-company-v1"].flatMap(
    (hookVariant, i) =>
      [1, 2, 3].map(() => ({
        hookVariant,
        views: 100,
        averageViewPercentage: i ? 90 : 50,
      })),
  );
  const chosen = chooseHook("Example", 100, "Washington residents", [], {
    expiresAt: "2099-01-01",
    rows,
  });
  expect(chosen.id).toBe("brand-company-v1");
  expect(chosen.text).toBe("They leaked you. Example.");
  expect(chosen.basis).toBe("measured retention");
});
it("expired analytics cannot influence wording", () => {
  expect(
    chooseHook("Example", 100, "Washington residents", [], {
      expiresAt: "2000-01-01",
      rows: [],
    }).basis,
  ).toContain("insufficient");
});
