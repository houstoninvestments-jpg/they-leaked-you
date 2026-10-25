// Reserved only. No URL, tracking pixel, form, or collection endpoint is rendered.
export const affiliate = Object.freeze({
  enabled: false,
  label: "Paid link",
  url: null,
});
export const weeklySignup = Object.freeze({ enabled: false, endpoint: null });
export function affiliateHtml(): string {
  return "";
}
export function newsletterHtml(): string {
  return "";
}
