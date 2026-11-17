// Server-side helpers (used by server components). Browser code goes through the /api rewrite instead.
export const API_URL = process.env.API_URL || 'http://127.0.0.1:4000';
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');

export async function serverGet<T>(path: string, revalidate = 30): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { next: { revalidate } });
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export type Artist = {
  id: string;
  headline: string;
  category: string | null;
  categorySlug: string | null;
  city: string | null;
  state: string | null;
  citySlug: string | null;
  experience: string | null;
  events: string | null;
  groupType: string | null;
  rating: { avg: number; count: number } | null;
  reviewCount: number;
  isNew: boolean;
  verified: boolean;
  languages: string[];
  tags: string[];
  photo: string | null;
};

export type ArtistList = { total: number; page: number; pageSize: number; hasMore: boolean; artists: Artist[] };

export type Facets = {
  categories: { slug: string; name: string; plural: string; count: number }[];
  cities: { slug: string; name: string; state: string; count: number }[];
  states: string[];
  languages: { name: string; count: number }[];
  occasions: string[];
  groupTypes: string[];
  experience: { label: string; value: number | null }[];
  totalArtists: number;
};
