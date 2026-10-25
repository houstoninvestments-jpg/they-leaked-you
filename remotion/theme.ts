import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";
export const fontFamily = "Inter";
loadFont({
  family: fontFamily,
  url: staticFile("inter.woff2"),
  weight: "100 900",
});
export const C = {
  bg: "#080D18",
  ink: "#F7FAFF",
  dim: "#BCC8D9",
  cyan: "#45F4D1",
  alert: "#FF7A93",
  card: "#F7FAFF",
  dark: "#081221",
};
