import type { NextConfig } from "next";

import { privateResponseHeaders } from "./src/control/security";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    const privateHeaders = Object.entries(privateResponseHeaders).map(([key, value]) => ({ key, value }));
    return [
      { source: "/control/:path*", headers: privateHeaders },
      { source: "/api/control/:path*", headers: privateHeaders },
      { source: "/api/auth/:path*", headers: privateHeaders },
    ];
  },
};

export default nextConfig;
