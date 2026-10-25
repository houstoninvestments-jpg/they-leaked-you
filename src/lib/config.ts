import { readJson, path } from "./util.js";
import type channel from "../../config/channel.json";
export type ChannelConfig = typeof channel;
export function config(): ChannelConfig {
  const c = readJson<ChannelConfig>(path("config/channel.json"));
  if (process.env.SITE_BASE_URL)
    c.site.baseUrl = process.env.SITE_BASE_URL.replace(/\/+$/, "");
  return c;
}
