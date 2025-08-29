// Warmup helper: ping critical routes & APIs to seed caches once SW is ready
export async function warmupServiceWorker() {
  try {
    const targets = ['/', '/api/prayers?lang=en'];
    await Promise.all(targets.map(t => fetch(t).catch(() => undefined)));
    // Optionally message SW later for bulk prefetch
  } catch (e) {
    // Silent
  }
}
