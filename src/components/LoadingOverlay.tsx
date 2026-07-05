"use client";

interface LoadingOverlayProps {
  open: boolean;
  message?: string;
  hint?: string;
}

export function LoadingOverlay({
  open,
  message = "处理中，请稍候...",
  hint,
}: LoadingOverlayProps) {
  if (!open) return null;

  return (
    <div className="loading-overlay" role="status" aria-live="polite" aria-busy="true">
      <div className="loading-overlay-card">
        <div className="loading-spinner" aria-hidden />
        <p className="mt-4 text-base font-medium text-[var(--ink)]">{message}</p>
        {hint && <p className="mt-2 text-sm text-[var(--ink-soft)]">{hint}</p>}
      </div>
    </div>
  );
}
