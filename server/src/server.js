import { createApp } from './app.js';
import { db } from './config/database.js';
import { environment } from './config/environment.js';
const app = createApp();
await db.raw('SELECT 1');
const server = app.listen(environment().port, () =>
  console.log(`Crew OS listening on port ${environment().port}`),
);
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () =>
    server.close(async () => {
      await app.locals.sessionStore.close();
      await db.destroy();
      process.exit(0);
    }),
  );
