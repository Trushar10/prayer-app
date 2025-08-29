import { Entry, EntryFieldTypes, EntrySkeletonType } from 'contentful'

// Remove unused Document import

// Types for cached data
type PrayerSkeleton = EntrySkeletonType<{
  title: EntryFieldTypes.Text
  slug: EntryFieldTypes.Text
  body: EntryFieldTypes.RichText
}>

export type PrayerEntry = Entry<PrayerSkeleton>

export interface CachedPrayer {
  id: string; // Used as primary key
  title: string;
  slug: string;
  body: string;
  language: string;
  cachedAt: number; // timestamp
  sys: Record<string, unknown>; // Contentful sys object
  metadata?: Record<string, unknown>; // Contentful metadata
}

export interface CacheMetadata {
  version: string;
  lastFullSync: number;
  languages: string[];
  totalPrayers: number;
}

class PrayerCacheManager {
  private dbName = 'PrayerCache';
  private version = 4; // Bumped to 4 to force upgrade ensuring stores/indexes exist
  private db: IDBDatabase | null = null;

  // Initialize IndexedDB
  async init(): Promise<void> {
    // Check if we're in a browser environment
    if (typeof window === 'undefined') {
      console.warn('IndexedDB not available in server environment');
      return;
    }

    // Check if IndexedDB is supported
    if (!('indexedDB' in window)) {
      console.warn('IndexedDB not supported in this browser');
      return;
    }

    // Force database cleanup on version change to prevent corruption
    console.log('Initializing PrayerCache with version', this.version);
    
    return new Promise((resolve) => {
      try {
        const request = indexedDB.open(this.dbName, this.version);

        request.onerror = () => {
          console.error('Failed to open IndexedDB:', request.error);
          // Force delete and recreate on error
          console.log('Forcing database deletion due to error');
          const deleteReq = indexedDB.deleteDatabase(this.dbName);
          deleteReq.onsuccess = () => {
            console.log('Database deleted, reopening...');
            const reopenReq = indexedDB.open(this.dbName, this.version);
            reopenReq.onupgradeneeded = (event) => {
              this.createObjectStores((event.target as IDBOpenDBRequest).result);
            };
            reopenReq.onsuccess = () => {
              this.db = reopenReq.result;
              console.log('Database recreated successfully');
              resolve();
            };
            reopenReq.onerror = () => {
              console.error('Failed to recreate database:', reopenReq.error);
              resolve();
            };
          };
          deleteReq.onerror = () => {
            console.error('Failed to delete corrupted database');
            resolve();
          };
        };

        request.onerror = () => {
          console.error('Failed to open IndexedDB:', request.error);
          // Don't reject, just warn and continue without cache
          console.warn('Continuing without cache functionality');
          resolve();
        };

        request.onsuccess = () => {
          this.db = request.result;
          // Defensive: verify required stores exist; if not, force rebuild
          const requiredStores = ['prayers', 'metadata'];
          const missing = requiredStores.filter(s => !this.db!.objectStoreNames.contains(s));
          if (missing.length) {
            console.warn('IndexedDB missing stores', missing, '— forcing rebuild');
            this.db!.close();
            const deleteReq = indexedDB.deleteDatabase(this.dbName);
            deleteReq.onsuccess = () => {
              // Re-open with same (already bumped) version to recreate
              const reopen = indexedDB.open(this.dbName, this.version);
              reopen.onupgradeneeded = (event) => {
                try {
                  const db2 = (event.target as IDBOpenDBRequest).result;
                  this.createObjectStores(db2);
                } catch (rebuildErr) {
                  console.error('Error during rebuild upgrade:', rebuildErr);
                }
              };
              reopen.onsuccess = () => {
                this.db = reopen.result;
                resolve();
              };
              reopen.onerror = () => {
                console.error('Failed to reopen DB after rebuild:', reopen.error);
                resolve();
              };
            };
            deleteReq.onerror = () => {
              console.error('Failed to delete DB for rebuild:', deleteReq.error);
              resolve();
            };
          } else {
            resolve();
          }
        };

        request.onupgradeneeded = (event) => {
          try {
            const db = (event.target as IDBOpenDBRequest).result;
            console.log('Database upgrade needed, creating stores...');
            this.createObjectStores(db);
          } catch (upgradeError) {
            console.error('Error during IndexedDB upgrade:', upgradeError);
            resolve(); // Continue without cache
          }
        };
      } catch (initError) {
        console.error('Error initializing IndexedDB:', initError);
        resolve(); // Continue without cache
      }
    });
  }

  // Helper method to create object stores
  private createObjectStores(db: IDBDatabase): void {
    try {
      // Create prayers store
      if (!db.objectStoreNames.contains('prayers')) {
        const prayersStore = db.createObjectStore('prayers', { keyPath: 'id' });
        prayersStore.createIndex('language', 'language', { unique: false });
        prayersStore.createIndex('slug', 'slug', { unique: false });
        prayersStore.createIndex('cachedAt', 'cachedAt', { unique: false });
        console.log('Created prayers object store');
      }

      // Create metadata store
      if (!db.objectStoreNames.contains('metadata')) {
        db.createObjectStore('metadata', { keyPath: 'key' });
        console.log('Created metadata object store');
      }
    } catch (error) {
      console.error('Error creating object stores:', error);
    }
  }

  // Ensure DB is initialized
  private async ensureInit(): Promise<void> {
    if (!this.db && typeof window !== 'undefined' && 'indexedDB' in window) {
      await this.init();
    }
  }

  // Check if cache is available
  private isCacheAvailable(): boolean {
    return typeof window !== 'undefined' && 'indexedDB' in window && this.db !== null;
  }

  // Get cached prayer by slug and language
  async getCachedPrayer(slug: string, language: string): Promise<CachedPrayer | null> {
    await this.ensureInit();
    if (!this.isCacheAvailable()) {
      console.warn('Cache not available, returning null');
      return null;
    }

    return new Promise((resolve) => {
      const transaction = this.db!.transaction(['prayers'], 'readonly');
      const store = transaction.objectStore('prayers');
      const index = store.index('slug');
      const request = index.getAll(slug);

      request.onsuccess = () => {
        const prayers = request.result as CachedPrayer[];
        const prayer = prayers.find(p => p.language === language);
        resolve(prayer || null);
      };

      request.onerror = () => {
        console.error('Error getting cached prayer:', request.error);
        resolve(null);
      };
    });
  }

  // Get all cached prayers for a language
  async getCachedPrayersByLanguage(language: string): Promise<CachedPrayer[]> {
    await this.ensureInit();
    if (!this.isCacheAvailable()) {
      console.warn('Cache not available, returning empty array');
      return [];
    }

    return new Promise((resolve) => {
      try {
        const transaction = this.db!.transaction(['prayers'], 'readonly');
        const store = transaction.objectStore('prayers');
        
        // Check if the language index exists
        if (store.indexNames.contains('language')) {
          const index = store.index('language');
          const request = index.getAll(language);

          request.onsuccess = () => {
            resolve(request.result as CachedPrayer[]);
          };

          request.onerror = () => {
            console.error('Error getting cached prayers by language index:', request.error);
            resolve([]);
          };
        } else {
          // Fallback: scan all records if index doesn't exist
          console.warn('Language index not found, falling back to full scan');
          const request = store.getAll();
          
          request.onsuccess = () => {
            const allPrayers = request.result as CachedPrayer[];
            const filteredPrayers = allPrayers.filter(prayer => prayer.language === language);
            resolve(filteredPrayers);
          };

          request.onerror = () => {
            console.error('Error getting all cached prayers for fallback:', request.error);
            resolve([]);
          };
        }
      } catch (error) {
        console.error('Error in getCachedPrayersByLanguage:', error);
        resolve([]);
      }
    });
  }

  // Cache a single prayer
  async cachePrayer(prayer: PrayerEntry, language: string): Promise<void> {
    await this.ensureInit();
    if (!this.isCacheAvailable()) {
      console.warn('Cache not available, skipping cache operation');
      return;
    }

    const cachedPrayer: CachedPrayer = {
      id: `${prayer.sys.id}-${language}`,
      title: typeof prayer.fields.title === 'string' ? prayer.fields.title : '',
      slug: typeof prayer.fields.slug === 'string' ? prayer.fields.slug : '',
      body: typeof prayer.fields.body === 'string' ? prayer.fields.body : JSON.stringify(prayer.fields.body),
      sys: prayer.sys as unknown as Record<string, unknown>,
      metadata: (prayer.metadata as Record<string, unknown>) || {},
      language,
      cachedAt: Date.now()
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['prayers'], 'readwrite');
      const store = transaction.objectStore('prayers');
      const request = store.put(cachedPrayer);

      request.onsuccess = () => resolve();
      request.onerror = () => {
        console.error('Error caching prayer:', request.error);
        reject(request.error);
      };
    });
  }

  // Cache multiple prayers
  async cachePrayers(prayers: PrayerEntry[], language: string): Promise<void> {
    await this.ensureInit();
    if (!this.isCacheAvailable()) {
      console.warn('Cache not available, skipping cache operation');
      return;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['prayers'], 'readwrite');
      const store = transaction.objectStore('prayers');
      let completed = 0;
      let hasError = false;

      if (prayers.length === 0) {
        resolve();
        return;
      }

      prayers.forEach((prayer) => {
        const cachedPrayer: CachedPrayer = {
          id: `${prayer.sys.id}-${language}`,
          title: typeof prayer.fields.title === 'string' ? prayer.fields.title : '',
          slug: typeof prayer.fields.slug === 'string' ? prayer.fields.slug : '',
          body: typeof prayer.fields.body === 'string' ? prayer.fields.body : JSON.stringify(prayer.fields.body),
          sys: prayer.sys as unknown as Record<string, unknown>,
          metadata: (prayer.metadata as Record<string, unknown>) || {},
          language,
          cachedAt: Date.now()
        };

        const request = store.put(cachedPrayer);
        
        request.onsuccess = () => {
          completed++;
          if (completed === prayers.length && !hasError) {
            resolve();
          }
        };

        request.onerror = () => {
          hasError = true;
          console.error('Error caching prayer:', prayer.fields.title, request.error);
          reject(request.error);
        };
      });
    });
  }

  // Update cache metadata
  async updateMetadata(metadata: Partial<CacheMetadata>): Promise<void> {
    await this.ensureInit();
    if (!this.isCacheAvailable()) {
      console.warn('Cache not available, skipping metadata update');
      return;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['metadata'], 'readwrite');
      const store = transaction.objectStore('metadata');
      
      const existing = { key: 'cache-info', ...metadata };
      const request = store.put(existing);

      request.onsuccess = () => resolve();
      request.onerror = () => {
        console.error('Error updating metadata:', request.error);
        reject(request.error);
      };
    });
  }

  // Get cache metadata
  async getMetadata(): Promise<CacheMetadata | null> {
    await this.ensureInit();
    if (!this.db) return null;

    return new Promise((resolve) => {
      const transaction = this.db!.transaction(['metadata'], 'readonly');
      const store = transaction.objectStore('metadata');
      const request = store.get('cache-info');

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        console.error('Error getting metadata:', request.error);
        resolve(null);
      };
    });
  }

  // Check if cache needs refresh (older than 24 hours)
  async needsRefresh(): Promise<boolean> {
    const metadata = await this.getMetadata();
    if (!metadata) return true;
    
    const dayInMs = 24 * 60 * 60 * 1000;
    return Date.now() - metadata.lastFullSync > dayInMs;
  }

  // Clear all cached data
  async clearCache(): Promise<void> {
    await this.ensureInit();
    if (!this.isCacheAvailable()) {
      console.warn('Cache not available, skipping clear operation');
      return;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['prayers', 'metadata'], 'readwrite');
      const prayersStore = transaction.objectStore('prayers');
      const metadataStore = transaction.objectStore('metadata');

      const clearPrayers = prayersStore.clear();
      const clearMetadata = metadataStore.clear();

      let completed = 0;
      const checkComplete = () => {
        completed++;
        if (completed === 2) resolve();
      };

      clearPrayers.onsuccess = checkComplete;
      clearMetadata.onsuccess = checkComplete;
      
      clearPrayers.onerror = clearMetadata.onerror = () => {
        console.error('Error clearing cache');
        reject(new Error('Failed to clear cache'));
      };
    });
  }

  // Get cache statistics
  async getCacheStats(): Promise<{ totalPrayers: number; languages: string[]; lastSync: Date | null; size: number }> {
    await this.ensureInit();
    if (!this.isCacheAvailable()) {
      console.warn('Cache not available, returning empty stats');
      return { totalPrayers: 0, languages: [], lastSync: null, size: 0 };
    }

    // Get actual database size first
    const actualSize = await this.getDatabaseSize();

    return new Promise((resolve) => {
      const transaction = this.db!.transaction(['prayers', 'metadata'], 'readonly');
      const prayersStore = transaction.objectStore('prayers');
      const metadataStore = transaction.objectStore('metadata');

      const countRequest = prayersStore.count();
      const metadataRequest = metadataStore.get('cache-info');

      let totalPrayers = 0;
      let metadata: CacheMetadata | null = null;

      countRequest.onsuccess = () => {
        totalPrayers = countRequest.result;
        checkComplete();
      };

      metadataRequest.onsuccess = () => {
        metadata = metadataRequest.result;
        checkComplete();
      };

      let completed = 0;
      const checkComplete = () => {
        completed++;
        if (completed === 2) {
          resolve({
            totalPrayers,
            languages: metadata?.languages || [],
            lastSync: metadata?.lastFullSync ? new Date(metadata.lastFullSync) : null,
            size: actualSize
          });
        }
      };

      countRequest.onerror = metadataRequest.onerror = () => {
        resolve({ totalPrayers: 0, languages: [], lastSync: null, size: actualSize });
      };
    });
  }

  private estimateSize(prayerCount: number): number {
    // More accurate estimate: each prayer ~8KB (text content + metadata)
    return prayerCount * 8 * 1024;
  }

  // Get actual database size
  async getDatabaseSize(): Promise<number> {
    await this.ensureInit();
    if (!this.isCacheAvailable()) {
      console.warn('Cache not available, returning 0 for database size');
      return 0;
    }

    return new Promise((resolve) => {
      const transaction = this.db!.transaction(['prayers'], 'readonly');
      const store = transaction.objectStore('prayers');
      const request = store.getAll();

      request.onsuccess = () => {
        const prayers = request.result as CachedPrayer[];
        let totalSize = 0;
        
        prayers.forEach(prayer => {
          // Calculate size of each prayer object in bytes
          const jsonString = JSON.stringify(prayer);
          totalSize += new Blob([jsonString]).size;
        });

        resolve(totalSize);
      };

      request.onerror = () => {
        resolve(this.estimateSize(0));
      };
    });
  }
}

// Create singleton instance
export const prayerCache = new PrayerCacheManager();

// Utility functions for easy access
export async function getCachedPrayer(slug: string, language: string): Promise<CachedPrayer | null> {
  try {
    return await prayerCache.getCachedPrayer(slug, language);
  } catch (error) {
    console.error('Error getting cached prayer:', error);
    return null;
  }
}

export async function getCachedPrayersByLanguage(language: string): Promise<CachedPrayer[]> {
  try {
    return await prayerCache.getCachedPrayersByLanguage(language);
  } catch (error) {
    console.error('Error getting cached prayers:', error);
    return [];
  }
}

export async function cachePrayer(prayer: PrayerEntry, language: string): Promise<void> {
  try {
    await prayerCache.cachePrayer(prayer, language);
  } catch (error) {
    console.error('Error caching prayer:', error);
  }
}

export async function cachePrayers(prayers: PrayerEntry[], language: string): Promise<void> {
  try {
    await prayerCache.cachePrayers(prayers, language);
  } catch (error) {
    console.error('Error caching prayers:', error);
  }
}

export async function getCacheStats() {
  try {
    return await prayerCache.getCacheStats();
  } catch (error) {
    console.error('Error getting cache stats:', error);
    return { totalPrayers: 0, languages: [], lastSync: null, size: 0 };
  }
}

export async function clearPrayerCache(): Promise<void> {
  try {
    await prayerCache.clearCache();
  } catch (error) {
    console.error('Error clearing cache:', error);
  }
}
