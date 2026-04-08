import { useState, useRef, useEffect } from "react";

export interface PromptDialogProps {
  /** Dialog title shown at the top */
  title: string;
  /** Initial value for the text input */
  defaultValue?: string;
  /** Placeholder text when the input is empty */
  placeholder?: string;
  /** Label for the submit button (default: "OK") */
  submitLabel?: string;
  /** Called with the trimmed input value on submit */
  onSubmit: (value: string) => void;
  /** Called when the dialog is cancelled or dismissed */
  onClose: () => void;
}

/**
 * A simple themed dialog that asks the user for a single text input.
 * Used for rename, create file/folder, and similar operations.
 */
export function PromptDialog({
  title,
  defaultValue = "",
  placeholder,
  submitLabel = "OK",
  onSubmit,
  onClose,
}: PromptDialogProps) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (trimmed) {
      onSubmit(trimmed);
    }
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="w-80 rounded-lg p-4 flex flex-col gap-3"
        style={{
          backgroundColor: "var(--color-mantle)",
          border: "1px solid var(--color-surface-1)",
          boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <span
          className="text-xs font-semibold"
          style={{ color: "var(--color-text)" }}
        >
          {title}
        </span>

        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded px-2 py-1 text-xs outline-none"
          style={{
            backgroundColor: "var(--color-surface-0)",
            color: "var(--color-text)",
            border: "1px solid var(--color-surface-1)",
          }}
        />

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-2.5 py-1 text-xs rounded transition-opacity hover:opacity-80"
            style={{
              backgroundColor: "var(--color-surface-0)",
              color: "var(--color-subtext-0)",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="px-2.5 py-1 text-xs rounded transition-opacity hover:opacity-80"
            style={{
              backgroundColor: "var(--color-blue)",
              color: "var(--color-base)",
            }}
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
