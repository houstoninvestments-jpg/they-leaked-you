import { it, expect, vi } from "vitest";
import {
  durableUpload,
  commitPendingUpload,
} from "../src/publish/checkpoint.js";
it("failed durable checkpoint issues zero upload calls", async () => {
  const upload = vi.fn(async () => ({ id: "dummy" }));
  await expect(
    durableUpload(upload, () => {
      throw Error("Push failed");
    }),
  ).rejects.toThrow("Push failed");
  expect(upload).not.toHaveBeenCalled();
});
it("upload starts only after verified checkpoint finishes", async () => {
  const order: string[] = [];
  await durableUpload(
    async () => {
      order.push("upload");
    },
    () => {
      order.push("checkpoint");
    },
  );
  expect(order).toEqual(["checkpoint", "upload"]);
});
it("checkpoint refuses wrong or local repository before running git", () => {
  vi.stubEnv("GITHUB_ACTIONS", "false");
  expect(() => commitPendingUpload()).toThrow("exact target");
  vi.unstubAllEnvs();
});
