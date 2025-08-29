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
    // Register service worker for PWA functionality
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      // Try to register via window.workbox first, then fallback to manual registration
      const registerSW = async () => {
        try {
          const windowWithWorkbox = window as unknown as { workbox?: { register(): Promise<ServiceWorkerRegistration> } };
          if (windowWithWorkbox.workbox?.register) {
            const registration = await windowWithWorkbox.workbox.register();
            console.log('Service Worker registered via workbox:', registration);
          } else {
            // Fallback to manual registration
            const registration = await navigator.serviceWorker.register('/sw.js', {
              scope: '/'
            });
            console.log('Service Worker registered manually:', registration);
          }
        } catch (error) {
          console.error('Service Worker registration failed:', error);
        }
      };

      registerSW();
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
