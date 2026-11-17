import type { Metadata } from 'next';
import Link from 'next/link';
import Logo from '@/components/Logo';
import ReviewForm from './ReviewForm';

export const metadata: Metadata = { title: 'Leave a review | myartist.in', robots: { index: false, follow: false } };

export default async function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <>
      <header className="site-header">
        <div className="container site-header__inner"><Link href="/" aria-label="myartist.in home"><Logo /></Link></div>
      </header>
      <ReviewForm token={token} />
    </>
  );
}
