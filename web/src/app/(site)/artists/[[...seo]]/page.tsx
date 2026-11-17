import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Explorer from '@/components/Explorer';
import { SITE_URL, serverGet, type ArtistList, type Facets } from '@/lib/api';
import { describe, emptyFilters, parseFilters, toApiQuery, toUrl } from '@/lib/filters';

type Props = { params: Promise<{ seo?: string[] }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

async function load(props: Props) {
  const [{ seo }, sp] = await Promise.all([props.params, props.searchParams]);
  const filters = parseFilters(seo, sp);
  const facets = await serverGet<Facets>('/api/public/filters', 60);
  const validCat = filters.category.every((s) => facets.categories.some((c) => c.slug === s));
  const validCity = !filters.city || facets.cities.some((c) => c.slug === filters.city);
  if ((seo && seo.length > 2) || !validCat || !validCity) notFound();
  return { filters, facets, seo };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { filters, facets } = await load(props);
  const d = describe(filters, facets);
  const canonical = toUrl({ ...emptyFilters, category: filters.category.length === 1 ? filters.category : [], city: filters.city });
  // Only category/city combinations are indexable landing pages; every other filter combination is a duplicate view.
  const duplicate = !!(filters.q || filters.occasion.length || filters.language.length || filters.minYears != null || filters.minRating != null || filters.sort !== 'top' || filters.state || filters.category.length > 1);
  return {
    title: d.filtered ? `${d.heading} | myartist.in` : 'Browse artists | myartist.in',
    description: d.description,
    alternates: { canonical },
    robots: duplicate ? { index: false, follow: true } : undefined,
    openGraph: { title: d.heading, description: d.description, url: `${SITE_URL}${canonical}` },
  };
}

export default async function ArtistsPage(props: Props) {
  const { filters, facets } = await load(props);
  const list = await serverGet<ArtistList>(`/api/public/artists?${toApiQuery(filters)}`, 30);
  const d = describe(filters, facets);
  const key = toUrl(filters);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: d.heading,
    description: d.description,
    url: `${SITE_URL}${key}`,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: list.total,
      itemListElement: list.artists.slice(0, 12).map((a, i) => ({ '@type': 'ListItem', position: i + 1, name: a.headline })),
    },
  };

  return (
    <div className="container">
      <header className="page-head">
        {d.filtered && (
          <nav className="crumbs" aria-label="Breadcrumb">
            <Link href="/">Home</Link> / <Link href="/artists">Artists</Link>
            {d.categoryName && <> / <span>{d.categoryName}</span></>}
          </nav>
        )}
        <h1>{d.heading}</h1>
        <p>
          {d.filtered
            ? `${list.total} vetted ${list.total === 1 ? 'artist' : 'artists'}. Names and photos are shared when you enquire.`
            : `${facets.totalArtists > 0 ? `${facets.totalArtists}+ vetted performers. ` : ''}Names and photos are shared when you enquire.`}
        </p>
      </header>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <Explorer key={key} initial={list} facets={facets} filters={filters} />
    </div>
  );
}
