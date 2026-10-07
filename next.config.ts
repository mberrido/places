import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Single self-contained server for the Docker image.
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
  // Never ship the local database or session secret in the build output.
  outputFileTracingExcludes: { "*": ["./data/**/*"] },
  experimental: {
    // proxy.ts makes Next buffer request bodies, cut off at this size. Just over the
    // app's own 16 MB upload limit, so a cut-off body is always too big and refused.
    proxyClientMaxBodySize: "17mb",
  },
  poweredByHeader: false,
  // Dev only: let phones on the home network load the dev server's scripts.
  allowedDevOrigins: ["127.0.0.1", "192.168.*.*", "*.local"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
        ],
      },
    ];
  },
};

export default nextConfig;
