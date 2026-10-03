import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // Next 16 writes agent-instruction files into the project on first run; this repo carries none.
  agentRules: false,
  // statement and member-book uploads arrive as form data; the API caps them (6 MB statements) and says why when it refuses
  experimental: { serverActions: { bodySizeLimit: "9mb" } }
};

export default config;
