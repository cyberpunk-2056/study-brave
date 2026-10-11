import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// Content Security Policy: the page may load code and styles only from itself, images from itself + YouTube
// thumbnails, and frames only from the YouTube player. Nobody may put our site inside a frame (clickjacking).
// 'unsafe-inline' is needed for Next.js' own inline bootstrap scripts and styles; everything else stays locked down.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  // focusfile: is the desktop app's own scheme for showing real screenshot thumbnails in "My Files" (see
  // desktop/main.js) — harmless to allow in a browser, since that scheme simply won't exist there.
  "img-src 'self' data: blob: focusfile: https://i.ytimg.com https://*.ytimg.com",
  "font-src 'self' data:",
  "frame-src https://www.youtube-nocookie.com https://www.youtube.com",
  "connect-src 'self'",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  // YouTube's embedded player needs to know our origin, so keep the origin (not the full URL) on cross-site requests.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // The dev server needs eval for hot reload, so the strict policy is applied to production only.
  ...(isProd ? [{ key: "Content-Security-Policy", value: csp }] : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false, // do not advertise "Next.js" to scanners
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
