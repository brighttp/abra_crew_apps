import bcrypt from 'bcryptjs';
import { db } from '../config/database.js';
import { assert, audit, now, token } from '../utils/core.js';
import { crew, password, username, z } from '../utils/validation.js';
import { applyWithin } from './registration.service.js';
export async function register(body, actor) {
  const data = crew
    .extend({
      email: z.email(),
      phone: z.string().trim().min(1).max(40),
      confirm_password: z.string(),
      registration_token: z.string().max(100).optional(),
    })
    .parse(body);
  assert(data.password === data.confirm_password, 422, 'Passwords do not match');
  const password_hash = await bcrypt.hash(data.password, 12);
  return db.transaction(async (trx) => {
    const [id] = await trx('users').insert({
      username: data.username,
      email: data.email,
      password_hash,
      account_role: 'CREW',
      approval_state: 'PENDING',
    });
    await trx('crew_profiles').insert({
      user_id: id,
      full_name: data.full_name,
      phone: data.phone,
    });
    if (data.registration_token) await applyWithin(trx, data.registration_token, id);
    await audit(trx, actor, 'ACCOUNT_REGISTERED', 'user', id);
    return {
      message:
        'Registration received. An administrator must approve your account before you can log in.',
    };
  });
}
const dummyHash = await bcrypt.hash(token(), 12);
export async function login(body, req) {
  const data = z.object({ username, password: z.string().min(1).max(128) }).parse(body);
  const user = await db('users').where({ username: data.username }).whereNull('deleted_at').first();
  const valid = await bcrypt.compare(data.password, user?.password_hash || dummyHash);
  assert(user && valid, 401, 'Invalid username or password');
  assert(
    user.approval_state === 'APPROVED',
    403,
    user.approval_state === 'PENDING'
      ? 'Your account is awaiting approval'
      : 'Your account registration was not approved',
  );
  await new Promise((resolve, reject) =>
    req.session.regenerate((e) => (e ? reject(e) : resolve())),
  );
  req.session.userId = user.id;
  req.session.version = user.session_version;
  req.session.csrf = token();
  return {
    user: { id: user.id, username: user.username, account_role: user.account_role },
    csrfToken: req.session.csrf,
  };
}
export async function changePassword(body, actor) {
  const data = z.object({ current_password: z.string().max(128), password }).parse(body);
  const user = await db('users').where({ id: actor.user.id }).first();
  assert(
    await bcrypt.compare(data.current_password, user.password_hash),
    422,
    'Current password is incorrect',
  );
  const password_hash = await bcrypt.hash(data.password, 12);
  await db.transaction(async (trx) => {
    await trx('users')
      .where({ id: user.id })
      .update({
        password_hash,
        session_version: trx.raw('session_version + 1'),
        updated_at: now(),
      });
    await audit(trx, actor, 'PASSWORD_CHANGED', 'user', user.id);
  });
}
