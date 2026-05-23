/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cards.scryfall.io" },
      { protocol: "https", hostname: "c1.scryfall.com" },
      { protocol: "https", hostname: "svgs.scryfall.io" },
    ],
  },
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: https://cards.scryfall.io https://c1.scryfall.com https://svgs.scryfall.io",
              // Supabase project URL must be allowed so the browser client
               // can reach the auth + REST endpoints. If we ever rotate
               // projects, update this and redeploy.
              "connect-src 'self' https://api.scryfall.com https://json.edhrec.com https://bjznqbxbdesxofnuohtn.supabase.co wss://bjznqbxbdesxofnuohtn.supabase.co",
            ].join("; "),
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          // Disable browser features the app doesn't use, so a future
          // XSS can't quietly turn on the camera, mic, or geolocation
          // through us. Vercel/Supabase don't need any of these.
          {
            key: "Permissions-Policy",
            value: [
              "camera=()",
              "microphone=()",
              "geolocation=()",
              "payment=()",
              "usb=()",
              "magnetometer=()",
              "gyroscope=()",
              "accelerometer=()",
            ].join(", "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
