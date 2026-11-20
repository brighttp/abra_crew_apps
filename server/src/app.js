import express from 'express';
import session from 'express-session';
import { MySQLSessionStore } from './config/session.js';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { fileURLToPath } from 'node:url';
import { environment } from './config/environment.js';
import { identify, csrf, errors } from './middleware/security.js';
import { api } from './routes/api.js';

export function createApp(options = {}) {
  const env = environment();
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', Number(process.env.TRUST_PROXY || 0));
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'script-src': ["'self'"],
          'style-src': ["'self'", "'unsafe-inline'"],
          'img-src': ["'self'", 'data:'],
          'connect-src': ["'self'"],
          'upgrade-insecure-requests': env.production ? [] : null,
        },
      },
      referrerPolicy: { policy: 'no-referrer' },
      strictTransportSecurity: env.production ? undefined : false,
    }),
  );
  app.use(cors({ origin: env.origin, credentials: true }));
  app.use(express.json({ limit: '128kb' }));
  app.use(
    '/api',
    rateLimit({
      windowMs: 60 * 1000,
      limit: 300,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'Too many requests' },
    }),
  );
  app.get('/health', (_, res) => res.json({ status: 'ok' }));
  const store = options.store || new MySQLSessionStore();
  app.locals.sessionStore = store;
  app.use(
    '/api',
    session({
      name: 'crew.sid',
      secret: env.secret,
      store,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        secure: env.production,
        sameSite: 'lax',
        maxAge: 8 * 60 * 60 * 1000,
      },
    }),
  );
  app.use(
    '/api',
    (req, res, next) => {
      res.setHeader('Cache-Control', 'no-store');
      next();
    },
    identify,
    csrf(env.origin),
    api,
  );
  app.use('/api', (_, res) => res.status(404).json({ error: 'API endpoint not found' }));
  const dist = fileURLToPath(new URL('../../client/dist/', import.meta.url));
  app.use(express.static(dist));
  app.get('/{*path}', (req, res) => res.sendFile('index.html', { root: dist }));
  app.use(errors);
  return app;
}
