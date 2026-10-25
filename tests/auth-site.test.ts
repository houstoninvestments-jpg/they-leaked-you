import { it, expect } from "vitest";
import {
  makeState,
  checkState,
  channelCheck,
} from "../functions/auth/youtube/_shared.js";
import { seal, unseal } from "../src/auth/seal.js";
import { buildSite } from "../src/site/build.js";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DISCLAIMER } from "../src/types.js";
it("OAuth state is signed, browser-bound and expires", async () => {
  const s = await makeState("dummy", "nonce", 1000);
  expect(await checkState("dummy", s, "nonce", 2000)).toBe(true);
  expect(await checkState("dummy", s, "other", 2000)).toBe(false);
  expect(await checkState("dummy", s, "nonce", 700000)).toBe(false);
  expect(await checkState("wrong", s, "nonce", 2000)).toBe(false);
});
it("initial channel handle exact; reconnect uses immutable ID", () => {
  const c = {
    id: "UC" + "a".repeat(22),
    title: "Example",
    handle: "@TheyLeakedYou",
  };
  expect(channelCheck(c).ok).toBe(true);
  expect(channelCheck({ ...c, handle: "@Different" }).ok).toBe(false);
  expect(channelCheck({ ...c, handle: "@Renamed" }, undefined, c.id).ok).toBe(
    true,
  );
  expect(channelCheck(c, undefined, "UC" + "b".repeat(22)).ok).toBe(false);
});
it("refresh token authenticated encryption rejects wrong key", async () => {
  const encrypted = await seal("dummy-not-real", "dummy-secret");
  expect(await unseal(encrypted, "dummy-secret")).toBe("dummy-not-real");
  await expect(unseal(encrypted, "other")).rejects.toThrow();
});
it("site pages all disclaim, no collection activated", () => {
  const dir = mkdtempSync(join(tmpdir(), "tly-site-"));
  buildSite([], dir);
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const f = join(d, e.name);
      if (e.isDirectory()) walk(f);
      else if (f.endsWith(".html")) {
        const html = readFileSync(f, "utf8");
        expect(html).toContain(DISCLAIMER);
        expect(html).not.toMatch(/<form|<input|<script|<img/i);
      }
    }
  };
  walk(dir);
});
