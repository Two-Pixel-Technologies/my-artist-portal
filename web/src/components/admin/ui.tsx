'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CloseIcon } from '@/lib/icons';

export type AdminCtx = {
  admin: { id: number; name: string; email: string };
  toast: (message: string, isError?: boolean) => void;
  badges: { enquiries: number; reviews: number };
  refreshBadges: () => void;
};
export const AdminContext = createContext<AdminCtx>(null as any);
export const useAdmin = () => useContext(AdminContext);

/** SQLite timestamps are UTC 'YYYY-MM-DD HH:MM:SS'. */
export function parseTs(s?: string | null) {
  if (!s) return null;
  return new Date(s.length <= 10 ? `${s}T00:00:00` : `${s.replace(' ', 'T')}Z`);
}
export function fmtDateTime(s?: string | null) {
  const d = parseTs(s);
  return d ? d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—';
}
export function fmtDate(s?: string | null) {
  const d = parseTs(s);
  return d ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
}
export function ago(s?: string | null) {
  const d = parseTs(s);
  if (!d) return '';
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
}
export const money = (n?: number | null) => (n == null ? '—' : `₹${n.toLocaleString('en-IN')}`);
export const waLink = (phone: string | null | undefined, text: string) => {
  const d = String(phone || '').replace(/\D/g, '');
  const num = d.length === 10 ? `91${d}` : d;
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
};
export const STATUS_LABEL: Record<string, string> = {
  new: 'New', contacted: 'Contacted', options_sent: 'Options sent', booked: 'Booked', lost: 'Lost',
  active: 'Active', inactive: 'Inactive', pending: 'Pending', archived: 'Archived',
  confirmed: 'Confirmed', completed: 'Completed', cancelled: 'Cancelled',
  none: 'No review', link_sent: 'Link sent', used: 'Used', expired: 'Expired', revoked: 'Revoked',
  review_pending: 'Needs approval', review_approved: 'Reviewed', review_rejected: 'Rejected', approved: 'Approved', rejected: 'Rejected',
};
export const Pill = ({ s }: { s: string }) => <span className={`pill pill--${s}`}>{STATUS_LABEL[s] || s}</span>;

export function useLoad<T>(fn: () => Promise<T>, deps: any[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const run = useCallback(() => {
    const id = ++seq.current;
    setLoading(true);
    fn().then((d) => { if (id === seq.current) { setData(d); setError(''); } })
      .catch((e) => { if (id === seq.current) setError(e.message || 'Failed to load'); })
      .finally(() => { if (id === seq.current) setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { data, error, loading, reload: run, setData };
}

export function Drawer({ onClose, title, children }: { onClose: () => void; title: string; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="drawer" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer__panel" role="dialog" aria-modal="true" aria-label={title}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <h2 className="display" style={{ fontSize: 22 }}>{title}</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}><CloseIcon /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, hint, children, span2 }: { label: string; hint?: string; children: React.ReactNode; span2?: boolean }) {
  return (
    <div className={`field${span2 ? ' span-2' : ''}`}>
      <label>{label}</label>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

/** Free-text chips (languages, tags). Enter or comma adds. */
export function TagInput({ value, onChange, placeholder, suggestions = [] }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; suggestions?: string[] }) {
  const [text, setText] = useState('');
  const add = (raw: string) => {
    const t = raw.trim();
    if (t && !value.some((v) => v.toLowerCase() === t.toLowerCase())) onChange([...value, t]);
    setText('');
  };
  const left = suggestions.filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase())).slice(0, 8);
  return (
    <div>
      <div className="tagbox">
        {value.map((v) => (
          <span className="tg" key={v}>{v}<button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(value.filter((x) => x !== v))}>×</button></span>
        ))}
        <input value={text} placeholder={value.length ? '' : placeholder} onChange={(e) => (e.target.value.endsWith(',') ? add(e.target.value.slice(0, -1)) : setText(e.target.value))}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(text); } if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1)); }}
          onBlur={() => text && add(text)} />
      </div>
      {left.length > 0 && (
        <div className="chips" style={{ marginTop: 8 }}>
          {left.map((s) => <button type="button" key={s} className="chip chip--sm" onClick={() => add(s)}>+ {s}</button>)}
        </div>
      )}
    </div>
  );
}

/** Searchable multi-select with chips (travel cities). */
export function MultiPick({ options, value, onChange, placeholder }: { options: { id: number; label: string }[]; value: number[]; onChange: (v: number[]) => void; placeholder?: string }) {
  const [q, setQ] = useState('');
  const matches = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase()) && !value.includes(o.id)).slice(0, 8) : [];
  return (
    <div style={{ position: 'relative' }}>
      <div className="tagbox">
        {value.map((id) => (
          <span className="tg" key={id}>{options.find((o) => o.id === id)?.label}<button type="button" aria-label="Remove" onClick={() => onChange(value.filter((x) => x !== id))}>×</button></span>
        ))}
        <input value={q} placeholder={value.length ? '' : placeholder} onChange={(e) => setQ(e.target.value)} />
      </div>
      {matches.length > 0 && (
        <div className="panel" style={{ position: 'absolute', zIndex: 20, left: 0, right: 0, marginTop: 4, padding: 6 }}>
          {matches.map((o) => <button type="button" key={o.id} className="opt" style={{ minHeight: 40, fontSize: 15, borderTop: 0, padding: '0 10px' }} onClick={() => { onChange([...value, o.id]); setQ(''); }}>{o.label}</button>)}
        </div>
      )}
    </div>
  );
}

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 16 }}>
      <button className="btn btn--outline btn--sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
      <span className="muted" style={{ fontSize: 14 }}>Page {page} of {pages}</span>
      <button className="btn btn--outline btn--sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
    </div>
  );
}

export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export function CopyBox({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="copy-box">
      <input className="input" readOnly value={value} onFocus={(e) => e.currentTarget.select()} aria-label="Link" />
      <button className="btn btn--outline" type="button" onClick={async () => { try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* select manually */ } }}>{copied ? 'Copied' : 'Copy'}</button>
    </div>
  );
}
