import { timingSafeEqual } from "node:crypto";

/** True when the request carries the secret key that only Focus Study Desktop adds to its requests. */
export function isDesktopRequest(headers: Headers) {
  const key = process.env.DESKTOP_APP_KEY;
  const sent = headers.get("x-focus-app-key");
  if (!key || !sent) return false;
  const a = Buffer.from(key);
  const b = Buffer.from(sent);
  return a.length === b.length && timingSafeEqual(a, b);
}
