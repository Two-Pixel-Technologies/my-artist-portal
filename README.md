# myartist.in portal

Artist discovery portal for [myartist.in](https://myartist.in): visitors browse anonymised artist cards and enquire; admins manage artists, enquiries, bookings and one-time review links.

```
server/   Fastify + SQLite (better-sqlite3) API, Excel import, image processing, tests
web/      Next.js 15 (React 19) site: public pages (server-rendered for SEO) + /admin
```
The old static site (`index.html`, `style.css`, …) is still at the repo root, untouched, until you cut over.

## Run locally
```bash
npm run install:all
npm run seed                 # demo artists, photos, enquiries + admin: admin@myartist.in / ChangeMe-12345
npm run dev:api              # http://127.0.0.1:4000
npm run dev:web              # http://localhost:3000   (admin at /admin)
npm test                     # 19 API tests
```
Real admin: `ADMIN_PASSWORD='long-password' npm --prefix server run create-admin -- you@example.com "Your Name"`. Admins can then add more admins in the portal.

## How the privacy model works
- Visitors only ever receive the whitelist in `server/src/services/public.js`: public ID (`MA-XXXX`), headline, category, city, experience and events as **ranges** (`8+ yrs`, `150+`), rating, languages, tags and a **server-blurred** thumbnail. Name, phone, social links, prices and exact numbers are never selected into that response; a test pins the exact key list.
- Photos: the original is stored privately (admin-only endpoint). A 240px derivative is generated at upload by shrinking to 18px, scaling back and blurring, under a random file key.
- Public search only matches public fields, so names and phones cannot be looked up.
- Headline, summary and tags are scanned on save and on Excel import; text containing the artist's name, a phone number, an email/@handle or a link is rejected.
- WhatsApp button → `/go/wa?a=MA-XXXX` logs the click, then opens `wa.me/<number>` with the ID prefilled.

## Reviews
Admin clicks **Get review** on a booking → one-time link `/review/<token>`. Only the SHA-256 of the token is stored. Opening the link (including WhatsApp link previews) never consumes it; the submit is an atomic update so concurrent submits create one review. Links expire (default 30 days, configurable); generating a new link revokes the old one. Reviews are held for approval; a rating is shown publicly from 3 approved reviews.

## Production notes
- Needs a server with a persistent disk (SQLite file + photos in `DATA_DIR`). Vercel/GitHub Pages will not work for the API. A small VPS in Mumbai behind Cloudflare is enough.
- Run `server` (`npm start`) and `web` (`npm run build && npm start`) behind a reverse proxy (e.g. Caddy); the proxy sends everything to `web`, which forwards `/api`, `/media` and `/go` to the API (`API_URL`). Set `NEXT_PUBLIC_SITE_URL`, `SITE_URL`, `TRUST_PROXY=1`, `IP_SALT`, HTTPS (cookies become `Secure`).
- Back up `DATA_DIR` (e.g. Litestream or a nightly `sqlite3 .backup` + copy `private/` and `public/`).
- Optional: set `TURNSTILE_SECRET` / site key to captcha the enquiry form.

## Not built yet (by design)
Artist or visitor logins, availability calendars, in-app payments, WhatsApp/Telegram alerts (admins get an in-portal bell + inbox). The legal pages were migrated as-is: update the Terms, Privacy Policy and Cancellation policy for the commission/introduction model and for DPDP Act 2023 obligations before launch.
