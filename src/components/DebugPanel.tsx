import { useEffect, useState } from 'react';

interface DebugInfo {
  isOnline: boolean;
  serviceWorkerStatus: string;
  cacheStatus: string[];
  themeStatus: string;
}

export default function DebugPanel() {
  const [debugInfo, setDebugInfo] = useState<DebugInfo>({
    isOnline: true,
    serviceWorkerStatus: 'Unknown',
    cacheStatus: [],
    themeStatus: 'Unknown'
  });

  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
    const updateDebugInfo = async () => {
      const info: DebugInfo = {
        isOnline: navigator.onLine,
        serviceWorkerStatus: 'Not supported',
        cacheStatus: [],
        themeStatus: document.documentElement.getAttribute('data-theme') || 'not set'
      };

      // Check service worker
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
          info.serviceWorkerStatus = registration.active ? 'Active' : 'Installing';
        } else {
          info.serviceWorkerStatus = 'Not registered';
        }
      }

      // Check cache
      if ('caches' in window) {
        try {
          const cacheNames = await caches.keys();
          info.cacheStatus = cacheNames;
        } catch (err) {
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
            marginRight: '5px'
          }}
        >
          Reload
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
            cursor: 'pointer'
          }}
        >
          Clear Cache
        </button>
      </div>
    </div>
  );
}
