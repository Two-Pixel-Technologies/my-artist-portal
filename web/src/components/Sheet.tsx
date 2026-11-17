'use client';
import { useEffect, useRef } from 'react';

/** Bottom sheet on phones, centred dialog on larger screens. Traps focus, closes on Esc / backdrop. */
export default function Sheet({ onClose, children, wide, label }: { onClose: () => void; children: React.ReactNode; wide?: boolean; label: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key !== 'Tab' || !ref.current) return;
      const f = ref.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select,textarea,[tabindex]:not([tabindex="-1"])');
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} className={`sheet${wide ? ' sheet--wide' : ''}`}>
        <div className="sheet__grab" aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}
