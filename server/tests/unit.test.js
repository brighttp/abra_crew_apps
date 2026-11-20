import test from 'node:test';
import assert from 'node:assert/strict';
import session from 'express-session';
import request from 'supertest';
import ExcelJS from 'exceljs';
import { calculate } from '../src/services/performance.service.js';
import { crewPerformance } from '../src/serializers/crewPerformance.serializer.js';
import { validateScores } from '../src/services/evaluation.service.js';
import { hash, token, equal, safeCell } from '../src/utils/core.js';
import { password, scoring, event } from '../src/utils/validation.js';
import { createApp } from '../src/app.js';
import { up, down } from '../database/migrations/001_initial.js';
import knex from 'knex';
const row = (event_id, evaluation_id, criterion_id, score, extra = {}) => ({
  event_id,
  evaluation_id,
  criterion_id,
  score,
  event_name: 'Event ' + event_id,
  end_date: '2026-01-01',
  criterion_name: 'Category ' + criterion_id,
  status: 'PUBLISHED',
  event_status: 'COMPLETED',
  feedback_public: 'Helpful work',
  ...extra,
});
test('individual evaluation is the mean of its raw criterion scores', () => {
  assert.equal(calculate([row(1, 1, 1, 4), row(1, 1, 2, 5)]).overall_score, 4.5);
});
test('multiple evaluator means form the event mean', () => {
  assert.equal(
    calculate([row(1, 1, 1, 4), row(1, 1, 2, 5), row(1, 2, 1, 5), row(1, 2, 2, 5)]).history[0]
      .score,
    4.75,
  );
});
test('events have equal weight regardless of evaluator count', () => {
  const p = calculate([row(1, 1, 1, 1), row(2, 2, 1, 5), row(2, 3, 1, 5), row(2, 4, 1, 5)]);
  assert.equal(p.overall_score, 3);
  assert.equal(p.eligible_events, 2);
  assert.equal(p.published_evaluations, 4);
});
test('categories average within each event before averaging events', () => {
  const p = calculate([row(1, 1, 1, 1), row(2, 2, 1, 5), row(2, 3, 1, 5), row(2, 2, 2, 4)]);
  assert.equal(p.categories[0].score, 3);
  assert.equal(p.categories[1].score, 4);
});
test('unpublished evaluations and incomplete events never contribute', () => {
  const p = calculate([
    row(1, 1, 1, 1, { status: 'SUBMITTED' }),
    row(2, 2, 1, 2, { event_status: 'ONGOING' }),
    row(3, 3, 1, 5),
  ]);
  assert.equal(p.overall_score, 5);
  assert.equal(p.eligible_events, 1);
});
test('missing data returns null rather than zero', () => {
  const p = calculate([]);
  assert.equal(p.overall_score, null);
  assert.deepEqual(p.history, []);
  assert.deepEqual(p.categories, []);
});
test('publication and completion changes recalculate without stale caches', () => {
  const rows = [row(1, 1, 1, 5)];
  assert.equal(calculate(rows).overall_score, 5);
  rows[0].status = 'SUBMITTED';
  assert.equal(calculate(rows).overall_score, null);
  rows[0].status = 'PUBLISHED';
  rows[0].event_status = 'ONGOING';
  assert.equal(calculate(rows).overall_score, null);
});
test('crew serializer drops identities and stable evaluation identifiers', () => {
  const p = calculate([
    row(1, 987, 1, 5, { evaluator_name: 'Secret evaluator', external_session_id: 123 }),
  ]);
  p.evaluator_name = 'Hidden';
  p.history[0].evaluator_name = 'Hidden';
  p.history[0].feedback[0].evaluation_id = 987;
  const serialized = JSON.stringify(crewPerformance(p));
  assert(!serialized.includes('Hidden'));
  assert(!serialized.includes('evaluator'));
  assert(!serialized.includes('987'));
  assert.deepEqual(JSON.parse(serialized).history[0].feedback, [{ text: 'Helpful work' }]);
});
test('anonymous feedback is emitted once per evaluation, not criterion', () => {
  assert.equal(calculate([row(1, 1, 1, 4), row(1, 1, 2, 5)]).history[0].feedback.length, 1);
});
test('score validation requires exact criteria with unique integer ratings', () => {
  const criteria = [{ id: 1 }, { id: 2 }];
  assert.throws(() =>
    validateScores(criteria, {
      scores: [
        { event_criterion_id: 1, score: 5 },
        { event_criterion_id: 1, score: 4 },
      ],
    }),
  );
  assert.throws(() => validateScores(criteria, { scores: [{ event_criterion_id: 1, score: 5 }] }));
  assert.throws(() => scoring.parse({ scores: [{ event_criterion_id: 1, score: 1.5 }] }));
  assert.throws(() => scoring.parse({ scores: [{ event_criterion_id: 1, score: 6 }] }));
  validateScores(
    criteria,
    scoring.parse({
      scores: [
        { event_criterion_id: 1, score: 5 },
        { event_criterion_id: 2, score: 1 },
      ],
    }),
  );
});
test('password minimum length and bcrypt byte limit are enforced', () => {
  assert.throws(() => password.parse('weak'));
  assert.throws(() => password.parse('abcdefg'));
  password.parse('abcdefgh');
  password.parse('12345678');
  password.parse('alllowercase12345');
  password.parse('a'.repeat(72));
  assert.throws(() => password.parse('a'.repeat(73)));
  assert.throws(() => password.parse('A1' + 'é'.repeat(40)));
  password.parse('StrongPassword123');
});
test('invalid event date order is rejected', () => {
  assert.throws(() =>
    event.parse({
      name: 'Test',
      location: 'Jakarta',
      start_date: '2026-02-01',
      end_date: '2026-01-01',
    }),
  );
});
test('tokens are unpredictable and stored as hashes', () => {
  const a = token(),
    b = token();
  assert.notEqual(a, b);
  assert.equal(hash(a).length, 64);
  assert.notEqual(hash(a), hash(b));
  assert(equal(a, a));
  assert(!equal(a, b));
  assert(!equal(a, null));
});
test('spreadsheet formula injection is neutralized', () => {
  for (const value of ['=1+1', '+CMD', '-CMD', '@SUM', '\tFORMULA', '\nFORMULA'])
    assert(safeCell(value).startsWith("'"));
  assert.equal(safeCell('ordinary'), 'ordinary');
});
test('ExcelJS with patched UUID dependency generates a readable XLSX', async () => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Performance');
  sheet.addRow(['Crew', 'Score']);
  sheet.addRow(['Andi', 4.75]);
  sheet.addConditionalFormatting({
    ref: 'B2',
    rules: [
      { type: 'dataBar', cfvo: [{ type: 'min' }, { type: 'max' }], color: { argb: 'FFD8F56A' } },
    ],
  });
  const bytes = await book.xlsx.writeBuffer();
  const loaded = new ExcelJS.Workbook();
  await loaded.xlsx.load(bytes);
  assert.equal(loaded.getWorksheet(1).getCell('B2').value, 4.75);
});
test('unauthenticated APIs, exports and CSRF are protected without database access', async () => {
  process.env.SESSION_SECRET = 'unit-test-session-secret-at-least-32-characters';
  process.env.APP_ORIGIN = 'http://localhost:5173';
  const app = createApp({ store: new session.MemoryStore() });
  const agent = request.agent(app);
  const me = await agent.get('/api/auth/me').expect(200);
  assert.equal(me.body.data.user, null);
  assert.equal(me.headers['cache-control'], 'no-store');
  assert.equal(me.headers['referrer-policy'], 'no-referrer');
  for (const path of [
    '/api/crew',
    '/api/events',
    '/api/admin/dashboard',
    '/api/admin/reports/performance',
    '/api/evaluations/1',
    '/api/me/performance',
  ])
    await agent.get(path).expect(401);
  await agent.post('/api/auth/login').send({}).expect(403);
  await agent
    .post('/api/auth/login')
    .set('X-CSRF-Token', me.body.data.csrfToken)
    .set('Origin', 'https://attacker.example')
    .send({})
    .expect(403);
  await agent
    .post('/api/auth/login')
    .set('X-CSRF-Token', me.body.data.csrfToken)
    .send({})
    .expect(422);
  await agent.get('/api/external-evaluation/session').expect(401);
  await agent.post('/api/auth/logout').set('X-CSRF-Token', me.body.data.csrfToken).expect(200);
  await agent.post('/api/auth/logout').set('X-CSRF-Token', me.body.data.csrfToken).expect(403);
});

test('all migration statements and rollback compile for MySQL', async () => {
  const compiler = knex({ client: 'mysql2' });
  const sql = [];
  const collect = (builder) => {
    sql.push(...builder.toSQL().map((s) => s.sql));
    return Promise.resolve();
  };
  const stub = (table) => ({
    insert: (data) => {
      sql.push(compiler(table).insert(data).toSQL().sql);
      return Promise.resolve();
    },
  });
  stub.fn = compiler.fn;
  stub.raw = (statement) => {
    sql.push(statement);
    return Promise.resolve();
  };
  stub.schema = {
    createTable: (name, callback) => collect(compiler.schema.createTable(name, callback)),
    alterTable: (name, callback) => collect(compiler.schema.alterTable(name, callback)),
    dropTableIfExists: (name) => collect(compiler.schema.dropTableIfExists(name)),
  };
  await up(stub);
  assert.equal(sql.filter((s) => s.startsWith('create table')).length, 17);
  assert(sql.some((s) => s.includes('valid_score CHECK')));
  assert(sql.some((s) => s.includes('evaluation_actor CHECK')));
  await down(stub);
  assert.equal(sql.filter((s) => s.startsWith('drop table')).length, 17);
  await compiler.destroy();
});

test('client obtains a fresh CSRF token after logout before the next login', async (t) => {
  const { api: clientApi } = await import('../../client/src/services/api.js');
  let sessionNumber = 0;
  const mutations = [];
  t.mock.method(globalThis, 'fetch', async (path, options = {}) => {
    if (path === '/api/auth/me')
      return {
        ok: true,
        json: async () => ({ data: { csrfToken: 'session-' + ++sessionNumber } }),
      };
    mutations.push({ path, csrf: options.headers['X-CSRF-Token'] });
    return { ok: true, json: async () => ({ data: { ok: true } }) };
  });
  await clientApi('/auth/logout', { method: 'POST', body: {} });
  await clientApi('/auth/login', { method: 'POST', body: { username: 'test', password: 'test' } });
  assert.deepEqual(mutations, [
    { path: '/api/auth/logout', csrf: 'session-1' },
    { path: '/api/auth/login', csrf: 'session-2' },
  ]);
});
