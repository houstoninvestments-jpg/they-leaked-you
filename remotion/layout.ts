export const W = 1080;
export const H = 1920;
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
/** Conservative editorial safe area: leave 180px right and 270px bottom for Shorts UI. */
export const SAFE_RIGHT = 900;
export const SAFE_BOTTOM = 1650;
export const HEAD: Box = { x: 70, y: 190, w: 830, h: 160 };
export const CARD: Box = { x: 70, y: 390, w: 830, h: 700 };
export const RESULT: Box = { x: 70, y: 1120, w: 830, h: 100 };
export const CAPTIONS: Box = { x: 70, y: 1250, w: 830, h: 145 };
export const FOOTER: Box = { x: 70, y: 1470, w: 830, h: 140 };
export const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
