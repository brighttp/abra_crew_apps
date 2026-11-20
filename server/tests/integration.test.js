// Runs against a real, disposable MySQL 8+ database. Never run on production.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import ExcelJS from 'exceljs';
import { db } from '../src/config/database.js';
import { createApp } from '../src/app.js';
import { token } from '../src/utils/core.js';
let app,
  admin,
  crewA,
  crewB,
  adminId,
  crewAId,
  crewBId,
  eventId,
  regToken,
  evalToken,
  criteria,
  externalA,
  externalB,
  evaluationId;
const secret = 'IntegrationPass123!';
async function agent() {
  const a = request.agent(app);
  const r = await a.get('/api/auth/me').expect(200);
  a.csrf = r.body.data.csrfToken;
  return a;
}
async function mutate(a, method, path, body = {}, expected = 200) {
  const r = await a[method]('/api' + path)
    .set('X-CSRF-Token', a.csrf)
    .send(body)
    .expect(expected);
  if (r.body.data?.csrfToken) a.csrf = r.body.data.csrfToken;
  return r.body.data;
}
async function signIn(a, username) {
  return mutate(a, 'post', '/auth/login', { username, password: secret });
}
before(async () => {
  assert(
    process.env.DB_NAME?.endsWith('_test'),
    'DB_NAME must end with _test; use an empty disposable MySQL database',
  );
  assert(
    !(await db.schema.hasTable('users')),
    'Integration database must be empty; recreate it before running again',
  );
  process.env.SESSION_SECRET ||= token();
  process.env.APP_ORIGIN = 'http://localhost:5173';
  await db.migrate.latest({
    directory: new URL('../database/migrations', import.meta.url).pathname,
  });
  [adminId] = await db('users').insert({
    username: 'admin_test',
    password_hash: await bcrypt.hash(secret, 12),
    account_role: 'ADMIN',
    approval_state: 'APPROVED',
  });
  await db('crew_profiles').insert({ user_id: adminId, full_name: 'Test Admin' });
  app = createApp();
  admin = await agent();
  await signIn(admin, 'admin_test');
});
after(async () => {
  if (app) await app.locals.sessionStore.close();
  await db.destroy();
});
test('registration, separate approvals, login, secure cookies and crew privacy', async () => {
  crewA = await agent();
  await mutate(crewA, 'post', '/auth/register', {
    username: 'andi',
    full_name: 'Andi',
    email: 'andi@example.test',
    phone: '12345',
    password: secret,
    confirm_password: secret,
  });
  const pending = await db('users').where({ username: 'andi' }).first();
  crewAId = pending.id;
  assert.equal(pending.approval_state, 'PENDING');
  assert.notEqual(pending.password_hash, secret);
  await mutate(crewA, 'post', '/auth/login', { username: 'andi', password: secret }, 403);
  await mutate(admin, 'post', `/crew/${crewAId}/approve`);
  await signIn(crewA, 'andi');
  const c = await mutate(admin, 'post', '/crew', {
    username: 'budi',
    full_name: 'Budi',
    password: secret,
  });
  crewBId = c.id;
  crewB = await agent();
  await signIn(crewB, 'budi');
  await crewA.get(`/api/crew/${crewBId}`).expect(403);
  await crewA.get(`/api/admin/crew/${crewBId}/performance`).expect(403);
  await crewA.get('/api/admin/reports/crew').expect(403);
  const self = await crewA.get(`/api/crew/${crewAId}`).expect(200);
  assert(!JSON.stringify(self.body).includes('password_hash'));
  assert.equal(self.body.data.performance.overall_score, null);
});
test('events, public registration, duplicate prevention and concurrent quota approval', async () => {
  eventId = (
    await mutate(admin, 'post', '/events', {
      name: 'GAW 2026',
      location: 'Jakarta',
      start_date: '2026-01-01',
      end_date: '2026-01-02',
      status: 'UPCOMING',
    })
  ).id;
  await mutate(admin, 'put', `/events/${eventId}/registration-settings`, {
    is_enabled: true,
    quota: 1,
    public_description: 'Join us',
    show_client: false,
  });
  regToken = (await mutate(admin, 'post', `/events/${eventId}/registration-link/regenerate`)).token;
  const publicEvent = await request(app)
    .get('/api/public/events/' + regToken)
    .expect(200);
  assert.equal(publicEvent.body.data.availability, 'Open');
  assert(!JSON.stringify(publicEvent.body).includes('token_hash'));
  await mutate(crewA, 'post', `/public/events/${regToken}/apply`);
  await mutate(crewA, 'post', `/public/events/${regToken}/apply`, {}, 409);
  await mutate(crewB, 'post', `/public/events/${regToken}/apply`);
  const applications = await db('event_registrations').where({ event_id: eventId }).orderBy('id');
  const approvals = await Promise.all(
    applications.map((a) =>
      admin
        .post(`/api/events/${eventId}/applications/${a.id}/approve`)
        .set('X-CSRF-Token', admin.csrf)
        .send({}),
    ),
  );
  assert.deepEqual(approvals.map((r) => r.status).sort(), [200, 409]);
  assert.equal((await db('event_assignments').where({ event_id: eventId })).length, 1);
  assert.equal(
    (await request(app).get('/api/public/events/' + regToken)).body.data.availability,
    'Full',
  );
  await mutate(admin, 'post', `/events/${eventId}/crew`, { crew_ids: [crewAId, crewBId] }, 409);
  await mutate(admin, 'put', `/events/${eventId}/registration-settings`, {
    is_enabled: true,
    quota: 3,
    public_description: 'Join us',
  });
  const pending = await db('event_registrations')
    .where({ event_id: eventId, application_status: 'PENDING' })
    .first();
  await mutate(admin, 'post', `/events/${eventId}/applications/${pending.id}/approve`);
  await mutate(admin, 'post', `/events/${eventId}/crew`, { crew_ids: [crewAId] }, 409);
});
test('new-account event intent persists and account approval does not assign crew', async () => {
  const newcomer = await agent();
  await mutate(newcomer, 'post', '/auth/register', {
    username: 'newcrew',
    full_name: 'New Crew',
    email: 'new@example.test',
    phone: '54321',
    password: secret,
    confirm_password: secret,
    registration_token: regToken,
  });
  const u = await db('users').where({ username: 'newcrew' }).first();
  const application = await db('event_registrations')
    .where({ crew_id: u.id, event_id: eventId })
    .first();
  assert.equal(application.application_status, 'PENDING');
  await mutate(admin, 'post', `/events/${eventId}/applications/${application.id}/approve`, {}, 422);
  await mutate(admin, 'post', `/crew/${u.id}/approve`);
  assert.equal(
    (await db('event_assignments').where({ crew_id: u.id, event_id: eventId })).length,
    0,
  );
  await mutate(admin, 'put', `/events/${eventId}/registration-settings`, {
    is_enabled: false,
    quota: 3,
    public_description: 'Closed',
  });
  await signIn(newcomer, 'newcrew');
  await mutate(newcomer, 'post', `/public/events/${regToken}/apply`, {}, 409);
});
test('shared link supports isolated sessions, multiple crew and immutable submissions', async () => {
  evalToken = (await mutate(admin, 'post', `/events/${eventId}/evaluation-link`)).token;
  await request(app).get('/api/public/evaluation/tampered').expect(410);
  externalA = await agent();
  externalB = await agent();
  await mutate(externalA, 'post', `/public/evaluation/${evalToken}/session`, {
    evaluator_name: 'Bright',
    evaluator_description: 'PIC Lapangan',
  });
  await mutate(externalB, 'post', `/public/evaluation/${evalToken}/session`, {
    evaluator_name: 'Second evaluator',
    evaluator_description: 'Client',
  });
  const progress = (await externalA.get('/api/external-evaluation/session').expect(200)).body.data;
  assert.equal(progress.crew.length, 2);
  assert(!JSON.stringify(progress.crew).includes('email'));
  criteria = progress.criteria;
  const body = {
    scores: criteria.map((c) => ({ event_criterion_id: c.id, score: 4 })),
    feedback: 'Good work — Bright',
  };
  await mutate(externalA, 'post', `/external-evaluation/crew/${crewAId}/draft`, body);
  evaluationId = (
    await mutate(externalA, 'post', `/external-evaluation/crew/${crewAId}/submit`, body)
  ).id;
  await mutate(externalA, 'post', `/external-evaluation/crew/${crewAId}/submit`, body, 409);
  await mutate(externalA, 'post', `/external-evaluation/crew/${crewBId}/submit`, body);
  assert.equal(
    (await externalB.get('/api/external-evaluation/session')).body.data.evaluations.length,
    0,
  );
  await mutate(externalB, 'post', `/external-evaluation/crew/${crewAId}/submit`, {
    ...body,
    scores: criteria.map((c) => ({ event_criterion_id: c.id, score: 5 })),
  });
  await externalA.get('/api/admin/dashboard').expect(401);
  await mutate(externalA, 'post', `/external-evaluation/crew/${adminId}/submit`, body, 422);
});
test('publication, internal evaluation, anonymous output and completed-event filtering', async () => {
  const internal = await mutate(admin, 'post', `/events/${eventId}/evaluations`, {
    crew_id: crewAId,
    scores: criteria.map((c) => ({ event_criterion_id: c.id, score: 3 })),
    feedback: 'Private admin name',
    submit: true,
  });
  const rows = await db('evaluations').where({ event_id: eventId, crew_id: crewAId });
  for (const v of rows)
    await mutate(admin, 'post', `/evaluations/${v.id}/publish`, {
      feedback_public: 'Helpful, anonymous feedback',
    });
  assert.equal((await crewA.get('/api/me/performance')).body.data.overall_score, null);
  await mutate(admin, 'patch', `/events/${eventId}`, {
    name: 'GAW 2026',
    location: 'Jakarta',
    start_date: '2026-01-01',
    end_date: '2026-01-02',
    status: 'COMPLETED',
  });
  const p = (await crewA.get('/api/me/performance').expect(200)).body.data;
  assert.equal(p.overall_score, 4);
  for (const forbidden of [
    'Bright',
    'evaluator_name',
    'external_session_id',
    'admin_evaluator_id',
    'feedback_original',
    'Private admin',
  ])
    assert(!JSON.stringify(p).includes(forbidden));
  await mutate(admin, 'post', `/evaluations/${internal.id}/unpublish`);
  assert.equal((await crewA.get('/api/me/performance')).body.data.overall_score, 4.5);
  await mutate(admin, 'post', `/evaluations/${evaluationId}/unpublish`);
  await mutate(admin, 'post', `/evaluations/${evaluationId}/reopen`);
  const body = {
    scores: criteria.map((c) => ({ event_criterion_id: c.id, score: 5 })),
    feedback: 'Corrected',
  };
  await mutate(externalA, 'post', `/external-evaluation/crew/${crewAId}/submit`, body);
  await mutate(admin, 'post', `/evaluations/${evaluationId}/publish`, {
    feedback_public: 'Corrected',
  });
  assert.equal((await crewA.get('/api/me/performance')).body.data.overall_score, 5);
});
test('exports are valid and contain derived values without secrets', async () => {
  const csv = await admin.get('/api/admin/reports/performance?format=csv').expect(200);
  assert(csv.text.includes('Andi'));
  assert(!csv.text.includes('password'));
  const binary = await admin
    .get('/api/admin/reports/performance?format=xlsx')
    .buffer(true)
    .parse((res, done) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => done(null, Buffer.concat(chunks)));
    })
    .expect(200);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(binary.body);
  assert(book.getWorksheet(1).rowCount >= 2);
});
test('token rotation, expiration, revocation and password reset invalidate access', async () => {
  const rotated = (await mutate(admin, 'post', `/events/${eventId}/evaluation-link`)).token;
  await request(app)
    .get('/api/public/evaluation/' + evalToken)
    .expect(410);
  await externalA.get('/api/external-evaluation/session').expect(401);
  await db('event_evaluation_links')
    .where({ event_id: eventId })
    .update({ expires_at: new Date('2020-01-01') });
  await request(app)
    .get('/api/public/evaluation/' + rotated)
    .expect(410);
  await mutate(admin, 'delete', `/events/${eventId}/evaluation-link`);
  await request(app)
    .get('/api/public/evaluation/' + rotated)
    .expect(410);
  await mutate(admin, 'post', `/crew/${crewAId}/reset-password`, {
    password: 'ReplacementPassword123!',
  });
  await crewA.get('/api/me/performance').expect(401);
  await mutate(crewB, 'post', '/auth/logout');
  await crewB.get('/api/me/performance').expect(401);
  await mutate(admin, 'delete', `/events/${eventId}`);
  await admin.get(`/api/events/${eventId}`).expect(404);
  assert((await db('evaluations').where({ event_id: eventId })).length > 0);
  assert((await db('audit_logs')).length > 10);
  const secretLeak = JSON.stringify(await db('audit_logs'));
  assert(!secretLeak.includes(secret));
  assert(!secretLeak.includes(evalToken));
});

test('organization settings and skill changes persist with referential integrity', async () => {
  await mutate(admin, 'patch', '/admin/settings', {
    organization_name: 'Abracodebra Test',
    support_email: 'ops@example.test',
  });
  const settings = (await admin.get('/api/admin/settings').expect(200)).body.data;
  assert.equal(settings.organization_name, 'Abracodebra Test');
  assert.equal(settings.support_email, 'ops@example.test');
  const skill = await mutate(admin, 'post', '/skills', { name: 'TouchDesigner' });
  await mutate(admin, 'put', `/crew/${crewBId}/skills`, { skill_ids: [skill.id] });
  await mutate(admin, 'delete', `/skills/${skill.id}`, {}, 409);
  await mutate(admin, 'patch', `/skills/${skill.id}`, { name: 'TouchDesigner Advanced' });
  const profile = (await admin.get(`/api/crew/${crewBId}`).expect(200)).body.data;
  assert.equal(profile.skills[0].name, 'TouchDesigner Advanced');
  await mutate(admin, 'put', `/crew/${crewBId}/skills`, { skill_ids: [] });
  await mutate(admin, 'delete', `/skills/${skill.id}`);
});
