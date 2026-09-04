import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ocr-kit ships TypeScript source directly (no build step) — Next.js compiles it
  // via its own SWC/Turbopack pipeline instead of expecting pre-built dist/ JS.
  transpilePackages: ["@anirutwata/ocr-kit"],
};

export default nextConfig;
