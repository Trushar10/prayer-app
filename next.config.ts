const isProd = process.env.NODE_ENV === 'production';

const withPWA = require('next-pwa')({
  dest: 'public',
  register: false, // We'll register manually in _app.tsx
  skipWaiting: true,
  disable: false, // Re-enabled for production
  buildExcludes: [/middleware-manifest\.json$/, /dynamic-css-manifest\.json$/],
  // Ensure workbox is available for registration
  scope: '/',
  cacheOnFrontEndNav: true,
  // Add offline fallback configuration
  fallbacks: {
    document: '/offline',
  },
  // Filter out offline.html from precache manifest
  manifestTransforms: [
    (manifestEntries: any[]) => {
      return {
        manifest: manifestEntries.filter((entry: any) => !entry.url.includes('offline.html')),
        warnings: [],
      };
    },
  ],
  // Additional runtime caching for offline page
  runtimeCaching: [
    {
      urlPattern: /^\/offline$/,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'offline-fallback',
        expiration: {
          maxEntries: 1,
          maxAgeSeconds: 24 * 60 * 60, // 24 hours
        },
      },
    },
  ],
});

module.exports = withPWA({
  reactStrictMode: true,
  images: {
    domains: ['images.ctfassets.net'],
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
          {
            key: 'Content-Type',
            value: 'application/javascript; charset=utf-8',
          },
        ],
      },
    ];
  },
});
