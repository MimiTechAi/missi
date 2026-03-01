import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { hostname: "www.google.com" }, // Favicons
    ],
  },
  experimental: {
    optimizePackageImports: ["react-markdown"],
  },
};

export default nextConfig;
