'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { adminApi } from '@/lib/client';
import { BellIcon } from '@/lib/icons';
import Logo from '../Logo';
import { AdminContext, ago } from './ui';

const NAV = [
  { href: '/admin', label: 'Dashboard', exact: true },
  { href: '/admin/enquiries', label: 'Enquiries', badge: 'enquiries' },
  { href: '/admin/artists', label: 'Artists' },
  { href: '/admin/bookings', label: 'Bookings & reviews' },
  { href: '/admin/reviews', label: 'Review approvals', badge: 'reviews' },
  { href: '/admin/admins', label: 'Admins' },
  { href: '/admin/settings', label: 'Settings' },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [admin, setAdmin] = useState<any>(null);
  const [badges, setBadges] = useState({ enquiries: 0, reviews: 0 });
  const [notes, setNotes] = useState<{ unread: number; notifications: any[] }>({ unread: 0, notifications: [] });
  const [bellOpen, setBellOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ m: string; err: boolean } | null>(null);
  const timer = useRef<any>(undefined);

  const toast = useCallback((m: string, err = false) => {
    setToastMsg({ m, err });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToastMsg(null), 3200);
  }, []);

  const refreshBadges = useCallback(async () => {
    try {
      const [d, n] = await Promise.all([adminApi.get('/dashboard'), adminApi.get('/notifications')]);
      setBadges({ enquiries: d.newEnquiries, reviews: d.pendingReviews });
      setNotes(n);
    } catch { /* a 401 redirects elsewhere */ }
  }, []);

  useEffect(() => {
    adminApi.get('/auth/me').then((r) => setAdmin(r.admin)).catch(() => router.replace('/admin/login'));
  }, [router]);

  useEffect(() => {
    if (!admin) return;
    refreshBadges();
    const t = setInterval(refreshBadges, 30000);
    return () => clearInterval(t);
  }, [admin, refreshBadges]);

  useEffect(() => { setBellOpen(false); setMenuOpen(false); }, [path]);

  async function openBell() {
    const next = !bellOpen;
    setBellOpen(next);
    setMenuOpen(false);
    if (next && notes.unread > 0) {
      await adminApi.post('/notifications/seen').catch(() => {});
      setTimeout(refreshBadges, 4000); // keep the "unread" highlight visible while the list is open
    }
  }

  async function logout() {
    await adminApi.post('/auth/logout').catch(() => {});
    router.replace('/admin/login');
  }

  if (!admin) return <div className="login"><p className="muted">Loading…</p></div>;

  return (
    <AdminContext.Provider value={{ admin, toast, badges, refreshBadges }}>
      <div className="adm">
        <header className="adm-top">
          <Link href="/admin" style={{ display: 'flex', alignItems: 'center' }}><Logo /><span className="tag">Admin</span></Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, position: 'relative' }}>
            <div className="bell" style={{ position: 'relative' }}>
              <button className="icon-btn" aria-label={`Notifications${notes.unread ? `, ${notes.unread} unread` : ''}`} aria-expanded={bellOpen} onClick={openBell}>
                <BellIcon />
                {notes.unread > 0 && <span className="dot">{notes.unread > 9 ? '9+' : notes.unread}</span>}
              </button>
              {bellOpen && (
                <div className="dropdown" role="menu">
                  {notes.notifications.length === 0 && <p className="muted" style={{ padding: 16 }}>No notifications yet.</p>}
                  {notes.notifications.map((n) => (
                    <Link key={n.id} href={n.link || '/admin'} className={n.unread ? 'unread' : ''}>
                      <strong style={{ fontSize: 14 }}>{n.title}</strong>
                      {n.body && <small>{n.body}</small>}
                      <small>{ago(n.created_at)}</small>
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <div style={{ position: 'relative' }}>
              <button className="btn btn--sm btn--outline" onClick={() => { setMenuOpen((o) => !o); setBellOpen(false); }} aria-expanded={menuOpen}>{admin.name.split(' ')[0]}</button>
              {menuOpen && (
                <div className="dropdown" style={{ width: 220 }}>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}><strong>{admin.name}</strong><small style={{ display: 'block', color: 'var(--muted)', overflowWrap: 'anywhere' }}>{admin.email}</small></div>
                  <Link href="/admin/settings">Settings &amp; password</Link>
                  <a href="#" onClick={(e) => { e.preventDefault(); logout(); }}>Sign out</a>
                </div>
              )}
            </div>
          </div>
        </header>
        <div className="adm-body">
          <nav className="adm-nav" aria-label="Admin">
            {NAV.map((n) => {
              const on = n.exact ? path === n.href : path.startsWith(n.href);
              const count = n.badge ? (badges as any)[n.badge] : 0;
              return (
                <Link key={n.href} href={n.href} aria-current={on ? 'page' : undefined}>
                  {n.label}{count > 0 && <span className="count">{count}</span>}
                </Link>
              );
            })}
          </nav>
          <main className="adm-main">{children}</main>
        </div>
        {toastMsg && <div className={`toast${toastMsg.err ? ' is-error' : ''}`} role="status">{toastMsg.m}</div>}
      </div>
    </AdminContext.Provider>
  );
}
