import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Force dynamic rendering for all pages to avoid static generation errors
  output: 'standalone',
};

export default nextConfig;
