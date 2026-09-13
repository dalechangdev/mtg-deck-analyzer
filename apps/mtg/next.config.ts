import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship raw TypeScript rather than a build artefact, so
  // Next has to compile them alongside app code.
  transpilePackages: ["@mtg/itaca", "@mtg/store-core"],
};

export default nextConfig;
