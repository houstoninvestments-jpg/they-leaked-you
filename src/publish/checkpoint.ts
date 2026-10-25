import { execFileSync } from "node:child_process";
import { path } from "../lib/util.js";
const REPO = "houstoninvestments-jpg/they-leaked-you";
/** Narrow durable reservation: no upload is issued until the target remote records this attempt. */
export function commitPendingUpload() {
  if (
    process.env.GITHUB_ACTIONS !== "true" ||
    process.env.GITHUB_REPOSITORY !== REPO
  )
    throw Error(
      "Live upload checkpoint requires the exact target GitHub Actions repository",
    );
  const git = (args: string[]) =>
    execFileSync("git", args, {
      cwd: path(),
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "they-leaked-you",
        GIT_COMMITTER_NAME: "they-leaked-you",
        GIT_AUTHOR_EMAIL: "",
        GIT_COMMITTER_EMAIL: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const origin = git(["remote", "get-url", "origin"]).replace(/\.git$/, "");
  if (
    origin !== `https://github.com/${REPO}`
  )
    throw Error("Unexpected checkpoint repository origin");
  if (git(["branch", "--show-current"]) !== "main")
    throw Error("Checkpoint only allowed on main");
  const staged = git(["diff", "--cached", "--name-only"]);
  if (
    staged &&
    staged.split("\n").some((p) => p !== "data/upload-attempts.json")
  )
    throw Error("Unrelated staged changes block checkpoint");
  git(["add", "--", "data/upload-attempts.json"]);
  execFileSync("python3", ["scripts/scan.py"], { cwd: path(), stdio: "pipe" });
  git([
    "-c",
    "user.name=they-leaked-you",
    "-c",
    "user.email=",
    "commit",
    "-m",
    "Reserve pending upload before external submission",
  ]);
  execFileSync("python3", ["scripts/scan.py", "--history"], {
    cwd: path(),
    stdio: "pipe",
  });
  git(["push", "origin", "HEAD:main"]);
  const local = git(["rev-parse", "HEAD"]);
  const remote = git(["ls-remote", "origin", "refs/heads/main"]).split(/\s/)[0];
  if (local !== remote)
    throw Error("Pending upload checkpoint not verified on target remote");
}
export async function durableUpload<T>(
  upload: () => Promise<T>,
  checkpoint: () => void = commitPendingUpload,
): Promise<T> {
  checkpoint();
  return upload();
}
