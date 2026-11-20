import { db } from '../config/database.js';
import { assert, equal, token } from '../utils/core.js';
export async function identify(req, res, next) {
  try {
    if (req.session.userId) {
      const user = await db('users')
        .where({ id: req.session.userId, approval_state: 'APPROVED' })
        .whereNull('deleted_at')
        .first('id', 'username', 'account_role', 'session_version');
      if (user && user.session_version === req.session.version) req.user = user;
      else {
        delete req.session.userId;
        delete req.session.version;
      }
    }
    next();
  } catch (e) {
    next(e);
  }
}
export function authenticate(req, res, next) {
  try {
    assert(req.user, 401, 'Please log in to continue');
    next();
  } catch (e) {
    next(e);
  }
}
export function admin(req, res, next) {
  try {
    assert(req.user, 401, 'Please log in to continue');
    assert(req.user.account_role === 'ADMIN', 403, 'Administrator access required');
    next();
  } catch (e) {
    next(e);
  }
}
export function crewOnly(req, res, next) {
  try {
    assert(req.user?.account_role === 'CREW', 403, 'Crew access required');
    next();
  } catch (e) {
    next(e);
  }
}
export function csrf(origin) {
  return (req, res, next) => {
    try {
      req.session.csrf ||= token();
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        assert(
          !req.headers.origin || req.headers.origin === origin,
          403,
          'Request origin is not allowed',
        );
        assert(
          equal(req.headers['x-csrf-token'], req.session.csrf),
          403,
          'Security token expired. Refresh and try again',
        );
      }
      next();
    } catch (e) {
      next(e);
    }
  };
}
export function errors(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err.name === 'ZodError')
    return res.status(422).json({
      error: 'Please check your input',
      details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
  if (err.code === 'ER_DUP_ENTRY')
    return res.status(409).json({ error: 'This record already exists' });
  if (err.code === 'ER_ROW_IS_REFERENCED_2')
    return res.status(409).json({ error: 'This record is in use and cannot be deleted' });
  if (err.code === 'LIMIT_FILE_SIZE')
    return res.status(413).json({ error: 'Image must be under 5 MB' });
  const status = err.status || 500;
  if (status >= 500) console.error('Request failed', { code: err.code || err.name });
  res
    .status(status)
    .json({ error: status >= 500 ? 'The service could not complete your request' : err.message });
}
