import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sharp has native (.node) bindings — without this, Next.js's serverless bundler
  // can mangle how they're packaged for the deployed function, breaking image
  // processing in production even though it works fine locally.
  serverExternalPackages: ["sharp"],
};

export default nextConfig;
