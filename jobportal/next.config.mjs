
// @ts-check

const isProduction = process.env.MODE === "pro";

const s3ImageHostname =
  process.env.S3_IMAGE_HOSTNAME ||
  "amzn-s3-strapi-uploads.s3.eu-north-1.amazonaws.com";

/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  trailingSlash: true,

  images: {
    unoptimized: !isProduction,

    qualities: [75, 100],

    remotePatterns: [
      {
        protocol: "https",
        hostname: s3ImageHostname,
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "admin.matchworkers.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "www.admin.matchworkers.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "jobportal.matchworkers.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "admin.atlanticlubes.com.pk",
        pathname: "/uploads/**",
      },
      {
        protocol: "https",
        hostname: "www.jobportal.matchworkers.com",
        pathname: "/**",
      },
      {
        protocol: "http",
        hostname: "localhost",
        pathname: "/**",
      },
      {
        protocol: "http",
        hostname: "127.0.0.1",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
