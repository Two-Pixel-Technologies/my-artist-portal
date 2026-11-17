import path from 'node:path';

const env = process.env;
const isProd = env.NODE_ENV === 'production';

export const OCCASIONS = ['Wedding', 'Corporate', 'Birthday', 'College fest', 'Religious', 'Cultural', 'Private party'];
export const GROUP_TYPES = ['Solo', 'Duo', 'Band', 'Troupe', 'Other'];
export const REVIEW_CATEGORIES = [
  { key: 'punctuality', label: 'Punctuality' },
  { key: 'performance', label: 'Performance quality' },
  { key: 'professionalism', label: 'Professionalism' },
  { key: 'communication', label: 'Communication' },
  { key: 'value', label: 'Value for money' },
];

export const config = {
  port: Number(env.PORT || 4000),
  host: env.HOST || '127.0.0.1',
  isProd,
  dataDir: path.resolve(env.DATA_DIR || './data'),
  dbFile: env.DB_FILE || '', // defaults to <dataDir>/myartist.db
  siteUrl: (env.SITE_URL || 'http://localhost:3000').replace(/\/$/, ''),
  waNumber: (env.WHATSAPP_NUMBER || '919712026900').replace(/\D/g, ''),
  cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === '1' : isProd,
  trustProxy: env.TRUST_PROXY === '1',
  turnstileSecret: env.TURNSTILE_SECRET || '',
  ipSalt: env.IP_SALT || 'dev-only-salt-change-me',
  sessionDays: 14,
  minReviewsToShow: 3,
  logger: env.LOG === '0' ? false : { level: env.LOG_LEVEL || 'info' },
  // Rate limits (per IP). Overridable for tests.
  rl: {
    global: Number(env.RL_GLOBAL || 600),
    enquiry: Number(env.RL_ENQUIRY || 6),
    review: Number(env.RL_REVIEW || 10),
    login: Number(env.RL_LOGIN || 15),
  },
};
