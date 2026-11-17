'use client';
import { useParams } from 'next/navigation';
import ArtistForm from '@/components/admin/ArtistForm';

export default function EditArtist() {
  const { id } = useParams<{ id: string }>();
  return <ArtistForm id={Number(id)} key={id} />;
}
