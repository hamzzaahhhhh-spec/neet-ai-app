const path = require("path");
const isNetlify = process.env.NETLIFY === "true";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  compress: true,
  poweredByHeader: false,
  // Netlify plugin manages Next output automatically.
  ...(isNetlify ? {} : { output: "standalone" }),
  distDir: '.next',
  typedRoutes: false,
  outputFileTracingRoot: path.join(__dirname),
  // Ensure trailing slashes for consistent routing
  trailingSlash: false,
  // Image optimization configuration
  images: {
    unoptimized: true,
  },
  // Environment variables that should be available at build time
  env: {
    NEXT_PUBLIC_BACKEND_API_URL: process.env.NEXT_PUBLIC_BACKEND_API_URL,
  },
};

module.exports = nextConfig;
