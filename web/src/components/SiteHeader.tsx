'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import Logo from './Logo';
import { CloseIcon, MenuIcon } from '@/lib/icons';

const links = [
  { href: '/artists', label: 'Artists' },
  { href: '/#for-artists', label: 'For artists' },
  { href: '/#how', label: 'How it works' },
  { href: '/go/wa', label: 'Contact', external: true },
];

export default function SiteHeader() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const current = (href: string) => (href === '/artists' ? path.startsWith('/artists') : false);
  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <Link href="/" aria-label="myartist.in home" onClick={() => setOpen(false)}>
          <Logo />
        </Link>
        <nav className="nav" aria-label="Main">
          {links.map((l) =>
            l.external ? (
              <a key={l.href} href={l.href}>{l.label}</a>
            ) : (
              <Link key={l.href} href={l.href} aria-current={current(l.href) ? 'page' : undefined}>{l.label}</Link>
            ),
          )}
        </nav>
        <button className="icon-btn menu-btn" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? <CloseIcon /> : <MenuIcon />}
        </button>
      </div>
      {open && (
        <nav className="mobile-nav" aria-label="Mobile">
          {links.map((l) =>
            l.external ? (
              <a key={l.href} href={l.href} onClick={() => setOpen(false)}>{l.label}</a>
            ) : (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)}>{l.label}</Link>
            ),
          )}
        </nav>
      )}
    </header>
  );
}
