import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });
export function environment() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32)
    throw new Error('SESSION_SECRET must contain at least 32 characters');
  const origin = process.env.APP_ORIGIN || 'http://localhost:5173';
  if (process.env.NODE_ENV === 'production' && !origin.startsWith('https://'))
    throw new Error('Production APP_ORIGIN must use HTTPS');
  return {
    secret,
    origin,
    production: process.env.NODE_ENV === 'production',
    port: Number(process.env.PORT || 3001),
  };
}
export const connection = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'crew_os',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'crew_os',
  timezone: 'Z',
  dateStrings: true,
};
