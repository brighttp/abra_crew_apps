import session from 'express-session';
import { db } from './database.js';
// express-session Store implementation backed by the migrated MySQL sessions table.
// Keeping this small avoids a second, separately pinned MySQL driver in the session layer.
export class MySQLSessionStore extends session.Store {
  constructor() {
    super();
    this.cleanup = setInterval(
      () => {
        db('sessions')
          .where('expires', '<', Math.floor(Date.now() / 1000))
          .delete()
          .catch(() => console.error('Session cleanup failed'));
      },
      15 * 60 * 1000,
    );
    this.cleanup.unref();
  }
  get(sid, callback) {
    db('sessions')
      .where({ session_id: sid })
      .where('expires', '>', Math.floor(Date.now() / 1000))
      .first()
      .then((row) => callback(null, row ? JSON.parse(row.data) : null))
      .catch(callback);
  }
  set(sid, value, callback = () => {}) {
    const data = { session_id: sid, expires: this.expiry(value), data: JSON.stringify(value) };
    db('sessions')
      .insert(data)
      .onConflict('session_id')
      .merge({ expires: data.expires, data: data.data })
      .then(() => callback())
      .catch(callback);
  }
  touch(sid, value, callback = () => {}) {
    db('sessions')
      .where({ session_id: sid })
      .update({ expires: this.expiry(value) })
      .then(() => callback())
      .catch(callback);
  }
  destroy(sid, callback = () => {}) {
    db('sessions')
      .where({ session_id: sid })
      .delete()
      .then(() => callback())
      .catch(callback);
  }
  expiry(value) {
    return Math.floor(
      (value.cookie?.expires
        ? new Date(value.cookie.expires).getTime()
        : Date.now() + 8 * 60 * 60 * 1000) / 1000,
    );
  }
  async close() {
    clearInterval(this.cleanup);
  }
}
