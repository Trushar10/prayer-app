import { cachePrayer, getCachedPrayersByLanguage } from '../lib/prayerCache';
import { getAvailableLanguages } from '../utils/getLanguages';

interface PrayerItem {
  fields?: {
    slug?: string;
    title?: string;
    body?: unknown;
  };
  sys?: unknown;
  metadata?: unknown;
}

export class ContentDownloader {
  private isDownloading = false;
  private downloadProgress = { current: 0, total: 0 };

  /**
   * Download all prayer content for all available languages
   */
  async downloadAllContent(): Promise<void> {
    if (this.isDownloading) {
      console.log('Content download already in progress');
      return;
    }

    if (!navigator.onLine) {
      console.log('Skipping content download - offline');
      return;
    }

    this.isDownloading = true;
    console.log('Starting automatic content download...');

    try {
      // Get all available languages
      const languages = await getAvailableLanguages();
      console.log('Found languages:', languages.map(l => l.code));

      // Calculate total operations for progress tracking
      this.downloadProgress.total = languages.length * 2; // prayers list + individual prayers
      this.downloadProgress.current = 0;

      // Download content for each language
      for (const language of languages) {
        await this.downloadLanguageContent(language.code);
      }

      console.log('✅ Content download completed successfully');
      this.dispatchDownloadComplete();

    } catch (error) {
      console.error('❌ Content download failed:', error);
      this.dispatchDownloadError(error as Error);
    } finally {
      this.isDownloading = false;
    }
  }

  /**
   * Download all content for a specific language
   */
  private async downloadLanguageContent(langCode: string): Promise<void> {
    console.log(`📥 Downloading content for language: ${langCode}`);

    try {
      // 1. Fetch prayers list for this language
      const prayersResponse = await fetch(`/api/prayers?lang=${langCode}`);
      if (!prayersResponse.ok) {
        throw new Error(`Failed to fetch prayers for ${langCode}: ${prayersResponse.status}`);
      }

      const prayersData = await prayersResponse.json();
      this.downloadProgress.current++;

      // 2. Cache individual prayers
      const prayers = prayersData.items || [];
      console.log(`Found ${prayers.length} prayers for ${langCode}`);

      for (const prayer of prayers) {
        await this.downloadIndividualPrayer(prayer, langCode);
      }

      console.log(`✅ Completed download for ${langCode}`);

    } catch (error) {
      console.error(`❌ Failed to download content for ${langCode}:`, error);
      // Continue with other languages even if one fails
    }
  }

  /**
   * Download and cache an individual prayer
   */
  private async downloadIndividualPrayer(prayer: PrayerItem, langCode: string): Promise<void> {
    try {
      const slug = prayer.fields?.slug;
      if (!slug) return;

      // Fetch full prayer content
      const prayerResponse = await fetch(`/api/prayer/${slug}?lang=${langCode}`);
      if (!prayerResponse.ok) {
        console.warn(`Failed to fetch prayer ${slug} for ${langCode}: ${prayerResponse.status}`);
        return;
      }

      const prayerData = await prayerResponse.json();
      const fullPrayer = prayerData.prayer;

      if (fullPrayer) {
        // Cache the prayer content
        await cachePrayer(fullPrayer, langCode);

        this.downloadProgress.current++;
      }

    } catch (error) {
      console.warn(`Failed to cache prayer ${prayer.fields?.slug}:`, error);
    }
  }

  /**
   * Get download progress
   */
  getProgress() {
    return {
      ...this.downloadProgress,
      percentage: this.downloadProgress.total > 0
        ? Math.round((this.downloadProgress.current / this.downloadProgress.total) * 100)
        : 0,
      isDownloading: this.isDownloading
    };
  }

  /**
   * Check if content is already cached for offline use (client-side version)
   */
  async isContentCachedClientSide(): Promise<boolean> {
    try {
      // Use hardcoded supported languages for client-side
      const languages = [
        { code: 'en', name: 'English' },
        { code: 'hi', name: 'हिन्दी' },
        { code: 'gu', name: 'ગુજરાતી' }
      ];
      
      let totalPrayers = 0;
      let cachedPrayers = 0;

      for (const language of languages) {
        // Check if we have prayers cached for this language
        const cachedPrayersForLang = await getCachedPrayersByLanguage(language.code);
        try {
          const prayersResponse = await fetch(`/api/prayers?lang=${language.code}`);
          const prayersData = await prayersResponse.json();
          const totalPrayersForLang = prayersData.items?.length || 0;

          totalPrayers += totalPrayersForLang;
          cachedPrayers += cachedPrayersForLang.length;
        } catch (fetchError) {
          console.warn(`Failed to fetch prayers for ${language.code}:`, fetchError);
          // If we can't fetch, assume we have some cached prayers
          cachedPrayers += cachedPrayersForLang.length;
        }
      }

      const cacheRatio = totalPrayers > 0 ? cachedPrayers / totalPrayers : 0;
      return cacheRatio > 0.8; // Consider cached if 80%+ of content is available

    } catch (error) {
      console.error('Failed to check cache status:', error);
      return false;
    }
  }

  private dispatchDownloadComplete() {
    window.dispatchEvent(new CustomEvent('contentDownloadComplete', {
      detail: { success: true }
    }));
  }

  private dispatchDownloadError(error: Error) {
    window.dispatchEvent(new CustomEvent('contentDownloadError', {
      detail: { error: error.message }
    }));
  }
}

// Global instance
export const contentDownloader = new ContentDownloader();
