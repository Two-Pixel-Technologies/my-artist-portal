import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/fraunces';
import '@fontsource-variable/inter';
import '@fontsource/ibm-plex-mono/500.css';
import './globals.css';
import { SITE_URL } from '@/lib/api';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "myartist.in | India's marketplace for event artists", template: '%s' },
  description: 'Find vetted singers, DJs, dancers, hosts, makeup artists and more for weddings, corporate events and celebrations across India.',
  openGraph: { siteName: 'myartist.in', type: 'website', locale: 'en_IN' },
  icons: { icon: '/brand/favicon.ico' },
};

export const viewport: Viewport = { themeColor: '#0c081b', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
