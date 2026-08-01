import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the container image: the runtime stage
  // copies .next/standalone and nothing else, so node_modules stays out of
  // the shipped image.
  output: "standalone",

  // Pin the workspace root: a stray package-lock.json in the parent directory
  // otherwise makes Turbopack infer ../ as the root and break module resolution.
  turbopack: {
    root: import.meta.dirname,
  },

  async redirects() {
    return [
      // `/console` was the single-page debug view the product grew out of.
      // Anyone holding that link should land on the product, not on a 404 —
      // the diagnostics it used to hold now live at /developer/console.
      { source: "/console", destination: "/dashboard", permanent: false },
    ];
  },
};

export default nextConfig;
