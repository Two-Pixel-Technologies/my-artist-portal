import fs from 'node:fs';
import path from 'node:path';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

const PAGES: Record<string, string> = {
  'privacy-policy': 'Privacy Policy',
  'terms-and-conditions': 'Terms & Conditions',
  'cancellation-refund': 'Cancellation & Refund Policy',
};

export function generateStaticParams() {
  return Object.keys(PAGES).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return { title: PAGES[slug] ? `${PAGES[slug]} | myartist.in` : 'Not found', alternates: { canonical: `/legal/${slug}` } };
}

export default async function Legal({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!PAGES[slug]) notFound();
  // Static, trusted content migrated from the original site.
  const html = fs.readFileSync(path.join(process.cwd(), 'src/content/legal', `${slug}.html`), 'utf8');
  return (
    <div className="container">
      <article className="legal" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
