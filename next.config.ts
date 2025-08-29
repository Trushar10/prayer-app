const isProd = process.env.NODE_ENV === 'production';

const withPWA = require('next-pwa')({
  dest: 'public',
  register: false, // We'll register manually in _app.tsx
  skipWaiting: true,
  disable: false, // Always enabled for testing
  swSrc: 'src/sw.simple.js', // Use our custom service worker
  fallbacks: {
    document: '/offline',
  },
});

module.exports = withPWA({
  reactStrictMode: true,
  images: {
    domains: ['images.ctfassets.net'],
  },
});
