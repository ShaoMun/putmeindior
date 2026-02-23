import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "earthengine.googleapis.com",
      },
    ],
  },
};

export default nextConfig;
