import '../styles/prayers.css'
import type { AppProps } from 'next/app'
import { Rasa } from 'next/font/google'
import { SpeedInsights } from "@vercel/speed-insights/next"
import { useEffect } from 'react'
import { warmupServiceWorker } from '@/services/swWarmup'
import { contentDownloader } from '@/services/contentDownloader'
import DebugPanel from '../components/DebugPanel'
import OfflineIndicator from '../components/OfflineIndicator'
import ContentDownloadIndicator from '../components/ContentDownloadIndicator'

const rasa = Rasa({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-rasa',
  display: 'swap',
})

export default function App({ Component, pageProps }: AppProps) {
  useEffect(() => {
    let heartbeat: NodeJS.Timeout | undefined;
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      // Expose simple debug object
  window.__SW_DEBUG = { attempts: 0, lastError: null, status: 'init' };

  const attemptRegistration = async (): Promise<ServiceWorkerRegistration | null> => {
  if (window.__SW_DEBUG) window.__SW_DEBUG.attempts++;
    try {
      console.log('[SW] Attempting registration...');
      
      // Try main service worker first
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      console.log('[SW] Main SW registered successfully:', registration);
      
      if (window.__SW_DEBUG) window.__SW_DEBUG.status = 'registered';
      
      // Wait for the SW to be ready
      await navigator.serviceWorker.ready;
      console.log('[SW] SW is ready and controlling:', navigator.serviceWorker.controller);
      
      return registration;
    } catch (err) {
      console.error('[SW] Main SW registration failed:', (err as Error).message);
      
      if (window.__SW_DEBUG) {
        window.__SW_DEBUG.lastError = (err as Error).message;
        window.__SW_DEBUG.status = 'error';
      }
      return null;
    }
  };

  const registerWithRetries = async () => {
    console.log('[SW] Starting registration process...');
    
    let registration: ServiceWorkerRegistration | null = null;
    for (let i = 0; i < 3 && !registration; i++) {
      console.log(`[SW] Registration attempt ${i + 1}/3`);
      registration = await attemptRegistration();
      if (!registration) {
        console.log(`[SW] Attempt ${i + 1} failed, waiting before retry...`);
        await new Promise(r => setTimeout(r, 1000 * (i + 1))); // backoff
      }
    }
    
    if (!registration) {
      console.error('[SW] All registration attempts failed. Debug:', window.__SW_DEBUG);
    } else {
      console.log('[SW] Registration successful after', window.__SW_DEBUG?.attempts, 'attempt(s)');
      
      // Start content download after SW is ready
      navigator.serviceWorker.ready.then(async () => {
        console.log('[SW] SW ready - starting content download...');
        try {
          await contentDownloader.downloadAllContent();
        } catch (error) {
          console.error('[SW] Content download failed:', error);
        }
      });
    }
  };

      // If already controlled, skip
      // Controller change -> reload once to get SW control on initial install
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!reloaded) {
          reloaded = true;
          console.log('[SW] controllerchange -> reloading to allow full offline control');
          setTimeout(() => window.location.reload(), 50);
        }
      });

      const ensureRegistered = () => {
        if (navigator.serviceWorker.controller) {
          console.log('[SW] Existing controller detected, starting content download...');
          navigator.serviceWorker.ready.then(async () => {
            try {
              await contentDownloader.downloadAllContent();
            } catch (error) {
              console.error('[SW] Content download failed:', error);
            }
          });
          return;
        }
        
        // Start registration
        registerWithRetries();
      };

      // Force registration immediately
      ensureRegistered();

      // Add heartbeat to check SW status every 30 seconds
      heartbeat = setInterval(() => {
        const controller = navigator.serviceWorker.controller;
        console.log('[SW] Heartbeat - Controller:', controller ? 'active' : 'none');
        
        if (!controller) {
          console.log('[SW] No controller, checking registration status...');
          navigator.serviceWorker.getRegistration().then(registration => {
            if (registration) {
              console.log('[SW] Registration exists but no controller, state:', registration.active?.state);
            } else {
              console.log('[SW] No registration found, attempting re-registration...');
              ensureRegistered();
            }
          });
        }
      }, 30000);

      // Add service worker state change listeners
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('[SW] Controller changed, new controller:', navigator.serviceWorker.controller);
        if (window.__SW_DEBUG) {
          window.__SW_DEBUG.status = navigator.serviceWorker.controller ? 'controlled' : 'uncontrolled';
        }
      });

      navigator.serviceWorker.addEventListener('message', (event) => {
        console.log('[SW] Message from SW:', event.data);
      });
      const handleOnlineStatus = () => {
        const isOnline = navigator.onLine;
        console.log('[SW] Network status changed:', isOnline ? 'online' : 'offline');
        if (isOnline && !navigator.serviceWorker.controller) {
          console.log('[SW] Came back online, checking SW registration');
          ensureRegistered();
        }
      };

      window.addEventListener('online', handleOnlineStatus);
      window.addEventListener('offline', handleOnlineStatus);
    }

    // Global error handler for uncaught exceptions
    const handleGlobalError = (event: ErrorEvent) => {
      console.error('Global error caught:', event.error);
      console.error('Error message:', event.message);
      console.error('Error filename:', event.filename);
      console.error('Error line:', event.lineno);
      console.error('Error column:', event.colno);
      
      // Prevent the error from crashing the app
      event.preventDefault();
      return true;
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('Unhandled promise rejection:', event.reason);
      
      // Prevent the error from crashing the app
      event.preventDefault();
    };

    window.addEventListener('error', handleGlobalError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      if (heartbeat) clearInterval(heartbeat);
      window.removeEventListener('error', handleGlobalError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  return (
    <main className={rasa.className}>
      <Component {...pageProps} />
      <SpeedInsights />
      <DebugPanel />
      <OfflineIndicator />
      <ContentDownloadIndicator />
    </main>
  )
}
