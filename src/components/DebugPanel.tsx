import { useEffect, useState } from 'react';

interface DebugInfo {
  isOnline: boolean;
  serviceWorkerStatus: string;
  cacheStatus: string[];
  themeStatus: string;
  registrationError?: string;
  controller?: boolean;
  swAttempts?: number;
  swLastError?: string | null;
}

export default function DebugPanel() {
  const [debugInfo, setDebugInfo] = useState<DebugInfo>({
    isOnline: true,
    serviceWorkerStatus: 'Unknown',
    cacheStatus: [],
    themeStatus: 'Unknown',
    registrationError: undefined
  });

  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
    const updateDebugInfo = async () => {
      const info: DebugInfo = {
        isOnline: navigator.onLine,
        serviceWorkerStatus: 'Not supported',
        cacheStatus: [],
        themeStatus: document.documentElement.getAttribute('data-theme') || 'not set',
        registrationError: undefined,
        controller: !!navigator.serviceWorker?.controller,
  swAttempts: window.__SW_DEBUG?.attempts,
  swLastError: window.__SW_DEBUG?.lastError
      };

      // Check service worker
      if ('serviceWorker' in navigator) {
        try {
          const registration = await navigator.serviceWorker.getRegistration();
          if (registration) {
            if (registration.active) {
              info.serviceWorkerStatus = 'Active ✅';
            } else if (registration.installing) {
              info.serviceWorkerStatus = 'Installing ⏳';
            } else if (registration.waiting) {
              info.serviceWorkerStatus = 'Waiting 🔄';
            } else {
              info.serviceWorkerStatus = 'Registered but inactive';
            }
          } else {
            info.serviceWorkerStatus = 'Not registered ❌';
          }
        } catch (error) {
          info.serviceWorkerStatus = 'Registration failed ❌';
          info.registrationError = error instanceof Error ? error.message : 'Unknown error';
        }
      }

      // Check cache
      if ('caches' in window) {
        try {
          const cacheNames = await caches.keys();
          info.cacheStatus = cacheNames;
  } catch (_err) {
          info.cacheStatus = ['Error accessing caches'];
        }
      }

      setDebugInfo(info);
    };

    updateDebugInfo();
    const interval = setInterval(updateDebugInfo, 2000);

    return () => clearInterval(interval);
  }, []);

  if (!showDebug) {
    return (
      <button 
        onClick={() => setShowDebug(true)}
        style={{
          position: 'fixed',
          bottom: '10px',
          right: '10px',
          background: '#007bff',
          color: 'white',
          border: 'none',
          padding: '8px 12px',
          borderRadius: '4px',
          fontSize: '12px',
          cursor: 'pointer',
          zIndex: 1000
        }}
      >
        Debug
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: '10px',
      right: '10px',
      background: 'rgba(0, 0, 0, 0.9)',
      color: 'white',
      padding: '15px',
      borderRadius: '8px',
      fontSize: '12px',
      maxWidth: '300px',
      zIndex: 1000,
      fontFamily: 'monospace'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <strong>Debug Info</strong>
        <button 
          onClick={() => setShowDebug(false)}
          style={{
            background: 'transparent',
            border: '1px solid white',
            color: 'white',
            padding: '2px 6px',
            borderRadius: '3px',
            cursor: 'pointer'
          }}
        >
          ×
        </button>
      </div>
      
      <div><strong>Online:</strong> {debugInfo.isOnline ? '✅' : '❌'}</div>
      <div><strong>SW:</strong> {debugInfo.serviceWorkerStatus}</div>
      <div><strong>Controller:</strong> {debugInfo.controller ? 'Yes' : 'No'}</div>
      {typeof debugInfo.swAttempts === 'number' && (
        <div><strong>Attempts:</strong> {debugInfo.swAttempts}</div>
      )}
      {debugInfo.swLastError && (
        <div style={{ color: '#ffb347', fontSize: '10px' }}>Last Error: {debugInfo.swLastError}</div>
      )}
      {debugInfo.registrationError && (
        <div style={{ color: '#ff6b6b', fontSize: '10px' }}>
          <strong>Error:</strong> {debugInfo.registrationError}
        </div>
      )}
      <div><strong>Theme:</strong> {debugInfo.themeStatus}</div>
      <div><strong>Caches ({debugInfo.cacheStatus.length}):</strong></div>
      <div style={{ maxHeight: '100px', overflow: 'auto', marginLeft: '10px' }}>
        {debugInfo.cacheStatus.map((cache, index) => (
          <div key={index} style={{ fontSize: '10px' }}>{cache}</div>
        ))}
      </div>
      
      <div style={{ marginTop: '10px' }}>
        <button
          onClick={() => window.location.reload()}
          style={{
            background: '#28a745',
            color: 'white',
            border: 'none',
            padding: '5px 10px',
            borderRadius: '3px',
            cursor: 'pointer',
            marginRight: '5px',
            fontSize: '10px'
          }}
        >
          Reload
        </button>
        <button
          onClick={async () => {
            try {
              // First check if SW file is accessible
              const swResponse = await fetch('/sw.js');
              console.log('SW file fetch response:', swResponse.status, swResponse.statusText);
              
              if (!swResponse.ok) {
                alert(`SW file not accessible: ${swResponse.status} ${swResponse.statusText}`);
                return;
              }
              
              const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
              console.log('Manual SW registration successful:', registration);
              alert('SW registration successful! Check console for details.');
            } catch (error) {
              console.error('Manual SW registration failed:', error);
              alert('SW registration failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
            }
          }}
          style={{
            background: '#007bff',
            color: 'white',
            border: 'none',
            padding: '5px 10px',
            borderRadius: '3px',
            cursor: 'pointer',
            marginRight: '5px',
            fontSize: '10px'
          }}
        >
          Test SW
        </button>
        <button
          onClick={async () => {
            const cacheNames = await caches.keys();
            for (const name of cacheNames) {
              await caches.delete(name);
            }
            window.location.reload();
          }}
          style={{
            background: '#dc3545',
            color: 'white',
            border: 'none',
            padding: '5px 10px',
            borderRadius: '3px',
            cursor: 'pointer',
            fontSize: '10px'
          }}
        >
          Clear Cache
        </button>
      </div>
    </div>
  );
}
