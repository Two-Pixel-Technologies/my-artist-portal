import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="container" style={{ padding: '96px 16px', textAlign: 'center' }}>
      <h1 className="display" style={{ fontSize: 34 }}>We couldn&apos;t find that page</h1>
      <p className="muted" style={{ margin: '12px 0 24px' }}>The artist or page you are looking for may have moved.</p>
      <Link className="btn btn--primary" href="/artists">Browse artists</Link>
    </div>
  );
}
