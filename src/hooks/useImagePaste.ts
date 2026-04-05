/**
 * useImagePaste — handles pasting and dropping images into the chat input.
 *
 * Supports:
 * - Ctrl+V paste from clipboard (screenshots, copied images)
 * - Drag-and-drop of image files onto the chat area
 *
 * Images are stored as base64 data URLs in local state.
 */

import { useState, useCallback } from "react";

export interface PastedImage {
  /** Unique ID for this image */
  id: string;
  /** Base64 data URL (e.g., "data:image/png;base64,...") */
  dataUrl: string;
  /** Original filename if available, otherwise a generated name */
  name: string;
  /** MIME type (e.g., "image/png") */
  mimeType: string;
  /** File size in bytes */
  size: number;
}

/** Maximum number of images per message */
const MAX_IMAGES = 5;

/** Maximum size per image in bytes (10 MB) */
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

/** Supported image MIME types */
const SUPPORTED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

function generateId(): string {
  return `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to read file as data URL"));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function useImagePaste() {
  const [images, setImages] = useState<PastedImage[]>([]);
  const [error, setError] = useState<string | null>(null);

  /** Process image files and add them to state */
  const addImageFiles = useCallback(async (files: File[]) => {
    setError(null);

    const imageFiles = files.filter((f) => SUPPORTED_TYPES.has(f.type));
    if (imageFiles.length === 0) return;

    // Check max count
    const remaining = MAX_IMAGES - (images.length);
    if (remaining <= 0) {
      setError(`Maximum ${MAX_IMAGES} images per message`);
      return;
    }

    const toProcess = imageFiles.slice(0, remaining);

    for (const file of toProcess) {
      if (file.size > MAX_IMAGE_SIZE) {
        setError(`Image "${file.name}" exceeds 10 MB limit`);
        continue;
      }

      try {
        const dataUrl = await readFileAsDataUrl(file);
        const newImage: PastedImage = {
          id: generateId(),
          dataUrl,
          name: file.name || `screenshot-${Date.now()}.png`,
          mimeType: file.type,
          size: file.size,
        };
        setImages((prev) => [...prev, newImage]);
      } catch {
        setError(`Failed to read image "${file.name}"`);
      }
    }
  }, [images.length]);

  /** Handle paste events on an element */
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const clipboardItems = e.clipboardData?.items;
      if (!clipboardItems) return;

      const imageFiles: File[] = [];
      for (let i = 0; i < clipboardItems.length; i++) {
        const item = clipboardItems[i];
        if (item.kind === "file" && SUPPORTED_TYPES.has(item.type)) {
          const file = item.getAsFile();
          if (file) {
            imageFiles.push(file);
          }
        }
      }

      if (imageFiles.length > 0) {
        // Don't prevent default if there's no image — let text paste through
        e.preventDefault();
        void addImageFiles(imageFiles);
      }
    },
    [addImageFiles],
  );

  /** Handle drag-over events (enable drop) */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }, []);

  /** Handle drop events */
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files);
      void addImageFiles(files);
    },
    [addImageFiles],
  );

  /** Remove an image by ID */
  const removeImage = useCallback((id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
    setError(null);
  }, []);

  /** Clear all images (called after sending a message) */
  const clearImages = useCallback(() => {
    setImages([]);
    setError(null);
  }, []);

  /** Format images as markdown for inclusion in a message */
  const formatImagesForMessage = useCallback((): string => {
    if (images.length === 0) return "";

    return images
      .map((img) => `[Attached image: ${img.name}]\n![${img.name}](${img.dataUrl})`)
      .join("\n\n");
  }, [images]);

  return {
    images,
    error,
    handlePaste,
    handleDragOver,
    handleDrop,
    removeImage,
    clearImages,
    formatImagesForMessage,
    hasImages: images.length > 0,
  };
}
