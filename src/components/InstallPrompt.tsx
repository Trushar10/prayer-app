import React, { useState, useEffect } from 'react';
import offlineService from '../services/offlineService';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface InstallPromptProps {
  onDownloadComplete?: () => void;
}

const InstallPrompt: React.FC<InstallPromptProps> = ({ onDownloadComplete }) => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowInstall(true);
    };

    const checkIfInstalled = () => {
      // Check if app is already installed
      const isInStandaloneMode = window.matchMedia('(display-mode: standalone)').matches;
      const isIOSInstalled = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
      setIsInstalled(isInStandaloneMode || isIOSInstalled);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setShowInstall(false);
    });

    checkIfInstalled();

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const downloadOfflineContent = async () => {
    setIsDownloading(true);
    setDownloadProgress(0);
    
    try {
      await offlineService.downloadAllContent((progress) => {
        setDownloadProgress(progress);
      });
      
      // Call callback if provided
      onDownloadComplete?.();
      
    } catch (error) {
      console.error('Error downloading offline content:', error);
      // Don't prevent installation if download fails
    }
    
    setIsDownloading(false);
    setDownloadProgress(0);
  };

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    try {
      // Show install prompt immediately to preserve user gesture
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
        setShowInstall(false);
        
        // Download offline content after successful installation
        await downloadOfflineContent();
      }
    } catch (error) {
      console.error('Error showing install prompt:', error);
    }
  };

  // Show download button for already installed apps, or install+download for new users
  if (isInstalled) {
    return (
      <button
        onClick={downloadOfflineContent}
        disabled={isDownloading}
        className="download-btn"
        title={isDownloading ? `Downloading content... ${downloadProgress}%` : 'Download content for offline use'}
        style={{
          padding: '8px 12px',
          backgroundColor: isDownloading ? '#6c757d' : '#28a745',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: isDownloading ? 'not-allowed' : 'pointer',
          fontSize: '14px',
          fontWeight: '500',
          position: 'relative',
          minWidth: isDownloading ? '120px' : '100px',
          overflow: 'hidden',
          transition: 'all 0.2s ease'
        }}
      >
        {isDownloading ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span 
              style={{ 
                width: '12px', 
                height: '12px', 
                border: '2px solid transparent',
                borderTop: '2px solid white',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }} 
            />
            {downloadProgress}%
          </span>
        ) : (
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            � Download
          </span>
        )}
        
        {isDownloading && (
          <div 
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              height: '2px',
              backgroundColor: 'rgba(255, 255, 255, 0.3)',
              width: `${downloadProgress}%`,
              transition: 'width 0.3s ease'
            }}
          />
        )}
        
        <style jsx>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </button>
    );
  }

  // Don't show if no install prompt available
  if (!showInstall) return null;

  return (
    <button
      onClick={handleInstallClick}
      disabled={isDownloading}
      className="install-btn"
      title="Install app to home screen"
      style={{
        padding: '8px 12px',
        backgroundColor: '#007bff',
        color: 'white',
        border: 'none',
        borderRadius: '6px',
        cursor: 'pointer',
        fontSize: '14px',
        fontWeight: '500',
        transition: 'all 0.2s ease'
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        📱 Install
      </span>
    </button>
  );
};

export default InstallPrompt;
