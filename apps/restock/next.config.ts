import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This app reads everything from Supabase and never talks to a store
  // directly, so it transpiles no workspace packages.
};

export default nextConfig;
