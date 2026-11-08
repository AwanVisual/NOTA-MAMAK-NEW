import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.18.4'],
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
