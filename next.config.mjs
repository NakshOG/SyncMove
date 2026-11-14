/** @type {import('next').NextConfig} */
const nextConfig = {
  // Permit the development HMR endpoint when the app is opened through the
  // local network address behind NGINX. Keep this configurable for other LANs.
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    process.env.NEXT_PUBLIC_LAN_IP || "172.31.124.88",
  ],
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
      {
        protocol: "https",
        hostname: "*.ufs.sh",
      },
      {
        protocol: "https",
        hostname: "ufs.sh",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
