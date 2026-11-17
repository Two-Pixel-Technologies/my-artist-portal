import type { MetadataRoute } from 'next';
import { SITE_URL, serverGet } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, priority: 1 },
    { url: `${SITE_URL}/artists`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    ...['privacy-policy', 'terms-and-conditions', 'cancellation-refund'].map((s) => ({ url: `${SITE_URL}/legal/${s}`, lastModified: now, priority: 0.2 })),
  ];
  try {
    const s = await serverGet<{ categories: string[]; cities: string[]; combos: { category: string; city: string }[] }>('/api/public/sitemap', 0);
    for (const c of s.categories) entries.push({ url: `${SITE_URL}/artists/${c}`, lastModified: now, changeFrequency: 'daily', priority: 0.8 });
    for (const c of s.cities) entries.push({ url: `${SITE_URL}/artists/all/${c}`, lastModified: now, changeFrequency: 'daily', priority: 0.7 });
    for (const c of s.combos) entries.push({ url: `${SITE_URL}/artists/${c.category}/${c.city}`, lastModified: now, changeFrequency: 'daily', priority: 0.7 });
  } catch {
    /* API unavailable: static entries only */
  }
  return entries;
}
