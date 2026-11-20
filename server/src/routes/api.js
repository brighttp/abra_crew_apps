import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { rateLimit } from 'express-rate-limit';
import { db } from '../config/database.js';
import { authenticate, admin, crewOnly } from '../middleware/security.js';
import { assert, audit, token, now, pageOf } from '../utils/core.js';
import { id, z, text } from '../utils/validation.js';
import * as auth from '../services/auth.service.js';
import * as crew from '../services/crew.service.js';
import * as events from '../services/event.service.js';
import * as registrations from '../services/registration.service.js';
import * as evaluations from '../services/evaluation.service.js';
import { performance, rankings } from '../services/performance.service.js';
import { crewPerformance } from '../serializers/crewPerformance.serializer.js';
import { dashboard, eventAnalytics, exportReport } from '../services/report.service.js';
export const api = Router();
const filters = z.object({
  page: z.coerce.number().int().min(1).max(100000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  search: z.string().max(100).optional(),
  action: z.string().max(100).optional(),
  skill_id: id.optional(),
  event_id: id.optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  min_events: z.coerce.number().int().min(0).optional(),
  min_evaluations: z.coerce.number().int().min(0).optional(),
  sort: z.enum(['name', 'events', 'rating', 'date']).optional(),
  status: z.enum(['DRAFT', 'UPCOMING', 'ONGOING', 'COMPLETED', 'CANCELLED']).optional(),
  format: z.enum(['csv', 'xlsx']).optional(),
});
api.use((req, res, next) => {
  filters.parse(req.query);
  next();
});
const actor = (req) => ({ user: req.user, ip: req.ip });
const send = (fn) => async (req, res) => {
  const data = await fn(req, res);
  if (!res.headersSent) res.json({ data: data === undefined ? { ok: true } : data });
};
const param = (req, key = 'id') => id.parse(req.params[key]);
const own = (req, userId) =>
  assert(
    req.user.account_role === 'ADMIN' || req.user.id === userId,
    403,
    'You can access only your own profile',
  );
const authLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again later.' },
});
const publicLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many requests. Try again later.' },
});
api.get(
  '/auth/me',
  send((req) => ({
    user: req.user
      ? { id: req.user.id, username: req.user.username, account_role: req.user.account_role }
      : null,
    csrfToken: req.session.csrf,
  })),
);
api.post(
  '/auth/register',
  authLimit,
  send((req) => auth.register(req.body, actor(req))),
);
api.post(
  '/auth/login',
  authLimit,
  send((req) => auth.login(req.body, req)),
);
api.post(
  '/auth/logout',
  send(async (req, res) => {
    await new Promise((resolve, reject) => req.session.destroy((e) => (e ? reject(e) : resolve())));
    res.clearCookie('crew.sid', { path: '/' });
    return { ok: true };
  }),
);
api.post(
  '/auth/change-password',
  authenticate,
  authLimit,
  send(async (req) => {
    await auth.changePassword(req.body, actor(req));
    await new Promise((resolve, reject) => req.session.destroy((e) => (e ? reject(e) : resolve())));
  }),
);
api.get(
  '/crew/pending-approvals',
  admin,
  send((req) => crew.list(req.query, true)),
);
api.get(
  '/crew',
  admin,
  send((req) => crew.list(req.query)),
);
api.post(
  '/crew',
  admin,
  send((req) => crew.create(req.body, actor(req))),
);
api.get(
  '/crew/:id',
  authenticate,
  send((req) => {
    own(req, param(req));
    return crew.detail(param(req));
  }),
);
api.patch(
  '/crew/:id',
  authenticate,
  send((req) => {
    own(req, param(req));
    return crew.update(param(req), req.body, actor(req));
  }),
);
api.delete(
  '/crew/:id',
  admin,
  send((req) => crew.archive(param(req), actor(req))),
);
api.post(
  '/crew/:id/approve',
  admin,
  send((req) => crew.approve(param(req), true, actor(req))),
);
api.post(
  '/crew/:id/reject',
  admin,
  send((req) => crew.approve(param(req), false, actor(req))),
);
api.post(
  '/crew/:id/reset-password',
  admin,
  authLimit,
  send((req) => crew.resetPassword(param(req), req.body, actor(req))),
);
api.put(
  '/crew/:id/skills',
  admin,
  send((req) =>
    crew.setSkills(
      param(req),
      z.object({ skill_ids: z.array(id).max(100) }).parse(req.body).skill_ids,
      actor(req),
    ),
  ),
);
const uploads = fileURLToPath(new URL('../../uploads/', import.meta.url));
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});
api.post(
  '/crew/:id/photo',
  authenticate,
  (req, res, next) => {
    own(req, param(req));
    next();
  },
  upload.single('photo'),
  send(async (req) => {
    assert(req.file, 422, 'Choose an image');
    assert(
      await db('users')
        .where({ id: param(req), account_role: 'CREW' })
        .whereNull('deleted_at')
        .first(),
      404,
      'Crew not found',
    );
    let bytes;
    try {
      const image = sharp(req.file.buffer, { limitInputPixels: 20000000 });
      const metadata = await image.metadata();
      assert(['jpeg', 'png', 'webp'].includes(metadata.format), 422, 'Unsupported image format');
      bytes = await image
        .rotate()
        .resize(400, 400, { fit: 'cover' })
        .webp({ quality: 80 })
        .toBuffer();
    } catch {
      assert(false, 422, 'Upload a valid JPEG, PNG, or WebP image');
    }
    await mkdir(uploads, { recursive: true });
    const name = token() + '.webp';
    await writeFile(uploads + name, bytes);
    await db.transaction(async (trx) => {
      await trx('crew_profiles')
        .where({ user_id: param(req) })
        .update({ profile_photo_path: name, updated_at: now() });
      await audit(trx, actor(req), 'PROFILE_PHOTO_UPDATED', 'user', param(req));
    });
    return { path: name };
  }),
);
api.get('/crew/:id/photo', authenticate, async (req, res) => {
  own(req, param(req));
  const p = await db('crew_profiles')
    .where({ user_id: param(req) })
    .first('profile_photo_path');
  assert(p?.profile_photo_path, 404, 'Photo not found');
  res.sendFile(p.profile_photo_path, { root: uploads });
});
api.get(
  '/skills',
  authenticate,
  send(() => db('skills').orderBy('name')),
);
api.post(
  '/skills',
  admin,
  send((req) => crew.saveSkill(null, req.body, actor(req))),
);
api.patch(
  '/skills/:id',
  admin,
  send((req) => crew.saveSkill(param(req), req.body, actor(req))),
);
api.delete(
  '/skills/:id',
  admin,
  send((req) =>
    db.transaction(async (trx) => {
      assert(
        !(await trx('crew_skills')
          .where({ skill_id: param(req) })
          .first()),
        409,
        'Remove this skill from crew before deleting it',
      );
      await trx('skills')
        .where({ id: param(req) })
        .delete();
      await audit(trx, actor(req), 'SKILL_DELETED', 'skill', param(req));
    }),
  ),
);
api.get(
  '/events/calendar',
  authenticate,
  send((req) => {
    const range = z
      .object({ from: z.iso.date(), to: z.iso.date() })
      .refine((v) => v.from <= v.to)
      .parse(req.query);
    return events.calendar(range, req.user.account_role === 'CREW' ? req.user.id : null);
  }),
);
api.get(
  '/events',
  authenticate,
  send((req) => events.list(req.query, req.user.account_role === 'CREW' ? req.user.id : null)),
);
api.post(
  '/events',
  admin,
  send((req) => events.save(null, req.body, actor(req))),
);
api.get(
  '/events/:id',
  authenticate,
  send((req) => events.detail(param(req), req.user.account_role === 'CREW' ? req.user.id : null)),
);
api.patch(
  '/events/:id',
  admin,
  send((req) => events.save(param(req), req.body, actor(req))),
);
api.delete(
  '/events/:id',
  admin,
  send((req) => events.archive(param(req), actor(req))),
);
api.get(
  '/events/:id/crew',
  admin,
  send((req) => events.assigned(param(req))),
);
api.post(
  '/events/:id/crew',
  admin,
  send((req) =>
    registrations.assign(
      param(req),
      z.object({ crew_ids: z.array(id).min(1).max(100) }).parse(req.body).crew_ids,
      actor(req),
    ),
  ),
);
api.delete(
  '/events/:id/crew/:crewId',
  admin,
  send((req) => registrations.removeAssignment(param(req), param(req, 'crewId'), actor(req))),
);
api.get(
  '/events/:id/registration-settings',
  admin,
  send(async (req) => {
    await events.detail(param(req));
    const r = await db('event_registration_settings')
      .where({ event_id: param(req) })
      .first();
    const { token_hash, ...safe } = r;
    return { ...safe, has_link: !!token_hash };
  }),
);
api.put(
  '/events/:id/registration-settings',
  admin,
  send((req) => registrations.settings(param(req), req.body, actor(req))),
);
api.post(
  '/events/:id/registration-link/regenerate',
  admin,
  send((req) => registrations.regenerate(param(req), actor(req))),
);
api.delete(
  '/events/:id/registration-link',
  admin,
  send((req) => registrations.regenerate(param(req), actor(req), true)),
);
api.get(
  '/public/events/:token',
  publicLimit,
  send((req) => registrations.publicEvent(req.params.token)),
);
api.post(
  '/public/events/:token/apply',
  authenticate,
  crewOnly,
  send((req) => registrations.apply(req.params.token, actor(req))),
);
api.get(
  '/events/:id/applications',
  admin,
  send((req) => registrations.applications(param(req))),
);
api.post(
  '/events/:id/applications/:applicationId/approve',
  admin,
  send((req) => registrations.review(param(req), param(req, 'applicationId'), true, actor(req))),
);
api.post(
  '/events/:id/applications/:applicationId/reject',
  admin,
  send((req) =>
    registrations.review(
      param(req),
      param(req, 'applicationId'),
      false,
      actor(req),
      z.object({ reason: z.string().max(2000).default('') }).parse(req.body).reason,
    ),
  ),
);
api.get(
  '/me/applications',
  authenticate,
  crewOnly,
  send((req) => registrations.mine(req.user.id)),
);
api.post(
  '/me/applications/:id/withdraw',
  authenticate,
  crewOnly,
  send((req) => registrations.withdraw(param(req), actor(req))),
);
api.get(
  '/criteria',
  admin,
  send(() => db('evaluation_criteria').orderBy('id')),
);
api.post(
  '/criteria',
  admin,
  send((req) => evaluations.saveCriterion(null, req.body, actor(req))),
);
api.patch(
  '/criteria/:id',
  admin,
  send((req) => evaluations.saveCriterion(param(req), req.body, actor(req))),
);
api.get(
  '/events/:id/criteria',
  admin,
  send((req) => evaluations.criteria(param(req))),
);
api.put(
  '/events/:id/criteria',
  admin,
  send((req) =>
    evaluations.criteria(
      param(req),
      z.object({ criterion_ids: z.array(id).min(1).max(100) }).parse(req.body).criterion_ids,
      actor(req),
    ),
  ),
);
api.post(
  '/events/:id/evaluation-link',
  admin,
  send((req) =>
    evaluations.link(
      param(req),
      z.object({ expires_at: z.iso.datetime().nullable().optional() }).parse(req.body).expires_at,
      actor(req),
    ),
  ),
);
api.get(
  '/events/:id/evaluation-link',
  admin,
  send(
    async (req) =>
      (await db('event_evaluation_links')
        .where({ event_id: param(req) })
        .first('is_active', 'expires_at', 'created_at', 'revoked_at')) || null,
  ),
);
api.delete(
  '/events/:id/evaluation-link',
  admin,
  send((req) => evaluations.revoke(param(req), actor(req))),
);
api.get(
  '/public/evaluation/:token',
  publicLimit,
  send((req) => evaluations.publicLink(req.params.token)),
);
api.post(
  '/public/evaluation/:token/session',
  publicLimit,
  send((req) => evaluations.startSession(req.params.token, req.body, req)),
);
api.get(
  '/external-evaluation/session',
  send((req) => evaluations.progress(req)),
);
api.get(
  '/external-evaluation/crew',
  send((req) => evaluations.progress(req)),
);
api.post(
  '/external-evaluation/crew/:crewId/draft',
  publicLimit,
  send((req) => evaluations.saveExternal(param(req, 'crewId'), req.body, req, false)),
);
api.post(
  '/external-evaluation/crew/:crewId/submit',
  publicLimit,
  send((req) => evaluations.saveExternal(param(req, 'crewId'), req.body, req, true)),
);
api.get(
  '/events/:id/evaluator-sessions',
  admin,
  send((req) =>
    db('external_evaluator_sessions')
      .where({ event_id: param(req) })
      .select('id', 'evaluator_name', 'evaluator_description', 'created_at', 'revoked_at'),
  ),
);
api.delete(
  '/events/:id/evaluator-sessions/:sessionId',
  admin,
  send((req) =>
    db.transaction(async (trx) => {
      await registrations.lockEvent(trx, param(req));
      assert(
        await trx('external_evaluator_sessions')
          .where({ id: param(req, 'sessionId'), event_id: param(req) })
          .update({ revoked_at: now() }),
        404,
        'Session not found',
      );
      await audit(
        trx,
        actor(req),
        'EVALUATOR_SESSION_REVOKED',
        'external_session',
        param(req, 'sessionId'),
      );
    }),
  ),
);
api.post(
  '/events/:id/evaluations',
  admin,
  send((req) =>
    evaluations.saveAdmin(
      param(req),
      id.parse(req.body.crew_id),
      req.body,
      actor(req),
      req.body.submit === true,
    ),
  ),
);
api.get(
  '/events/:id/evaluations',
  admin,
  send((req) => evaluations.list(param(req))),
);
api.get(
  '/evaluations',
  admin,
  send(() => evaluations.list()),
);
api.get(
  '/evaluations/:id',
  admin,
  send((req) => evaluations.detail(param(req))),
);
api.patch(
  '/evaluations/:id',
  admin,
  send((req) => evaluations.edit(param(req), req.body, actor(req))),
);
for (const action of ['submit', 'publish', 'unpublish', 'reopen'])
  api.post(
    `/evaluations/:id/${action}`,
    admin,
    send((req) => evaluations.transition(param(req), action, req.body, actor(req))),
  );
api.get(
  '/me/performance',
  authenticate,
  crewOnly,
  send(async (req) => crewPerformance(await performance(req.user.id))),
);
api.get(
  '/me/performance/history',
  authenticate,
  crewOnly,
  send(async (req) => crewPerformance(await performance(req.user.id)).history),
);
api.get(
  '/admin/performance',
  admin,
  send((req) => rankings(req.query)),
);
api.get(
  '/admin/crew/:id/performance',
  admin,
  send((req) => performance(param(req), req.query)),
);
api.get(
  '/admin/events/:id/performance',
  admin,
  send(async (req) => (await eventAnalytics()).find((e) => e.id === param(req)) || null),
);
api.get(
  '/admin/dashboard',
  admin,
  send(() => dashboard()),
);
api.get(
  '/admin/analytics/rankings',
  admin,
  send((req) => rankings(req.query)),
);
api.get(
  '/admin/analytics/trends',
  admin,
  send(async (req) =>
    (await rankings(req.query)).map((r) => ({ id: r.id, name: r.full_name, history: r.history })),
  ),
);
api.get(
  '/admin/analytics/events',
  admin,
  send((req) => eventAnalytics(req.query)),
);
api.get(
  '/admin/reports/:type',
  admin,
  send((req, res) => {
    assert(
      !req.query.format || ['csv', 'xlsx'].includes(req.query.format),
      422,
      'Choose CSV or XLSX',
    );
    return exportReport(req.params.type, req.query, res);
  }),
);
api.get(
  '/admin/settings',
  admin,
  send(async () => {
    const rows = await db('system_settings').select(
      'key',
      db.raw('JSON_UNQUOTE(`value`) AS value'),
    );
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }),
);
api.patch(
  '/admin/settings',
  admin,
  send((req) => {
    const data = z
      .object({ organization_name: text, support_email: z.union([z.email(), z.literal('')]) })
      .parse(req.body);
    return db.transaction(async (trx) => {
      for (const [key, value] of Object.entries(data))
        await trx('system_settings')
          .insert({ key, value: JSON.stringify(value) })
          .onConflict('key')
          .merge({ value: JSON.stringify(value), updated_at: now() });
      await audit(trx, actor(req), 'SETTINGS_UPDATED', 'settings', null);
    });
  }),
);
api.get(
  '/admin/audit-logs',
  admin,
  send(async (req) => {
    const { page, limit } = pageOf(req.query);
    const q = db('audit_logs as a').leftJoin('users as u', 'u.id', 'a.actor_user_id');
    if (req.query.action)
      q.where('a.action', 'like', `%${String(req.query.action).slice(0, 100)}%`);
    if (req.query.from) q.where('a.created_at', '>=', req.query.from);
    if (req.query.to) q.where('a.created_at', '<=', req.query.to + ' 23:59:59');
    const [{ total }] = await q.clone().count({ total: 'a.id' });
    return {
      items: await q
        .select('a.*', 'u.username as actor')
        .orderBy('a.id', 'desc')
        .limit(limit)
        .offset((page - 1) * limit),
      total: Number(total),
      page,
      limit,
    };
  }),
);
