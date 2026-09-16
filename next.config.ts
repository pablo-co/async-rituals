import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep Turbopack inside this repo (there is an unrelated lockfile in the home folder).
  turbopack: { root: process.cwd() },
};

export default nextConfig;
