import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { ChevronLeft, ChevronRight, Maximize, X, ZoomIn, ZoomOut } from 'lucide-react';

export interface LightboxImage {
  src: string;
  alt: string;
}

interface Props {
  images: LightboxImage[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 5;

export function ImageLightbox({ images, index, onIndexChange, onClose }: Props) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const justDraggedRef = useRef(false);

  const current = images[index];
  const hasMultiple = images.length > 1;

  useEffect(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, [index]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && hasMultiple) onIndexChange((index - 1 + images.length) % images.length);
      else if (e.key === 'ArrowRight' && hasMultiple) onIndexChange((index + 1) % images.length);
      else if (e.key === '+' || e.key === '=') setScale((s) => Math.min(MAX_SCALE, +(s * 1.25).toFixed(2)));
      else if (e.key === '-') setScale((s) => Math.max(MIN_SCALE, +(s / 1.25).toFixed(2)));
      else if (e.key === '0') {
        setScale(1);
        setOffset({ x: 0, y: 0 });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasMultiple, images.length, index, onClose, onIndexChange]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setScale((s) => {
        const next = e.deltaY < 0 ? s * 1.15 : s / 1.15;
        return Math.min(MAX_SCALE, Math.max(MIN_SCALE, +next.toFixed(2)));
      });
    };
    frame.addEventListener('wheel', onWheel, { passive: false });
    return () => frame.removeEventListener('wheel', onWheel);
  }, []);

  if (!current) return null;

  const zoomBy = (factor: number) =>
    setScale((s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, +(s * factor).toFixed(2))));

  const reset = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLImageElement>) => {
    if (scale <= 1) return;
    dragRef.current = { x: e.clientX, y: e.clientY, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLImageElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    if (drag.moved) {
      drag.x = e.clientX;
      drag.y = e.clientY;
      setOffset((o) => ({ x: o.x + dx, y: o.y + dy }));
    }
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLImageElement>) => {
    if (dragRef.current?.moved) justDraggedRef.current = true;
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const backdropClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (justDraggedRef.current) {
      justDraggedRef.current = false;
      return;
    }
    if (e.target === e.currentTarget) onClose();
  };

  const btn = 'rounded-full bg-white/10 p-2 text-white hover:bg-white/25';

  return (
    <div
      ref={frameRef}
      role="dialog"
      aria-modal="true"
      aria-label="图片查看"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
      onClick={backdropClick}
    >
      <div className="absolute right-3 top-3 flex items-center gap-1.5">
        <span className="px-1 text-xs tabular-nums text-white/70">{Math.round(scale * 100)}%</span>
        <button type="button" className={btn} title="缩小" aria-label="缩小" onClick={() => zoomBy(1 / 1.25)}>
          <ZoomOut size={18} />
        </button>
        <button type="button" className={btn} title="放大" aria-label="放大" onClick={() => zoomBy(1.25)}>
          <ZoomIn size={18} />
        </button>
        <button type="button" className={btn} title="适应窗口" aria-label="适应窗口" onClick={reset}>
          <Maximize size={18} />
        </button>
        <button type="button" className={btn} title="关闭" aria-label="关闭" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      {hasMultiple && (
        <>
          <button
            type="button"
            className={`${btn} absolute left-3 top-1/2 -translate-y-1/2`}
            title="上一张"
            aria-label="上一张"
            onClick={() => onIndexChange((index - 1 + images.length) % images.length)}
          >
            <ChevronLeft size={20} />
          </button>
          <button
            type="button"
            className={`${btn} absolute right-3 top-1/2 -translate-y-1/2`}
            title="下一张"
            aria-label="下一张"
            onClick={() => onIndexChange((index + 1) % images.length)}
          >
            <ChevronRight size={20} />
          </button>
        </>
      )}
      <img
        src={current.src}
        alt={current.alt}
        draggable={false}
        className="max-h-[86vh] max-w-[92vw] select-none object-contain"
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          cursor: scale > 1 ? 'grab' : 'zoom-in',
          touchAction: 'none',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={() => setScale((s) => (s > 1 ? 1 : 2.5))}
      />
      {(hasMultiple || current.alt) && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 max-w-[90vw] -translate-x-1/2 truncate text-center text-sm text-white/80">
          {hasMultiple && <span className="mr-2 tabular-nums">{index + 1} / {images.length}</span>}
          {current.alt}
        </div>
      )}
    </div>
  );
}
