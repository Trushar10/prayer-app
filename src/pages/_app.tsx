import '../styles/prayers.css'
import type { AppProps } from 'next/app'
import { Rasa } from 'next/font/google'
import { SpeedInsights } from "@vercel/speed-insights/next"
import { useEffect } from 'react'

const rasa = Rasa({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-rasa',
  display: 'swap',
})

export default function App({ Component, pageProps }: AppProps) {
  useEffect(() => {
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
          if (window.__SW_DEBUG) {
            window.__SW_DEBUG.lastError = (err as Error).message;
            window.__SW_DEBUG.status = 'error';
          }
          console.warn('[SW] Registration attempt failed:', err);
          return null;
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
        }
      };

      // If already controlled, skip
      if (navigator.serviceWorker.controller) {
        console.log('[SW] Existing controller detected, skipping re-registration');
      } else {
        registerWithRetries();
      }
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
      window.removeEventListener('error', handleGlobalError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  return (
    <main className={rasa.className}>
      <Component {...pageProps} />
      <SpeedInsights />
    </main>
  )
}
