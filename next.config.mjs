/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["mediasoup"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "utfs.io",
      },
      {
        protocol: "https",
        hostname: "uploadthing.com",
      },
    ],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;