import React, { useState, useEffect } from 'react';
import { contentDownloader } from '../services/contentDownloader';

interface DownloadState {
  isDownloading: boolean;
  percentage: number;
  current: number;
  total: number;
}

const ContentDownloadIndicator: React.FC = () => {
  const [downloadState, setDownloadState] = useState<DownloadState>({
    isDownloading: false,
    percentage: 0,
    current: 0,
    total: 0
  });
  const [showIndicator, setShowIndicator] = useState(false);
  const [isContentCached, setIsContentCached] = useState(false);

  useEffect(() => {
    // Check if content is already cached on mount
    const checkCacheStatus = async () => {
      try {
        const cached = await contentDownloader.isContentCachedClientSide();
        setIsContentCached(cached);
      } catch (error) {
        console.error('Failed to check cache status:', error);
      }
    };

    checkCacheStatus();

    // Update progress every second during download
    const progressInterval = setInterval(() => {
      const progress = contentDownloader.getProgress();
      setDownloadState(progress);
      setShowIndicator(progress.isDownloading || progress.percentage > 0);
    }, 1000);

    // Listen for download completion
    const handleDownloadComplete = () => {
      setIsContentCached(true);
      setTimeout(() => setShowIndicator(false), 3000); // Hide after 3 seconds
    };

    const handleDownloadError = (event: CustomEvent) => {
      console.error('Content download error:', event.detail.error);
      setTimeout(() => setShowIndicator(false), 5000); // Hide after 5 seconds on error
    };

    window.addEventListener('contentDownloadComplete', handleDownloadComplete as EventListener);
    window.addEventListener('contentDownloadError', handleDownloadError as EventListener);

    return () => {
      clearInterval(progressInterval);
      window.removeEventListener('contentDownloadComplete', handleDownloadComplete as EventListener);
      window.removeEventListener('contentDownloadError', handleDownloadError as EventListener);
    };
  }, []);

  if (!showIndicator && isContentCached) {
    return null; // Don't show anything if content is cached and not downloading
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        background: 'rgba(255, 255, 255, 0.95)',
        border: '1px solid #e0e0e0',
        borderRadius: '8px',
        padding: '12px 16px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        zIndex: 1000,
        fontSize: '14px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        maxWidth: '280px',
        backdropFilter: 'blur(10px)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <div style={{
          width: '16px',
          height: '16px',
          border: '2px solid #317EFB',
          borderTop: '2px solid transparent',
          borderRadius: '50%',
          animation: downloadState.isDownloading ? 'spin 1s linear infinite' : 'none'
        }} />
        <span style={{ fontWeight: '500', color: '#333' }}>
          {downloadState.isDownloading ? 'Downloading Content' : isContentCached ? 'Content Ready Offline' : 'Checking Cache...'}
        </span>
      </div>

      {downloadState.isDownloading && (
        <div style={{ marginBottom: '8px' }}>
          <div style={{
            width: '100%',
            height: '4px',
            background: '#e0e0e0',
            borderRadius: '2px',
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${downloadState.percentage}%`,
              height: '100%',
              background: '#317EFB',
              transition: 'width 0.3s ease'
            }} />
          </div>
          <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
            {downloadState.percentage}% complete ({downloadState.current}/{downloadState.total})
          </div>
        </div>
      )}

      <div style={{ fontSize: '12px', color: '#666' }}>
        {downloadState.isDownloading
          ? 'Downloading prayers for offline use...'
          : isContentCached
            ? '✅ All content available offline'
            : 'Preparing offline content...'
        }
      </div>

      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default ContentDownloadIndicator;
