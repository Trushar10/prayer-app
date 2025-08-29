const isProd = process.env.NODE_ENV === 'production';

const withPWA = require('next-pwa')({
  dest: 'public',
  register: false, // We'll register manually in usePWA hook
  skipWaiting: true,
  disable: false, // Enable in development for testing
  swSrc: 'src/sw.simple.js',
  swDest: 'public/sw.js',
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
