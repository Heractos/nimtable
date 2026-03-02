/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Only proxy known backend paths to Java; /api/agent/* and other /api/* stay on Next.js
  rewrites: () => {
    const base =
      process.env.JAVA_API_URL || "http://localhost:8182"
    const api = base.replace(/\/$/, "") + "/api"
    return [
      { source: "/api/catalogs", destination: `${api}/catalogs` },
      { source: "/api/catalogs/:path*", destination: `${api}/catalogs/:path*` },
      { source: "/api/config/:path*", destination: `${api}/config/:path*` },
      { source: "/api/query", destination: `${api}/query` },
      { source: "/api/manifest/:path*", destination: `${api}/manifest/:path*` },
      { source: "/api/optimize/:path*", destination: `${api}/optimize/:path*` },
      { source: "/api/distribution/:path*", destination: `${api}/distribution/:path*` },
      { source: "/api/catalog/:catalog/:path*", destination: `${api}/catalog/:catalog/:path*` },
    ]
  },
  async redirects() {
    return [
      {
        source: "/",
        destination: "/dashboard",
        permanent: false,
      },
    ]
  },
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
}

module.exports = nextConfig
