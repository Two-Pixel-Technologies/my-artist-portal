import { buildApp } from './app.js';
import { config } from './config.js';

if (config.isProd && config.ipSalt === 'dev-only-salt-change-me') {
  console.error('Refusing to start in production without IP_SALT set.');
  process.exit(1);
}

const app = await buildApp();
try {
  await app.listen({ port: config.port, host: config.host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    await app.close();
    process.exit(0);
  });
}
