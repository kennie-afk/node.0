import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // Next 16 writes agent-instruction files into the project on first run; this repo carries none.
  agentRules: false
};

export default config;
