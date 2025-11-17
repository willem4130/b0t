'use client';

import { useState } from 'react';

interface ImageDisplayProps {
  data: unknown;
  config?: {
    urlKey?: string;
    altKey?: string;
  };
}

export function ImageDisplay({ data, config }: ImageDisplayProps) {
  const [error, setError] = useState(false);

  // Extract URL from data
  const url = extractUrl(data, config?.urlKey);
  const alt = extractAlt(data, config?.altKey);

  if (!url) {
    return <div className="text-sm text-muted-foreground">No image URL found</div>;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-border/50 bg-muted/30 p-4 text-center">
        <p className="text-sm text-muted-foreground">Failed to load image</p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary hover:underline mt-2 inline-block"
        >
          Open in new tab
        </a>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/50 overflow-hidden bg-muted/30 max-w-2xl mx-auto">
      <div className="relative w-full" style={{ minHeight: '200px' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={alt || 'Generated image'}
          onError={() => setError(true)}
          className="w-full h-auto object-contain"
        />
      </div>
      {alt && (
        <div className="p-2 bg-muted/50 text-xs text-muted-foreground border-t">
          {alt}
        </div>
      )}
    </div>
  );
}

interface ImageGridProps {
  data: unknown;
  config?: {
    urlKey?: string;
    altKey?: string;
  };
}

export function ImageGrid({ data, config }: ImageGridProps) {
  const urls = extractUrls(data, config?.urlKey);

  if (urls.length === 0) {
    return <div className="text-sm text-muted-foreground">No images found</div>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {urls.map((url, idx) => (
        <ImageDisplay key={idx} data={{ url }} config={config} />
      ))}
    </div>
  );
}

function extractUrl(data: unknown, urlKey?: string): string | null {
  if (typeof data === 'string') {
    return data;
  }

  if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>;

    // Use provided key
    if (urlKey && obj[urlKey]) {
      return String(obj[urlKey]);
    }

    // Try common keys
    const commonKeys = ['url', 'imageUrl', 'image', 'src', 'thumbnail', 'link'];
    for (const key of commonKeys) {
      if (obj[key] && typeof obj[key] === 'string') {
        return obj[key];
      }
    }
  }

  return null;
}

function extractAlt(data: unknown, altKey?: string): string | null {
  if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>;

    // Use provided key
    if (altKey && obj[altKey]) {
      return String(obj[altKey]);
    }

    // Try common keys
    const commonKeys = ['alt', 'caption', 'description', 'title'];
    for (const key of commonKeys) {
      if (obj[key] && typeof obj[key] === 'string') {
        return obj[key];
      }
    }
  }

  return null;
}

function extractUrls(data: unknown, urlKey?: string): string[] {
  if (Array.isArray(data)) {
    return data
      .map((item) => extractUrl(item, urlKey))
      .filter((url): url is string => url !== null);
  }

  const url = extractUrl(data, urlKey);
  return url ? [url] : [];
}
