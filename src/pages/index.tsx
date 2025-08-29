import Head from 'next/head'
import { useEffect, useState, useMemo, useCallback } from 'react';
import { Entry, EntryFieldTypes, EntrySkeletonType } from 'contentful'
import { Document } from '@contentful/rich-text-types'
import { documentToReactComponents, Options } from '@contentful/rich-text-react-renderer'
import { BLOCKS } from '@contentful/rich-text-types'
import ThemeToggle from '../components/ThemeToggle'
import LanguageToggle from '../components/LanguageToggle'
import OfflineIndicator from '../components/OfflineIndicator'
import InstallPrompt from '../components/InstallPrompt'
import { usePWA } from '../hooks/usePWA'
import { 
  getCachedPrayer, 
  getCachedPrayersByLanguage, 
  cachePrayers, 
  cachePrayer, 
  getCacheStats, 
  prayerCache,
  CachedPrayer
} from '../lib/prayerCache'

const cleanUrlSlug = (text: string): string => {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/\-\-+/g, '-');
}

const formatBytes = (bytes: number): string => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

type PrayerSkeleton = EntrySkeletonType<{
  title: EntryFieldTypes.Text
  slug: EntryFieldTypes.Text
  body: EntryFieldTypes.RichText
}>

type PrayerEntry = Entry<PrayerSkeleton>

interface GroupedPrayers {
  [tagName: string]: PrayerEntry[]
}

export default function Home() {
  try {
    return <PrayerApp />
  } catch (error) {
    console.error('Critical error in Prayer App:', error)
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
        <h1>Prayer App</h1>
        <p>Something went wrong. Please refresh the page.</p>
        <button onClick={() => window.location.reload()} style={{ 
          padding: '0.5rem 1rem', 
          backgroundColor: '#317EFB', 
          color: 'white', 
          border: 'none', 
          borderRadius: '4px',
          cursor: 'pointer',
          marginTop: '1rem'
        }}>
          Refresh Page
        </button>
      </div>
    )
  }
}

function PrayerApp() {
  // Custom rich text rendering options with error handling
  const richTextOptions: Options = {
    renderNode: {
      [BLOCKS.PARAGRAPH]: (node, children) => {
        try {
          return <p>{children}</p>
        } catch (error) {
          console.error('Error rendering paragraph:', error)
          return <p>Content unavailable</p>
        }
      },
      [BLOCKS.HEADING_1]: (node, children) => {
        try {
          return <h1>{children}</h1>
        } catch (error) {
          console.error('Error rendering heading:', error)
          return <h1>Heading unavailable</h1>
        }
      },
      [BLOCKS.HEADING_2]: (node, children) => {
        try {
          return <h2>{children}</h2>
        } catch (error) {
          console.error('Error rendering heading:', error)
          return <h2>Heading unavailable</h2>
        }
      },
      [BLOCKS.UL_LIST]: (node, children) => {
        try {
          return <ul>{children}</ul>
        } catch (error) {
          console.error('Error rendering list:', error)
          return <ul><li>List content unavailable</li></ul>
        }
      },
      [BLOCKS.LIST_ITEM]: (node, children) => {
        try {
          return <li>{children}</li>
        } catch (error) {
          console.error('Error rendering list item:', error)
          return <li>Item unavailable</li>
        }
      }
    }
  }

  const [tagNames, setTagNames] = useState<{ [id: string]: string }>({})
  const [selectedLang, setSelectedLang] = useState('en')
  const [filteredPrayers, setFilteredPrayers] = useState<Array<PrayerEntry>>([])
  const [currentView, setCurrentView] = useState<'home' | 'prayer'>('home')
  const [selectedPrayer, setSelectedPrayer] = useState<PrayerEntry | null>(null)
  const [isAnimating, setIsAnimating] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [cacheStats, setCacheStats] = useState<{ totalPrayers: number; languages: string[]; lastSync: Date | null; size: number }>({ 
    totalPrayers: 0, 
    languages: [], 
    lastSync: null, 
    size: 0 
  })

  // Initialize PWA
  const { isOnline } = usePWA();

  // Initialize cache on app start
  useEffect(() => {
    // Only initialize cache in browser environment
    if (typeof window === 'undefined') {
      return
    }

    const initCache = async () => {
      try {
        await prayerCache.init()
        const stats = await getCacheStats()
        setCacheStats(stats)
      } catch (error) {
        console.warn('Cache initialization failed, continuing without cache:', error)
        // App will continue to work without cache
        setCacheStats({ totalPrayers: 0, languages: [], lastSync: null, size: 0 })
      }
    }
    initCache()
  }, [])

  // Fetch prayers and tag names together with caching
  useEffect(() => {
    async function fetchPrayersAndTags() {      
      try {
        // First, try to get from cache
        let cachedPrayers: CachedPrayer[] = []
        try {
          cachedPrayers = await getCachedPrayersByLanguage(selectedLang) || []
        } catch (cacheError) {
          console.warn('Cache access failed:', cacheError)
          cachedPrayers = []
        }
        
        if (cachedPrayers && Array.isArray(cachedPrayers) && cachedPrayers.length > 0) {
          // Use cached data immediately - convert cached data to PrayerEntry format
          const prayers: PrayerEntry[] = cachedPrayers.map(cached => {
            return {
              sys: cached.sys,
              fields: {
                title: cached.title,
                slug: cached.slug,
                body: cached.body
              },
              metadata: cached.metadata || {}
            } as unknown as PrayerEntry;
          });
          
          setFilteredPrayers(prayers)
          
          // Build tag mapping from cached data
          buildTagMapping(prayers)
        }

        // Check network connectivity before attempting fresh fetch
        const isOnline = navigator.onLine        
        const needsRefresh = cachedPrayers.length === 0 || await prayerCache.needsRefresh()
        
        if (needsRefresh && isOnline) {
          try {
            const res = await fetch(`/api/prayers?lang=${selectedLang}`)
            
            if (!res.ok) {
              throw new Error(`HTTP ${res.status}: ${res.statusText}`)
            }
            
            const data = await res.json()
            
            if (data.items && Array.isArray(data.items)) {
              const freshPrayers: PrayerEntry[] = data.items
              setFilteredPrayers(freshPrayers)
              
              // Cache the fresh data
              await cachePrayers(freshPrayers, selectedLang)
              
              // Update cache metadata
              await prayerCache.updateMetadata({
                lastFullSync: Date.now(),
                languages: [selectedLang],
                totalPrayers: freshPrayers.length
              })
              
              // Update cache stats
              const stats = await getCacheStats()
              setCacheStats(stats)
              
              // Build tag mapping from fresh data
              buildTagMapping(freshPrayers, data.tags)
            } else {
              console.warn('API response missing items array:', data)
            }
          } catch (networkError) {
            console.warn('Network request failed, using cached data:', networkError)
            // If we have cached data, continue using it
            if (cachedPrayers.length === 0) {
              // No cached data and network failed - show error
              console.error('No cached data available and network failed')
              setHasError(true)
            }
          }
        } else if (cachedPrayers.length > 0 && isOnline) {
          // If we used cache and don't need refresh, still get tag data from API if online
          try {
            const res = await fetch(`/api/prayers?lang=${selectedLang}`)
            const data = await res.json()
            if (data.tags) {
              // Use current filtered prayers for tag mapping
              buildTagMapping([], data.tags)
            }
          } catch (fetchError) {
            console.warn('Failed to fetch fresh tag data, using cached prayers only', fetchError)
          }
        } else {
          // Offline or no need to refresh - just use cached data
          console.log('Using cached data only (offline or no refresh needed)')
        }
      } catch (error) {
        console.error('Error fetching prayers:', error)
        
        // Fallback to cached data if network fails
        let cachedPrayers: CachedPrayer[] = []
        try {
          cachedPrayers = await getCachedPrayersByLanguage(selectedLang) || []
        } catch (cacheError) {
          console.warn('Cache access failed during fallback:', cacheError)
          cachedPrayers = []
        }
        
        if (cachedPrayers && Array.isArray(cachedPrayers) && cachedPrayers.length > 0) {
          const prayers: PrayerEntry[] = cachedPrayers.map(cached => {
            return {
              sys: cached.sys,
              fields: {
                title: cached.title,
                slug: cached.slug,
                body: cached.body
              },
              metadata: cached.metadata || {}
            } as unknown as PrayerEntry;
          });
          
          setFilteredPrayers(prayers)
          buildTagMapping(prayers)
        } else {
          // Both network and cache failed
          console.error('No prayers available from network or cache')
          setHasError(true)
          setFilteredPrayers([])
        }
      } finally {
        // No longer need loading state with caching
      }
    }

    function buildTagMapping(prayers: PrayerEntry[], apiTags?: Array<{ sys: { id: string }; name?: string }>) {
      const mapping: { [id: string]: string } = {}
      
      // First, add mappings from API response if available
      if (apiTags && Array.isArray(apiTags)) {
        apiTags.forEach((tag: { sys: { id: string }, name?: string }) => {
          mapping[tag.sys.id] = tag.name || tag.sys.id
        })
      }
      
      // Add comprehensive fallback mappings
      const fallbackMappings = {
        'obligatory-prayers': 'The Obligatory Prayers',
        'general-prayers': 'General Prayers',
        'morning-prayers': 'Morning Prayers',
        'evening-prayers': 'Evening Prayers',
        'daily-prayers': 'Daily Prayers',
        'special-prayers': 'Special Prayers',
        'healing-prayers': 'Healing Prayers',
        'protection-prayers': 'Protection Prayers',
        'generalPrayers': 'General Prayers',
        'theObligatoryPrayers': 'The Obligatory Prayers',
        'obligatoryPrayers': 'The Obligatory Prayers',
        'specialPrayers': 'Special Prayers',
        'morningPrayers': 'Morning Prayers',
        'eveningPrayers': 'Evening Prayers',
        'healingPrayers': 'Healing Prayers',
        'protectionPrayers': 'Protection Prayers',
        'obligatory': 'The Obligatory Prayers',
        'general': 'General Prayers',
        'morning': 'Morning Prayers',
        'evening': 'Evening Prayers',
        'daily': 'Daily Prayers',
        'special': 'Special Prayers',
        'healing': 'Healing Prayers',
        'protection': 'Protection Prayers',
      }
      
      Object.entries(fallbackMappings).forEach(([id, name]) => {
        if (!mapping[id]) {
          mapping[id] = name
        }
      })
      
      setTagNames(mapping)
    }

    fetchPrayersAndTags()
  }, [selectedLang])

  // Persist selected language to localStorage  
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('selectedLang', selectedLang)
    }
  }, [selectedLang])

  // Get language from localStorage on startup
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedLang = localStorage.getItem('selectedLang')
      if (savedLang && ['en', 'hi', 'gu'].includes(savedLang)) {
        setSelectedLang(savedLang)
      }
    }
  }, [])

  const fetchPrayerContent = useCallback(async (slug: string): Promise<PrayerEntry | null> => {
    try {
      // First, try to get from cache
      const cachedPrayer = await getCachedPrayer(slug, selectedLang)
      
      if (cachedPrayer) {
        // Convert cached prayer to PrayerEntry format
        const prayerEntry: PrayerEntry = {
          sys: cachedPrayer.sys,
          fields: {
            title: cachedPrayer.title,
            slug: cachedPrayer.slug,
            body: cachedPrayer.body
          },
          metadata: cachedPrayer.metadata || {}
        } as unknown as PrayerEntry;
        
        return prayerEntry
      }
      
      // If not in cache, try to find in current filteredPrayers (for offline scenarios)
      const prayerFromList = filteredPrayers.find(p => {
        const prayerSlug = typeof p.fields.slug === 'string' ? p.fields.slug : String(p.fields.slug)
        return cleanUrlSlug(prayerSlug) === cleanUrlSlug(slug)
      })
      
      if (prayerFromList) {
        // Cache it for future use
        try {
          await cachePrayer(prayerFromList, selectedLang)
        } catch (cacheError) {
          console.warn('Failed to cache prayer from list:', cacheError)
        }
        
        return prayerFromList
      }
      
      // If not in current list, fetch from API
      try {
        const res = await fetch(`/api/prayer/${slug}?lang=${selectedLang}`)
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`)
        }
        
        const data = await res.json()
        const prayer = data.prayer || null
        
        if (prayer) {
          // Cache the prayer for future use
          await cachePrayer(prayer, selectedLang)
          
          // Update cache stats
          const stats = await getCacheStats()
          setCacheStats(stats)
        }
        
        return prayer
      } catch (networkError) {
        console.warn('Failed to fetch prayer from API, checking cache again:', networkError)
        
        // Try cache one more time in case it was just added
        const cachedPrayer = await getCachedPrayer(slug, selectedLang)
        if (cachedPrayer) {
          const prayerEntry: PrayerEntry = {
            sys: cachedPrayer.sys,
            fields: {
              title: cachedPrayer.title,
              slug: cachedPrayer.slug,
              body: cachedPrayer.body
            },
            metadata: cachedPrayer.metadata || {}
          } as unknown as PrayerEntry;
          return prayerEntry
        }
        
        throw networkError
      }
    } catch (error) {
      console.error('Error fetching prayer:', error)
      
      // Final fallback: look in current filteredPrayers again
      const prayerFromList = filteredPrayers.find(p => {
        const prayerSlug = typeof p.fields.slug === 'string' ? p.fields.slug : String(p.fields.slug)
        return cleanUrlSlug(prayerSlug) === cleanUrlSlug(slug)
      })
      
      if (prayerFromList) {
        return prayerFromList
      }
      
      // Fallback to cache if network fails
      const cachedPrayer = await getCachedPrayer(slug, selectedLang)
      if (cachedPrayer) {
        const prayerEntry: PrayerEntry = {
          sys: cachedPrayer.sys,
          fields: {
            title: cachedPrayer.title,
            slug: cachedPrayer.slug,
            body: cachedPrayer.body
          },
          metadata: cachedPrayer.metadata || {}
        } as unknown as PrayerEntry;
        return prayerEntry
      }
      
      return null
    }
  }, [selectedLang, filteredPrayers])

  const handleBack = useCallback((pushToHistory: boolean = true) => {
    if (isAnimating) return
    setIsAnimating(true)
    setCurrentView('home')
    if (pushToHistory && typeof window !== 'undefined') {
      window.history.pushState({ view: 'home', lang: selectedLang }, '', '/')
    }
    setTimeout(() => {
      setSelectedPrayer(null)
      setIsAnimating(false)
    }, 300)
  }, [isAnimating, selectedLang])

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      // Handle language changes from URL
      if (event.state?.lang && event.state.lang !== selectedLang) {
        setSelectedLang(event.state.lang)
      }
      
      if (event.state?.view === 'prayer' && event.state?.prayerSlug) {
        // Navigate to prayer view
        const prayerSlug = event.state.prayerSlug
        fetchPrayerContent(prayerSlug).then((prayer) => {
          if (prayer) {
            // Immediate scroll to top when navigating via browser back/forward
            window.scrollTo({ top: 0, behavior: 'instant' })
            setSelectedPrayer(prayer)
            setCurrentView('prayer')
          }
        })
      } else {
        // Navigate back to home
        handleBack(false) // false = don't push to history
      }
    }

    // Set initial history state
    if (typeof window !== 'undefined' && !window.history.state) {
      window.history.replaceState({ view: 'home', lang: selectedLang }, '', '/')
    }

    window.addEventListener('popstate', handlePopState)
    
    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [selectedLang, fetchPrayerContent, handleBack])

  const handleClick = async (slug: string) => {
    if (isAnimating) return
    setIsAnimating(true)
    setErrorMessage('') // Clear any previous errors
    
    try {
      const prayer = await fetchPrayerContent(slug)
      if (prayer) {
        setSelectedPrayer(prayer)
        setCurrentView('prayer')
        const originalSlug = typeof prayer.fields.slug === 'string' ? prayer.fields.slug : String(prayer.fields.slug)
        const urlSlug = cleanUrlSlug(originalSlug)
        window.history.pushState(
          { view: 'prayer', prayerSlug: slug, lang: selectedLang }, 
          '', 
          `/${urlSlug}`
        )
        setTimeout(() => {
          window.scrollTo({ top: 0, behavior: 'instant' })
        }, 100)
      } else {
        // Show error feedback to user
        console.error('Prayer not found:', slug)
        // Check if we're offline and have some cached content before showing error
        const isOffline = !navigator.onLine
        if (isOffline && filteredPrayers.length > 0) {
          setErrorMessage('This prayer is not downloaded yet. Please browse available prayers or connect to internet to download more.')
        } else {
          setErrorMessage('This prayer is not available offline. Please connect to the internet and try again.')
        }
        setTimeout(() => setErrorMessage(''), 5000) // Clear after 5 seconds
      }
    } catch (error) {
      console.error('Error loading prayer:', error)
      setErrorMessage('Failed to load prayer. Please check your connection and try again.')
      setTimeout(() => setErrorMessage(''), 5000) // Clear after 5 seconds
    }
    
    setTimeout(() => setIsAnimating(false), 300)
  }

  const generateFallbackTagName = (tagId: string): string => {
    const tagNameMap: { [key: string]: string } = {
      'obligatory-prayers': 'The Obligatory Prayers',
      'general-prayers': 'General Prayers',
      'morning-prayers': 'Morning Prayers',
      'evening-prayers': 'Evening Prayers',
      'daily-prayers': 'Daily Prayers',
      'special-prayers': 'Special Prayers',
      'healing-prayers': 'Healing Prayers',
      'protection-prayers': 'Protection Prayers',
      'spiritual-development': 'Spiritual Development',
      'devotional-prayers': 'Devotional Prayers',
      'obligatory': 'The Obligatory Prayers',
      'general': 'General Prayers',
      'morning': 'Morning Prayers',
      'evening': 'Evening Prayers',
      'daily': 'Daily Prayers',
      'special': 'Special Prayers',
      'healing': 'Healing Prayers',
      'protection': 'Protection Prayers',
      'generalPrayers': 'General Prayers',
      'theObligatoryPrayers': 'The Obligatory Prayers',
      'obligatoryPrayers': 'The Obligatory Prayers',
      'specialPrayers': 'Special Prayers',
      'morningPrayers': 'Morning Prayers',
      'eveningPrayers': 'Evening Prayers',
      'healingPrayers': 'Healing Prayers',
      'protectionPrayers': 'Protection Prayers',
    };
    return tagNameMap[tagId] || tagId
      .split(/[-_]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  const groupedPrayers: GroupedPrayers = useMemo(() => {
    // Add safety checks for all dependencies
    if (!tagNames || typeof tagNames !== 'object' || Object.keys(tagNames).length === 0) {
      return {};
    }
    
    if (!filteredPrayers || !Array.isArray(filteredPrayers)) {
      return {};
    }
    
    return filteredPrayers.reduce((acc, prayer) => {
      // Additional safety checks for each prayer
      if (!prayer || !prayer.metadata) {
        return acc;
      }
      
      const tags = prayer.metadata?.tags || []
      if (!Array.isArray(tags) || tags.length === 0) {
        if (!acc['Other']) acc['Other'] = []
        acc['Other'].push(prayer)
      } else {
        tags.forEach((tag) => {
          if (!tag || !tag.sys) {
            return; // Skip invalid tags
          }
          
          const tagId = tag.sys?.id || 'Other'
          let displayName = tagNames[tagId]
          if (!displayName || displayName === tagId) {
            displayName = generateFallbackTagName(tagId)
          }
          if (!acc[displayName]) acc[displayName] = []
          acc[displayName].push(prayer)
        })
      }
      return acc
    }, {} as GroupedPrayers)
  }, [filteredPrayers, tagNames])

  const obligatory = Object.keys(groupedPrayers).find(
    name => name.toLowerCase().includes('obligatory')
  )
  const general = Object.keys(groupedPrayers).find(
    name => name.toLowerCase().includes('general')
  )
  const other = Object.keys(groupedPrayers).find(
    name => name.toLowerCase() === 'other'
  )
  const rest = Object.keys(groupedPrayers)
    .filter(
      name => name !== obligatory && name !== general && name !== other
    )
    .sort((a, b) => a.localeCompare(b))
  const orderedSections = [
    obligatory,
    general,
    ...rest,
    other
  ].filter((name): name is string => typeof name === 'string' && Boolean(name) && name.trim().length > 0)

  return (
    <>
      <Head>
        <title>Prayers</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/favicon.webp" />
        <meta name="theme-color" content="#317EFB" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Prayer App" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="format-detection" content="telephone=no" />
      </Head>

      <OfflineIndicator showOnlineMessage={true} />

      <div className="container">
        <div className={`page-container ${currentView === 'prayer' ? 'slide-left' : ''}`}>
          {/* Homepage View */}
          <div className="page-view">
            <header className="header">
              <div className="header-content">
                <div className="title">Prayers</div>
                <div className="header-controls">
                  <InstallPrompt onDownloadComplete={() => {
                    // Refresh cache stats after download
                    getCacheStats().then(stats => setCacheStats(stats));
                  }} />
                  <LanguageToggle
                    languages={[{ code: 'en', name: 'English' }, { code: 'hi', name: 'हिन्दी' }, { code: 'gu', name: 'ગુજરાતી' }]}
                    currentLang={selectedLang}
                    onChange={setSelectedLang}
                  />
                  {!isOnline && (
                    <div className="offline-status" title="You are offline">
                      🔴
                    </div>
                  )}
                  {cacheStats.totalPrayers > 0 && (
                    <div className="cache-status" title={`Cached: ${cacheStats.totalPrayers} prayers in ${cacheStats.languages.length} languages. Size: ${formatBytes(cacheStats.size)}${cacheStats.lastSync ? `. Last sync: ${new Date(cacheStats.lastSync).toLocaleString()}` : ''}`}>
                      <span className="cache-icon">💾</span>
                      <span className="cache-count">{cacheStats.totalPrayers}</span>
                      <span className="cache-size">({formatBytes(cacheStats.size)})</span>
                    </div>
                  )}
                </div>           
              </div>
            </header>

            {errorMessage && (
              <div className="error-toast" style={{ 
                padding: '12px 24px', 
                background: '#fee2e2', 
                color: '#dc2626', 
                borderLeft: '4px solid #ef4444',
                margin: '0 24px 16px',
                borderRadius: '4px',
                fontSize: '14px'
              }}>
                {errorMessage}
              </div>
            )}

            <main className="homepage">
              {hasError ? (
                <div className="error-message" style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
                  {!navigator.onLine ? (
                    <div>
                      <p>You&apos;re currently offline.</p>
                      <p>Some prayers may not be available yet. Use the download button to save content for offline use.</p>
                    </div>
                  ) : (
                    <p>Unable to load prayers. Please check your internet connection and try again.</p>
                  )}
                  <button onClick={() => {
                    setHasError(false)
                    window.location.reload()
                  }} style={{ 
                    padding: '0.5rem 1rem', 
                    backgroundColor: '#317EFB', 
                    color: 'white', 
                    border: 'none', 
                    borderRadius: '4px',
                    cursor: 'pointer',
                    marginTop: '1rem'
                  }}>
                    Retry
                  </button>
                </div>
              ) : (
                (orderedSections && Array.isArray(orderedSections) ? orderedSections : []).map((sectionName) => (
                  <section key={sectionName} className="prayer-section">
                    <h2 className="section-title">{sectionName}</h2>
                    <div className="post-list">
                      {(groupedPrayers[sectionName] || []).map((p: PrayerEntry) => (
                      <div
                        key={p.sys.id}
                        className="post-item"
                        onClick={() => {
                          if (typeof p.fields.slug === 'string') {
                            handleClick(p.fields.slug)
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && typeof p.fields.slug === 'string') {
                            handleClick(p.fields.slug)
                          }
                        }}
                      >
                        <h3>{typeof p.fields.title === 'string' ? p.fields.title : 'Untitled'}</h3>
                      </div>
                    ))}
                  </div>
                </section>
              ))
              )}
            </main>
            <footer className="footer">
              <p>&copy; {new Date().getFullYear()} Prayer App. All rights reserved.</p>
            </footer>
          </div>

          {/* Prayer Detail View */}
          <div className="page-view">
            {selectedPrayer && (
              <>
                <header className="header">
                  <div className="header-content">
                    <button className="back-btn" onClick={() => handleBack()}>
                      ← Back
                    </button>
                    <div className="title">
                      {typeof selectedPrayer.fields.title === 'string'
                        ? selectedPrayer.fields.title
                        : 'Prayer'}
                    </div>          
                  </div>
                </header>

                <main className="single-post" style={{ display: 'block' }}>
                  <article className="post-content">
                    <h1>
                      {typeof selectedPrayer.fields.title === 'string'
                        ? selectedPrayer.fields.title
                        : 'Prayer'}
                    </h1>
                    <div className="content">
                      {(() => {
                        let body = selectedPrayer?.fields?.body
                        
                        if (!body) {
                          return <p>No content available for this prayer.</p>
                        }
                        
                        // Handle both string (from cache) and object (from API) formats
                        if (typeof body === 'string') {
                          try {
                            body = JSON.parse(body)
                          } catch (parseError) {
                            console.error('Failed to parse body JSON:', parseError)
                            return <p>Content format is corrupted.</p>
                          }
                        }
                        
                        if (typeof body !== 'object' || !body) {
                          return <p>Content format is not supported.</p>
                        }
                        
                        try {
                          return documentToReactComponents(body as Document, richTextOptions)
                        } catch (error) {
                          console.error('Error rendering prayer content:', error)
                          return <p>Unable to display prayer content. Please try again.</p>
                        }
                      })()}
                    </div>
                  </article>
                </main>
                <footer className="footer">
                  <p>&copy; {new Date().getFullYear()} Prayer App. All rights reserved.</p>
                </footer>
              </>
            )}
          </div>
        </div>
        <ThemeToggle className="theme-toggle-fixed" />
      </div>
    </>
  )
}
