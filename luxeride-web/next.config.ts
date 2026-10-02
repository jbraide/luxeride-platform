import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Placeholder product graphics are SVG; real photos will be JPG/PNG later.
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
  },
};

export default nextConfig;
