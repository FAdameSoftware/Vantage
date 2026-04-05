/**
 * ImagePreview — thumbnail preview of pasted/dropped images in the chat input.
 *
 * Shows a row of thumbnails with remove buttons, displayed above the chat input
 * when images are attached.
 */

import { X, Image as ImageIcon } from "lucide-react";
import type { PastedImage } from "@/hooks/useImagePaste";

interface ImagePreviewProps {
  images: PastedImage[];
  onRemove: (id: string) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ImageThumbnail({
  image,
  onRemove,
}: {
  image: PastedImage;
  onRemove: () => void;
}) {
  return (
    <div
      className="relative group/thumb shrink-0 rounded overflow-hidden"
      style={{
        width: 56,
        height: 56,
        border: "1px solid var(--color-surface-1)",
        backgroundColor: "var(--color-surface-0)",
      }}
    >
      {/* Thumbnail image */}
      <img
        src={image.dataUrl}
        alt={image.name}
        className="w-full h-full object-cover"
        draggable={false}
      />

      {/* Remove button overlay */}
      <button
        type="button"
        onClick={onRemove}
        className="absolute top-0 right-0 p-0.5 rounded-bl opacity-0 group-hover/thumb:opacity-100 transition-opacity"
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.7)",
          color: "var(--color-red)",
        }}
        aria-label={`Remove ${image.name}`}
        title={`Remove ${image.name}`}
      >
        <X size={10} />
      </button>

      {/* File size label */}
      <div
        className="absolute bottom-0 left-0 right-0 text-center text-[8px] py-0.5"
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.6)",
          color: "rgba(255, 255, 255, 0.8)",
        }}
      >
        {formatSize(image.size)}
      </div>
    </div>
  );
}

export function ImagePreview({ images, onRemove }: ImagePreviewProps) {
  if (images.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 px-1 mb-1">
      <ImageIcon
        size={12}
        className="shrink-0"
        style={{ color: "var(--color-overlay-0)" }}
      />
      <div className="flex items-center gap-1.5 overflow-x-auto">
        {images.map((img) => (
          <ImageThumbnail
            key={img.id}
            image={img}
            onRemove={() => onRemove(img.id)}
          />
        ))}
      </div>
      <span
        className="text-[10px] shrink-0"
        style={{ color: "var(--color-overlay-0)" }}
      >
        {images.length} image{images.length !== 1 ? "s" : ""}
      </span>
    </div>
  );
}
