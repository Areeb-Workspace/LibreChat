import React, { memo, useMemo, useState, useRef } from 'react';
import { apiBaseUrl } from 'librechat-data-provider';
import { cn } from '~/utils';
import { useLocalize } from '~/hooks';

const VIDEO_EXTENSIONS = /\.(mp4|webm|ogv|mov|m4v|3gp)(\?.*)?$/i;

/** Checks whether a URL points to a video file by extension */
export const isVideoUrl = (url?: string): boolean => {
  if (!url) {
    return false;
  }
  return VIDEO_EXTENSIONS.test(url);
};

type VideoPlayerProps = {
  src: string;
  alt?: string;
};

const VideoPlayer = memo(function VideoPlayer({ src, alt }: VideoPlayerProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const localize = useLocalize();

  const absoluteVideoUrl = useMemo(() => {
    if (!src) {
      return src;
    }
    if (src.startsWith('http') || src.startsWith('data:') || !src.startsWith('/images/')) {
      return src;
    }
    const baseURL = apiBaseUrl();
    return `${baseURL}${src}`;
  }, [src]);

  const handleDownload = async () => {
    try {
      const response = await fetch(absoluteVideoUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch video: ${response.status}`);
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', alt || 'video.mp4');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Video download failed:', error);
      const link = document.createElement('a');
      link.href = absoluteVideoUrl;
      link.setAttribute('download', alt || 'video.mp4');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  if (hasError) {
    return (
      <div className="my-2 flex items-center gap-2 rounded-lg border border-border-medium bg-surface-secondary px-4 py-3 text-sm text-text-secondary">
        <span>{localize('com_ui_video_failed')}</span>
        <a
          href={absoluteVideoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-text-primary underline"
        >
          {localize('com_ui_video_open_directly')}
        </a>
      </div>
    );
  }

  return (
    <div className="my-2 w-full max-w-lg">
      <div
        className={cn(
          'relative overflow-hidden rounded-lg border border-border-light shadow-md',
          'bg-surface-tertiary',
        )}
      >
        <video
          ref={videoRef}
          controls
          loop
          playsInline
          preload="metadata"
          onLoadedData={() => setIsLoaded(true)}
          onError={() => setHasError(true)}
          className={cn(
            'w-full transition-opacity duration-200',
            isLoaded ? 'opacity-100' : 'opacity-50',
          )}
          aria-label={alt || localize('com_ui_video_generated')}
        >
          <source src={absoluteVideoUrl} type="video/mp4" />
          <track kind="captions" />
          {localize('com_ui_video_unsupported')}
        </video>
      </div>
      <div className="mt-1.5 flex items-center justify-between px-0.5">
        {alt && alt !== 'video' && (
          <span className="truncate text-xs text-text-secondary">{alt}</span>
        )}
        <button
          type="button"
          onClick={handleDownload}
          className="ml-auto text-xs text-text-secondary transition-colors hover:text-text-primary"
          aria-label={localize('com_ui_download')}
        >
          ⬇ {localize('com_ui_download')}
        </button>
      </div>
    </div>
  );
});

export default VideoPlayer;
