import Link from 'next/link';
import type { Metadata } from 'next';
import { serverGet, type Facets } from '@/lib/api';

export const metadata: Metadata = {
  title: "myartist.in | India's marketplace for event artists",
  description: 'Find the perfect artist for your wedding, corporate event or celebration. Vetted singers, DJs, dancers, hosts, makeup artists and more.',
  alternates: { canonical: '/' },
};

const FORM_ARTIST = 'https://docs.google.com/forms/d/e/1FAIpQLSeyLSoHkZyvVuIGdpRFY1PkkhjJPrpo7C8ScRqZP6vfEd1QQw/viewform?usp=header';

export default async function Home() {
  let facets: Facets | null = null;
  try {
    facets = await serverGet<Facets>('/api/public/filters', 60);
  } catch {
    facets = null;
  }
  const categories = facets?.categories.filter((c) => c.count > 0) ?? [];
  return (
    <>
      <section className="hero">
        <div className="container">
          <h1>The perfect artist for <em>every event.</em></h1>
          <p>Vetted singers, DJs, dancers, hosts, makeup artists and more. Browse who is available, then tell us about your event and we will make the introduction.</p>
          <div className="hero__cta">
            <Link className="btn btn--primary" href="/artists">Browse artists</Link>
            <a className="btn btn--wa" href="/go/wa">Chat on WhatsApp</a>
          </div>
        </div>
      </section>

      {categories.length > 0 && (
        <section className="section">
          <div className="container">
            <h2>Whatever the occasion</h2>
            <p className="section__lead">Weddings, corporate events, birthdays, college fests and cultural evenings. Start with the kind of artist you need.</p>
            <div className="cat-grid">
              {categories.map((c) => (
                <Link key={c.slug} href={`/artists/${c.slug}`} className="cat-tile">
                  <span>{c.plural}</span>
                  <small>{c.count}</small>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="section" id="how">
        <div className="container">
          <h2>How it works</h2>
          <div className="steps">
            <div className="step"><b>01</b><h3>Browse</h3><p>Filter by city, type of artist and occasion. See experience, events done and real client reviews.</p></div>
            <div className="step"><b>02</b><h3>Enquire</h3><p>Tap Enquire for details or message us on WhatsApp with the artist ID. No sign-up needed.</p></div>
            <div className="step"><b>03</b><h3>We introduce you</h3><p>Our team shares the artist&apos;s full details and a few more options, then helps you finalise on WhatsApp or a call.</p></div>
          </div>
          <p className="muted" style={{ marginTop: 18, fontSize: 14 }}>Why are photos blurred? We introduce you to every artist ourselves, so each booking stays safe and verified for both sides.</p>
        </div>
      </section>

      <section className="section" id="for-artists">
        <div className="container">
          <div className="band">
            <div>
              <h2>Are you an artist?</h2>
              <p className="section__lead">Get discovered by people planning real events. Verified leads, honest reviews and more bookings that fit your style.</p>
            </div>
            <a className="btn btn--outline" href={FORM_ARTIST} target="_blank" rel="noopener noreferrer">Join as an artist</a>
          </div>
        </div>
      </section>
    </>
  );
}
