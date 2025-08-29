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
          // Confirm file is actually reachable before calling register
            const swResp = await fetch('/sw.js?cacheBust=' + Date.now(), { method: 'GET' });
            if (!swResp.ok) {
              throw new Error('sw.js not reachable. HTTP ' + swResp.status);
            }
          const windowWithWorkbox = window as unknown as { workbox?: { register: () => Promise<ServiceWorkerRegistration> } };
          let registration: ServiceWorkerRegistration;
          if (windowWithWorkbox.workbox) {
            console.log('[SW] Using workbox.register()');
            registration = await windowWithWorkbox.workbox.register();
          } else {
            console.log('[SW] Using navigator.serviceWorker.register("/sw.js")');
            registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
          }
          console.log('[SW] Registration object:', registration);
          if (window.__SW_DEBUG) window.__SW_DEBUG.status = 'registered';
          // Attach update diagnostics
          registration.addEventListener('updatefound', () => {
            const nw = registration.installing;
            console.log('[SW] updatefound, installing state:', nw?.state);
            nw?.addEventListener('statechange', () => {
              console.log('[SW] installing statechange ->', nw.state);
            });
          });
          return registration;
        } catch (err) {
          console.warn('[SW] Main SW failed, trying simple fallback:', (err as Error).message);
          try {
            // Fallback to simple service worker
            const simpleRegistration = await navigator.serviceWorker.register('/sw-simple.js', { scope: '/' });
            console.log('[SW] Simple SW registered successfully');
            if (window.__SW_DEBUG) window.__SW_DEBUG.status = 'registered-simple';
            return simpleRegistration;
          } catch (simpleErr) {
            if (window.__SW_DEBUG) {
              window.__SW_DEBUG.lastError = (simpleErr as Error).message;
              window.__SW_DEBUG.status = 'error';
            }
            console.warn('[SW] Simple SW also failed:', simpleErr);
            return null;
          }
        }
      };

      const registerWithRetries = async () => {
        // Wait for window load to avoid race with Next.js client chunks
        if (document.readyState !== 'complete') {
          await new Promise<void>(res => window.addEventListener('load', () => res(), { once: true }));
        }
        // Small delay to ensure sw.js copied / served
        await new Promise(r => setTimeout(r, 150));
        let registration: ServiceWorkerRegistration | null = null;
        for (let i = 0; i < 3 && !registration; i++) {
          registration = await attemptRegistration();
          if (!registration) {
            await new Promise(r => setTimeout(r, 500 * (i + 1))); // backoff
          }
        }
        if (!registration) {
          console.error('[SW] Failed to register after retries. Debug:', window.__SW_DEBUG);
        } else {
          console.log('[SW] Registered successfully after', window.__SW_DEBUG?.attempts, 'attempt(s)');
          // Warmup after ready
          navigator.serviceWorker.ready.then(async () => {
            console.log('[SW] ready - initiating warmup');
            await warmupServiceWorker();
            
            // Start automatic content download after SW is ready
            console.log('[SW] Starting automatic content download...');
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
          console.log('[SW] Existing controller detected');
          navigator.serviceWorker.ready.then(async () => {
            await warmupServiceWorker();
            
            // Start automatic content download for existing controller
            console.log('[SW] Starting automatic content download for existing controller...');
            try {
              await contentDownloader.downloadAllContent();
            } catch (error) {
              console.error('[SW] Content download failed:', error);
            }
          });
          return;
        }
        registerWithRetries();
        // Fallback retry after 5s if still no controller
        setTimeout(() => {
          if (!navigator.serviceWorker.controller) {
            console.warn('[SW] No controller after initial attempts, retrying registration');
            registerWithRetries();
          }
        }, 5000);
      };

      // Force registration immediately
      ensureRegistered();

      // Add heartbeat to check SW status every 10 seconds
      heartbeat = setInterval(() => {
        if (!navigator.serviceWorker.controller) {
          console.warn('[SW] No controller detected, attempting re-registration');
          ensureRegistered();
        }
      }, 10000);

      // Add offline/online detection
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
