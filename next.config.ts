const isProd = process.env.NODE_ENV === 'production';

const withPWA = require('next-pwa')({
  dest: 'public',
  register: false, // We'll register manually in usePWA hook
  skipWaiting: true,
  disable: false, // Enable in both environments for testing
  sw: 'sw.js', // Use the direct service worker file
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
