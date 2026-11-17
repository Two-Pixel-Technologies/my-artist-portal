import Link from 'next/link';
import Logo from './Logo';

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="site-footer__row">
          <Link href="/" aria-label="myartist.in home"><Logo size={22} /></Link>
          <div className="site-footer__links">
            <Link href="/legal/privacy-policy">Privacy Policy</Link>
            <Link href="/legal/terms-and-conditions">Terms &amp; Conditions</Link>
            <Link href="/legal/cancellation-refund">Cancellation &amp; Refund</Link>
            <a href="/go/wa">Contact</a>
          </div>
        </div>
        <p style={{ marginTop: 20 }}>© {new Date().getFullYear()} myartist.in. All rights reserved. A venture of Empvoice Services LLP.</p>
      </div>
    </footer>
  );
}
