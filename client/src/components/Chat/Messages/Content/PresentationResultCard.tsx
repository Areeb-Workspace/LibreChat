import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { apiBaseUrl } from 'librechat-data-provider';
import { ChevronLeft, ChevronRight, Download, FileCode2, Maximize2, X } from 'lucide-react';
import type { PresentationPreviewImage, PresentationResult } from '~/utils/presentation';
import { cn } from '~/utils';

function getPresentationServerBaseUrl(port: number) {
  if (typeof window === 'undefined') {
    return `http://localhost:${port}`;
  }

  return `${window.location.protocol}//${window.location.hostname}:${port}`;
}

function mapLocalSlideForgePath(url?: string) {
  if (!url) {
    return undefined;
  }

  let localPath = url;

  if (/^file:\/\//i.test(url)) {
    try {
      localPath = decodeURIComponent(new URL(url).pathname);
    } catch {
      localPath = url.replace(/^file:\/\//i, '');
    }
  }

  const match = localPath.match(/[/\\]slideforge[/\\](output|assets)[/\\]([^/\\?#]+)/i);
  if (!match) {
    return undefined;
  }

  return `${getPresentationServerBaseUrl(3334)}/${match[1].toLowerCase()}/${encodeURIComponent(match[2])}`;
}

function mapLocalMoaForgePath(url?: string) {
  if (!url) {
    return undefined;
  }

  let localPath = url;

  if (/^file:\/\//i.test(url)) {
    try {
      localPath = decodeURIComponent(new URL(url).pathname);
    } catch {
      localPath = url.replace(/^file:\/\//i, '');
    }
  }

  const standaloneMatch = localPath.match(/[/\\]moaForge[/\\](output|assets)[/\\]([^/\\?#]+)/i);
  if (standaloneMatch) {
    const [, bucket, filename] = standaloneMatch;
    const routeBucket = bucket.toLowerCase() === 'output' ? 'outputs' : bucket.toLowerCase();
    return `${getPresentationServerBaseUrl(3335)}/${routeBucket}/${encodeURIComponent(filename)}`;
  }

  const match = localPath.match(
    /[/\\]moaForge[/\\]jobs[/\\]([^/\\]+)[/\\](artifacts|output|previews)[/\\]([^/\\?#]+)/i,
  );
  if (!match) {
    return undefined;
  }

  const [, jobId, bucket, filename] = match;
  return `${getPresentationServerBaseUrl(3335)}/jobs/${encodeURIComponent(jobId)}/${bucket.toLowerCase()}/${encodeURIComponent(filename)}`;
}

function resolveBrowserUrl(url?: string) {
  if (!url) {
    return undefined;
  }

  const localSlideForgeUrl = mapLocalSlideForgePath(url);
  if (localSlideForgeUrl) {
    return localSlideForgeUrl;
  }

  const localMoaForgeUrl = mapLocalMoaForgePath(url);
  if (localMoaForgeUrl) {
    return localMoaForgeUrl;
  }

  if (/^https?:\/\//i.test(url) || /^file:\/\//i.test(url) || url.startsWith('/api/')) {
    return url.startsWith('/api/') ? `${apiBaseUrl()}${url}` : url;
  }

  if (
    url.startsWith('outputs/') ||
    url.startsWith('/outputs/') ||
    url.startsWith('assets/') ||
    url.startsWith('/assets/')
  ) {
    return `${getPresentationServerBaseUrl(3334)}${url.startsWith('/') ? '' : '/'}${url}`;
  }

  if (url.startsWith('jobs/') || url.startsWith('/jobs/')) {
    return `${getPresentationServerBaseUrl(3335)}${url.startsWith('/') ? '' : '/'}${url}`;
  }

  const apiRoot = `${apiBaseUrl()}/api`;

  if (url.startsWith('files/')) {
    return `${apiRoot}/${url}`;
  }

  if (url.startsWith('/files/')) {
    return `${apiRoot}${url}`;
  }

  return url;
}

function isUsableBrowserUrl(url?: string) {
  if (!url) {
    return false;
  }

  if (url.startsWith('file://')) {
    return false;
  }

  if (/^\/(home|Users|var|tmp)\//.test(url)) {
    return false;
  }

  return /^https?:\/\//i.test(url) || url.startsWith('/');
}

function InfoPill({ label, value }: { label: string; value?: string | number }) {
  if (value == null || value === '') {
    return null;
  }

  return (
    <div className="rounded-full border border-border-light bg-surface-secondary px-2.5 py-1 text-[11px] leading-none text-text-secondary">
      <span className="font-medium text-text-primary">{value}</span>
      <span className="ml-1">{label}</span>
    </div>
  );
}

function ActionButton({
  onClick,
  label,
  subtitle,
  icon,
  variant = 'default',
}: {
  onClick?: () => void;
  label: string;
  subtitle?: string;
  icon: ReactNode;
  variant?: 'default' | 'ghost';
}) {
  if (!onClick) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group inline-flex h-9 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors',
        variant === 'default'
          ? 'border-border-medium bg-white hover:bg-surface-hover dark:bg-surface-primary'
          : 'border-border-light bg-surface-secondary hover:bg-surface-hover',
      )}
    >
      <div className="min-w-0">
        <div className="text-text-primary">{label}</div>
        {subtitle ? (
          <div className="truncate text-xs text-text-secondary">{subtitle}</div>
        ) : null}
      </div>
      <div className="shrink-0 text-text-secondary group-hover:text-text-primary">{icon}</div>
    </button>
  );
}

function ActionButtonLink({
  href,
  label,
  icon,
  download = false,
}: {
  href?: string;
  label: string;
  icon: ReactNode;
  download?: boolean;
}) {
  if (!href) {
    return null;
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      download={download}
      className="inline-flex h-9 items-center gap-2 rounded-lg border border-border-medium bg-white px-3 text-sm font-medium text-text-primary transition-colors hover:bg-surface-hover dark:bg-surface-primary"
    >
      <span className="text-text-secondary">{icon}</span>
      <span>{label}</span>
    </a>
  );
}

function SlideThumbnailCard({
  preview,
  onSelect,
}: {
  preview: PresentationPreviewImage;
  onSelect: () => void;
}) {
  const slideNumber = preview.slideNumber ?? '?';

  if (!preview.url) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className="group relative w-full overflow-hidden rounded-lg border border-border-light bg-[#05070c] text-left shadow-sm transition-colors hover:border-border-medium"
      aria-label={`Open slide ${slideNumber}`}
    >
      <img
        src={preview.url}
        alt={preview.name ?? `Slide ${slideNumber} preview`}
        className="aspect-[16/9] w-full object-contain object-center transition-transform duration-200 group-hover:scale-[1.02]"
        loading="lazy"
      />
      <span className="absolute left-2 top-2 inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-blue-500 px-1.5 text-[11px] font-semibold text-white shadow-sm">
        {slideNumber}
      </span>
    </button>
  );
}

const PresentationResultCard = memo(({ result }: { result: PresentationResult }) => {
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const htmlHref = useMemo(() => resolveBrowserUrl(result.htmlUrl), [result.htmlUrl]);
  const pptxHref = useMemo(() => resolveBrowserUrl(result.pptxUrl), [result.pptxUrl]);
  const resolvedPreviewImages = useMemo(() => {
    const seen = new Set<string>();
    const previews: PresentationPreviewImage[] = [];
    const addPreview = (preview?: PresentationPreviewImage) => {
      const url = resolveBrowserUrl(preview?.url);
      if (!url || seen.has(url) || !isUsableBrowserUrl(url)) {
        return;
      }

      seen.add(url);
      previews.push({
        ...preview,
        url,
      });
    };

    addPreview(
      result.previewImageUrl
        ? {
            url: result.previewImageUrl,
            name: result.previewImageName,
            slideNumber: 1,
          }
        : undefined,
    );
    (result.previewImages ?? []).forEach(addPreview);

    return previews.sort((left, right) => {
      const leftNumber = left.slideNumber ?? Number.MAX_SAFE_INTEGER;
      const rightNumber = right.slideNumber ?? Number.MAX_SAFE_INTEGER;
      return leftNumber - rightNumber;
    });
  }, [result.previewImageName, result.previewImageUrl, result.previewImages]);
  const previewHref = resolvedPreviewImages[0]?.url ?? resolveBrowserUrl(result.htmlUrl);

  const canPreviewImage = useMemo(
    () =>
      isUsableBrowserUrl(previewHref) &&
      /\.(png|jpe?g|webp|gif)(?:$|\?)/i.test(previewHref ?? ''),
    [previewHref],
  );

  const canPreviewHtml = useMemo(
    () => isUsableBrowserUrl(htmlHref) && /\.html(?:$|\?)/i.test(htmlHref ?? ''),
    [htmlHref],
  );
  const secondaryPreviews = useMemo(
    () =>
      resolvedPreviewImages
        .filter((preview) => preview.url !== previewHref)
        .slice(0, 3),
    [previewHref, resolvedPreviewImages],
  );
  const hasSidePreviews = secondaryPreviews.length > 0;
  const canOpenViewer = resolvedPreviewImages.length > 0 || canPreviewHtml;
  const activePreview = resolvedPreviewImages[activeSlideIndex];
  const viewerSlideCount = resolvedPreviewImages.length;
  const openViewer = useCallback(
    (index = 0) => {
      setActiveSlideIndex(Math.max(0, Math.min(index, Math.max(viewerSlideCount - 1, 0))));
      setIsViewerOpen(true);
    },
    [viewerSlideCount],
  );
  const goToPreviousSlide = useCallback(() => {
    setActiveSlideIndex((index) =>
      viewerSlideCount > 0 ? (index - 1 + viewerSlideCount) % viewerSlideCount : 0,
    );
  }, [viewerSlideCount]);
  const goToNextSlide = useCallback(() => {
    setActiveSlideIndex((index) => (viewerSlideCount > 0 ? (index + 1) % viewerSlideCount : 0));
  }, [viewerSlideCount]);

  useEffect(() => {
    if (!isViewerOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsViewerOpen(false);
      } else if (event.key === 'ArrowLeft') {
        goToPreviousSlide();
      } else if (event.key === 'ArrowRight') {
        goToNextSlide();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [goToNextSlide, goToPreviousSlide, isViewerOpen]);

  useEffect(() => {
    if (activeSlideIndex >= viewerSlideCount && viewerSlideCount > 0) {
      setActiveSlideIndex(viewerSlideCount - 1);
    }
  }, [activeSlideIndex, viewerSlideCount]);

  const viewerPortal =
    isViewerOpen && canOpenViewer && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-black/80 px-3 py-4 backdrop-blur-sm sm:px-6 sm:py-8"
            role="dialog"
            aria-modal="true"
            aria-label={`${result.title} slide viewer`}
            onClick={() => setIsViewerOpen(false)}
          >
            <div
              className="relative flex max-h-[calc(100dvh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-border-medium bg-surface-primary shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3 border-b border-border-light px-4 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-text-primary">
                    {result.title}
                  </div>
                  {viewerSlideCount > 0 ? (
                    <div className="mt-1 text-xs text-text-secondary">
                      {(activePreview?.slideNumber ?? activeSlideIndex + 1).toString()} /{' '}
                      {viewerSlideCount}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setIsViewerOpen(false)}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border-light text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
                  aria-label="Close presentation viewer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="relative flex h-[min(70dvh,720px)] min-h-[220px] items-center justify-center bg-black sm:h-[min(72dvh,720px)]">
                {activePreview ? (
                  <img
                    src={activePreview.url}
                    alt={
                      activePreview.name ??
                      `Slide ${activePreview.slideNumber ?? activeSlideIndex + 1}`
                    }
                    className="h-full w-full object-contain object-center"
                  />
                ) : canPreviewHtml ? (
                  <iframe
                    title={`${result.title} full preview`}
                    src={htmlHref}
                    className="h-full w-full bg-white"
                    sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
                  />
                ) : null}

                {viewerSlideCount > 1 ? (
                  <>
                    <button
                      type="button"
                      onClick={goToPreviousSlide}
                      className="absolute left-3 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/55 text-white shadow-lg transition-colors hover:bg-black/75"
                      aria-label="Previous slide"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={goToNextSlide}
                      className="absolute right-3 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/55 text-white shadow-lg transition-colors hover:bg-black/75"
                      aria-label="Next slide"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </>
                ) : null}
              </div>

              {viewerSlideCount > 1 ? (
                <div className="flex items-center justify-center gap-2 overflow-x-auto border-t border-border-light px-4 py-2.5">
                  {resolvedPreviewImages.map((preview, index) => (
                    <button
                      type="button"
                      key={preview.url}
                      onClick={() => setActiveSlideIndex(index)}
                      className={cn(
                        'inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-xs font-semibold transition-colors',
                        index === activeSlideIndex
                          ? 'border-blue-500 bg-blue-500 text-white'
                          : 'border-border-light bg-surface-secondary text-text-secondary hover:bg-surface-hover hover:text-text-primary',
                      )}
                      aria-label={`Go to slide ${preview.slideNumber ?? index + 1}`}
                    >
                      {preview.slideNumber ?? index + 1}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="not-prose my-3 w-full max-w-[760px] overflow-hidden rounded-lg border border-border-medium bg-surface-primary shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-light px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="line-clamp-1 text-sm font-semibold text-text-primary sm:text-base">
              {result.title}
            </h3>
            <span className="rounded-md bg-blue-500/10 px-2 py-1 text-[11px] font-medium leading-none text-blue-700 dark:text-blue-200">
              Presentation
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <InfoPill label="slides" value={result.slides} />
            <InfoPill label="theme" value={result.theme} />
            <InfoPill label="size" value={result.sizeLabel} />
          </div>
        </div>

        <ActionButton
          onClick={canOpenViewer ? () => openViewer(0) : undefined}
          label="Extend"
          variant="ghost"
          icon={<Maximize2 className="h-4 w-4" />}
        />
      </div>

      <div
        className={cn(
          'grid items-start gap-3 px-4 py-4',
          hasSidePreviews ? 'md:grid-cols-[minmax(0,1fr)_180px]' : '',
        )}
      >
        <div className="self-start overflow-hidden rounded-lg border border-border-light bg-[#05070c] shadow-sm">
          {canPreviewImage ? (
            <button
              type="button"
              onClick={() => openViewer(0)}
              className="group block aspect-[16/9] w-full"
              aria-label="Open presentation preview"
            >
              <img
                src={previewHref}
                alt={result.previewImageName ?? `${result.title} preview`}
                className="h-full w-full object-contain object-center transition-transform duration-200 group-hover:scale-[1.01]"
              />
            </button>
          ) : canPreviewHtml ? (
            <iframe
              title={`${result.title} preview`}
              src={htmlHref}
              className="block aspect-[16/9] w-full bg-white"
              loading="lazy"
              sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
            />
          ) : (
            <div className="flex aspect-[16/9] items-center justify-center bg-surface-secondary p-6">
              <div className="max-w-xs text-center">
                <div className="text-lg font-semibold leading-tight text-text-primary">
                  {result.title}
                </div>
                <div className="mt-2 text-sm text-text-secondary">Preview unavailable</div>
              </div>
            </div>
          )}
        </div>

        {hasSidePreviews ? (
          <div className="grid grid-cols-3 gap-2 md:flex md:flex-col">
            {secondaryPreviews.map((preview) => (
              <SlideThumbnailCard
                key={preview.url}
                preview={preview}
                onSelect={() => openViewer(resolvedPreviewImages.indexOf(preview))}
              />
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-light px-4 py-3">
        <div className="text-xs font-medium text-text-secondary">Download</div>
        <div className="flex flex-wrap gap-2">
          <ActionButtonLink
            href={htmlHref}
            label="HTML"
            icon={<FileCode2 className="h-4 w-4" />}
          />
          <ActionButtonLink
            href={pptxHref}
            label="PPTX"
            download
            icon={<Download className="h-4 w-4" />}
          />
        </div>
      </div>
      {viewerPortal}
    </div>
  );
});

export default PresentationResultCard;
