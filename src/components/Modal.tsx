import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, [open]);

  if (!open) return null;

  const widthClass =
    size === 'sm'
      ? 'max-w-sm'
      : size === 'lg'
        ? 'max-w-3xl'
        : size === 'xl'
          ? 'max-w-5xl'
          : 'max-w-lg';

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/35"
      style={{ minHeight: '100dvh' }}
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`bg-white rounded-t-2xl sm:rounded-2xl w-full ${widthClass} overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[min(90dvh,calc(100dvh-2rem))] shadow-[0_12px_48px_-12px_rgba(0,0,0,0.18)] ring-1 ring-black/[0.06]`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/5 shrink-0">
          <div className="text-base font-semibold text-text-primary truncate pr-2">{title}</div>
          <button
            onClick={onClose}
            className="p-2.5 sm:p-1.5 text-text-secondary hover:text-text-primary hover:bg-black/5 rounded-md shrink-0"
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] overflow-y-auto flex-1 min-h-0">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
