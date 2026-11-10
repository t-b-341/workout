import type { NextConfig } from "next";

if (process.env.NEXT_PUBLIC_E2E_STUB === '1' && process.env.NODE_ENV === 'production') {
  throw new Error(
    'Refusing to build: NEXT_PUBLIC_E2E_STUB=1 is set while NODE_ENV is production. The E2E auth stub must never ship.',
  );
}

const nextConfig: NextConfig = {
  // The dev-tools badge sits on the bottom-left and swallows taps on the Today tab.
  devIndicators: false,
  // Playwright uses 127.0.0.1 while the dev server may print localhost — avoids HMR cross-origin noise.
  allowedDevOrigins: ["127.0.0.1"],
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          // Full script-src CSP is a future hardening step requiring nonce setup.
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
