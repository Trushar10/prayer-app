import { cachePrayers } from '../lib/prayerCache';

class OfflineService {
  private readonly CACHE_NAME = 'prayer-offline-v2';
  private readonly CONTENT_KEY = 'offlineContent';

  async downloadAllContent(progressCallback?: (progress: number) => void): Promise<void> {
    try {
      const languages = ['en', 'hi', 'gu']; // Your supported languages
      const totalSteps = languages.length * 2 + 1; // prayers list + individual prayers + app shell
      let completedSteps = 0;

      const cache = await caches.open(this.CACHE_NAME);
      
      // First, cache the app shell and essential pages
      try {
        // Dynamic discovery of current build assets
        let appShellUrls = [
          '/', 
          '/offline', 
          '/manifest.json'
        ];
        
        // Try to discover current build assets from the home page
        try {
          const homeResponse = await fetch('/');
          if (homeResponse.ok) {
            const homeText = await homeResponse.text();
            
            // Extract current CSS and JS files from the HTML
            const cssFiles = homeText.match(/\/_next\/static\/css\/[^"']+\.css/g) || [];
            const jsFiles = homeText.match(/\/_next\/static\/chunks\/[^"']+\.js/g) || [];
            
            // Add discovered assets to cache list
            appShellUrls = [...appShellUrls, ...cssFiles, ...jsFiles];
            console.log('Discovered assets for caching:', [...cssFiles, ...jsFiles]);
          }
        } catch (discoveryError) {
          console.warn('Failed to discover assets, using basic shell only:', discoveryError);
        }
        
        const appShellPromises = appShellUrls.map(async (url) => {
          try {
            const response = await fetch(url);
            if (response.ok) {
              await cache.put(url, response.clone());
              console.log(`Successfully cached: ${url}`);
            }
          } catch (error) {
            console.warn(`Failed to cache app shell resource ${url}:`, error);
          }
        });
        
        await Promise.all(appShellPromises);
        completedSteps++;
        progressCallback?.(Math.round((completedSteps / totalSteps) * 100));
      } catch (error) {
        console.warn('Failed to cache app shell:', error);
      }
      
      for (const lang of languages) {
        try {
          // Download prayers list for this language
          const prayersResponse = await fetch(`/api/prayers?lang=${lang}`);
          if (prayersResponse.ok) {
            const prayersData = await prayersResponse.json();
            
            // Cache the prayers list
            await cache.put(`/api/prayers?lang=${lang}`, new Response(JSON.stringify(prayersData)));
            
            // Also store in IndexedDB cache system
            if (prayersData.items && Array.isArray(prayersData.items)) {
              await cachePrayers(prayersData.items, lang);
            }
            
            completedSteps++;
            progressCallback?.(Math.round((completedSteps / totalSteps) * 100));

            // Download individual prayer details (both API and HTML pages)
            if (prayersData.items && Array.isArray(prayersData.items)) {
              const detailPromises = prayersData.items.map(async (prayer: { fields?: { slug?: string } }) => {
                if (prayer.fields?.slug) {
                  const cleanSlug = this.cleanUrlSlug(prayer.fields.slug);
                  try {
                    // Cache the API endpoint
                    const prayerResponse = await fetch(`/api/prayer/${prayer.fields.slug}?lang=${lang}`);
                    if (prayerResponse.ok) {
                      await cache.put(`/api/prayer/${prayer.fields.slug}?lang=${lang}`, prayerResponse.clone());
                    }

                    // Cache the actual HTML page for navigation
                    const prayerPageResponse = await fetch(`/${cleanSlug}`);
                    if (prayerPageResponse.ok) {
                      await cache.put(`/${cleanSlug}`, prayerPageResponse.clone());
                    }
                  } catch (error) {
                    console.warn(`Failed to cache prayer ${prayer.fields.slug} for ${lang}:`, error);
                  }
                }
              });
              
              // Wait for all prayer details to be cached
              await Promise.all(detailPromises);
            }
            
            completedSteps++;
            progressCallback?.(Math.round((completedSteps / totalSteps) * 100));
          }
        } catch (error) {
          console.warn(`Failed to download content for ${lang}:`, error);
          completedSteps += 2; // Skip both steps for this language
          progressCallback?.(Math.round((completedSteps / totalSteps) * 100));
        }
      }
      
      // Mark as downloaded with timestamp
      localStorage.setItem('offlineContentDownloaded', new Date().toISOString());
      localStorage.setItem('appReadyForOffline', 'true');
      
    } catch (error) {
      console.error('Error downloading offline content:', error);
      throw error;
    }
  }

  async getOfflineContent(url: string): Promise<unknown> {
    try {
      const cache = await caches.open(this.CACHE_NAME);
      const response = await cache.match(url);
      
      if (response) {
        return await response.json();
      }
      
      // Fallback to network if available
      if (navigator.onLine) {
        try {
          const networkResponse = await fetch(url);
          if (networkResponse.ok) {
            // Cache for future use
            await cache.put(url, networkResponse.clone());
            return await networkResponse.json();
          }
        } catch (networkError) {
          console.warn('Network fallback failed:', networkError);
        }
      }
      
      throw new Error('Content not available offline and no network connection');
    } catch (error) {
      console.error('Error getting offline content:', error);
      throw error;
    }
  }

  isOfflineContentAvailable(): boolean {
    return localStorage.getItem('offlineContentDownloaded') !== null;
  }

  getLastDownloadDate(): Date | null {
    const dateString = localStorage.getItem('offlineContentDownloaded');
    return dateString ? new Date(dateString) : null;
  }

  async clearOfflineContent(): Promise<void> {
    try {
      await caches.delete(this.CACHE_NAME);
      localStorage.removeItem('offlineContentDownloaded');
      localStorage.removeItem('appReadyForOffline');
    } catch (error) {
      console.error('Error clearing offline content:', error);
      throw error;
    }
  }

  // Helper function to clean URL slugs (replace spaces with hyphens)
  private cleanUrlSlug(text: string): string {
    return text
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/\-\-+/g, '-'); // Replace multiple hyphens with single hyphen
  }

  async getOfflineContentStats(): Promise<{
    isAvailable: boolean;
    lastDownload: Date | null;
    totalSize: number;
  }> {
    try {
      const isAvailable = this.isOfflineContentAvailable();
      const lastDownload = this.getLastDownloadDate();
      
      let totalSize = 0;
      if (isAvailable) {
        const cache = await caches.open(this.CACHE_NAME);
        const requests = await cache.keys();
        
        for (const request of requests) {
          try {
            const response = await cache.match(request);
            if (response) {
              const blob = await response.blob();
              totalSize += blob.size;
            }
          } catch (error) {
            console.warn('Error calculating cache size:', error);
          }
        }
      }
      
      return {
        isAvailable,
        lastDownload,
        totalSize
      };
    } catch (error) {
      console.error('Error getting offline content stats:', error);
      return {
        isAvailable: false,
        lastDownload: null,
        totalSize: 0
      };
    }
  }
}

const offlineService = new OfflineService();
export default offlineService;
