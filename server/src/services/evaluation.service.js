import { db } from '../config/database.js';
import { assert, audit, hash, token, now } from '../utils/core.js';
import { scoring, z, text, criterion } from '../utils/validation.js';
import { lockEvent } from './registration.service.js';
export async function snapshot(trx, eventId, ids) {
  let rows = await trx('event_evaluation_criteria')
    .where({ event_id: eventId })
    .orderBy('display_order');
  if (ids) {
    assert(
      !(await trx('evaluations').where({ event_id: eventId }).first()),
      409,
      'Criteria are locked once an evaluation exists',
    );
    await trx('event_evaluation_criteria').where({ event_id: eventId }).delete();
    rows = [];
  }
  if (!rows.length) {
    let query = trx('evaluation_criteria').where({ is_active: true });
    if (ids) query = query.whereIn('id', ids);
    const criteria = await query.orderBy('id');
    assert(
      criteria.length && (!ids || criteria.length === new Set(ids).size),
      422,
      'Select valid active criteria',
    );
    await trx('event_evaluation_criteria').insert(
      criteria.map((c, i) => ({
        event_id: eventId,
        criterion_id: c.id,
        criterion_name_snapshot: c.name,
        criterion_description_snapshot: c.description,
        display_order: i,
      })),
    );
    rows = await trx('event_evaluation_criteria')
      .where({ event_id: eventId })
      .orderBy('display_order');
  }
  return rows;
}
export async function criteria(eventId, ids, actor) {
  return db.transaction(async (trx) => {
    await lockEvent(trx, eventId);
    const rows = await snapshot(trx, eventId, ids);
    if (ids) await audit(trx, actor, 'EVENT_CRITERIA_UPDATED', 'event', eventId);
    return rows;
  });
}
export async function saveCriterion(id, body, actor) {
  const data = criterion.parse(body);
  return db.transaction(async (trx) => {
    if (id)
      assert(
        await trx('evaluation_criteria')
          .where({ id })
          .update({ ...data, updated_at: now() }),
        404,
        'Criterion not found',
      );
    else [id] = await trx('evaluation_criteria').insert(data);
    await audit(trx, actor, 'CRITERION_SAVED', 'criterion', id);
    return { id };
  });
}
export async function link(eventId, expires, actor) {
  const raw = token();
  await db.transaction(async (trx) => {
    await lockEvent(trx, eventId);
    await snapshot(trx, eventId);
    await trx('external_evaluator_sessions')
      .where({ event_id: eventId })
      .whereNull('revoked_at')
      .update({ revoked_at: now() });
    const data = {
      event_id: eventId,
      token_hash: hash(raw),
      is_active: true,
      expires_at: expires ? new Date(expires) : null,
      created_by: actor.user.id,
      created_at: now(),
      revoked_at: null,
    };
    await trx('event_evaluation_links').insert(data).onConflict('event_id').merge(data);
    await audit(trx, actor, 'EVALUATION_LINK_CREATED', 'event', eventId);
  });
  return { token: raw };
}
export async function revoke(eventId, actor) {
  await db.transaction(async (trx) => {
    await lockEvent(trx, eventId);
    await trx('event_evaluation_links')
      .where({ event_id: eventId })
      .update({ is_active: false, revoked_at: now() });
    await trx('external_evaluator_sessions')
      .where({ event_id: eventId })
      .update({ revoked_at: now() });
    await audit(trx, actor, 'EVALUATION_LINK_REVOKED', 'event', eventId);
  });
}
function live(row) {
  assert(row && row.is_active && !row.revoked_at, 410, 'Evaluation link is invalid or revoked');
  assert(
    !row.expires_at || new Date(row.expires_at + 'Z') > now(),
    410,
    'Evaluation link has expired',
  );
}
export async function publicLink(raw) {
  const row = await db('event_evaluation_links')
    .where({ token_hash: hash(raw) })
    .first();
  live(row);
  const event = await db('events')
    .where({ id: row.event_id })
    .whereNull('deleted_at')
    .first('id', 'name', 'start_date', 'end_date', 'location');
  assert(event, 410, 'Event is unavailable');
  return { event };
}
export async function startSession(raw, body, req) {
  const data = z.object({ evaluator_name: text, evaluator_description: text }).parse(body);
  const sessionToken = token();
  const result = await db.transaction(async (trx) => {
    const initial = await trx('event_evaluation_links')
      .where({ token_hash: hash(raw) })
      .first();
    live(initial);
    await lockEvent(trx, initial.event_id);
    const row = await trx('event_evaluation_links')
      .where({ id: initial.id, token_hash: hash(raw) })
      .forUpdate()
      .first();
    live(row);
    const [id] = await trx('external_evaluator_sessions').insert({
      ...data,
      event_id: row.event_id,
      evaluation_link_id: row.id,
      session_token_hash: hash(sessionToken),
    });
    await audit(
      trx,
      { external: true, ip: req.ip },
      'EVALUATOR_SESSION_CREATED',
      'external_session',
      id,
    );
    return { event_id: row.event_id };
  });
  req.session.externalToken = sessionToken;
  return result;
}
export async function external(req, trx = db) {
  assert(req.session.externalToken, 401, 'Start an evaluator session first');
  const s = await trx('external_evaluator_sessions')
    .where({ session_token_hash: hash(req.session.externalToken) })
    .whereNull('revoked_at')
    .first();
  assert(s, 401, 'Evaluator session expired or revoked');
  const l = await trx('event_evaluation_links').where({ id: s.evaluation_link_id }).first();
  live(l);
  assert(
    await trx('events').where({ id: s.event_id }).whereNull('deleted_at').first(),
    410,
    'Event is unavailable',
  );
  return s;
}
export async function progress(req) {
  const s = await external(req);
  const crew = await db('event_assignments as a')
    .join('crew_profiles as p', 'p.user_id', 'a.crew_id')
    .where('a.event_id', s.event_id)
    .select('a.crew_id as id', 'p.full_name');
  const evaluations = await db('evaluations')
    .where({ external_session_id: s.id, event_id: s.event_id })
    .select('id', 'crew_id', 'status', 'feedback_original');
  for (const v of evaluations)
    v.scores = await db('evaluation_scores')
      .where({ evaluation_id: v.id })
      .select('event_criterion_id', 'score');
  await db('external_evaluator_sessions').where({ id: s.id }).update({ last_active_at: now() });
  return {
    event: await db('events').where({ id: s.event_id }).first('id', 'name'),
    evaluator_name: s.evaluator_name,
    crew,
    evaluations,
    criteria: await db('event_evaluation_criteria')
      .where({ event_id: s.event_id })
      .orderBy('display_order'),
  };
}
export function validateScores(criteria, data) {
  const expected = new Set(criteria.map((c) => c.id));
  assert(
    data.scores.length === expected.size &&
      new Set(data.scores.map((s) => s.event_criterion_id)).size === expected.size &&
      data.scores.every((s) => expected.has(s.event_criterion_id)),
    422,
    'Provide exactly one score for every event criterion',
  );
}
async function saveWithin(trx, eventId, crewId, data, actor, submit, externalSession) {
  await lockEvent(trx, eventId);
  assert(
    await trx('event_assignments').where({ event_id: eventId, crew_id: crewId }).first(),
    422,
    'Crew is not assigned to this event',
  );
  const criteria = await snapshot(trx, eventId);
  validateScores(criteria, data);
  const owner = externalSession
    ? { external_session_id: externalSession.id }
    : { admin_evaluator_id: actor.user.id };
  let existing = await trx('evaluations')
    .where({ event_id: eventId, crew_id: crewId, ...owner })
    .forUpdate()
    .first();
  assert(!existing || existing.status === 'DRAFT', 409, 'Evaluation has already been submitted');
  let id = existing?.id;
  const values = {
    event_id: eventId,
    crew_id: crewId,
    evaluator_type: externalSession ? 'EXTERNAL' : 'ADMIN',
    ...owner,
    status: submit ? 'SUBMITTED' : 'DRAFT',
    feedback_original: data.feedback,
    feedback_public: null,
    submitted_at: submit ? now() : null,
    updated_at: now(),
  };
  if (id) await trx('evaluations').where({ id }).update(values);
  else [id] = await trx('evaluations').insert(values);
  await trx('evaluation_scores').where({ evaluation_id: id }).delete();
  await trx('evaluation_scores').insert(data.scores.map((s) => ({ ...s, evaluation_id: id })));
  await audit(
    trx,
    actor,
    submit ? 'EVALUATION_SUBMITTED' : 'EVALUATION_DRAFT_SAVED',
    'evaluation',
    id,
  );
  return { id };
}
export async function saveAdmin(eventId, crewId, body, actor, submit = false) {
  const data = scoring.parse(body);
  return db.transaction((trx) => saveWithin(trx, eventId, crewId, data, actor, submit));
}
export async function saveExternal(crewId, body, req, submit) {
  const data = scoring.parse(body);
  return db.transaction(async (trx) => {
    let s = await external(req);
    await lockEvent(trx, s.event_id);
    s = await external(req, trx);
    return saveWithin(trx, s.event_id, crewId, data, { external: true, ip: req.ip }, submit, s);
  });
}
export async function detail(id) {
  const v = await db('evaluations as v')
    .leftJoin('external_evaluator_sessions as s', 's.id', 'v.external_session_id')
    .leftJoin('crew_profiles as a', 'a.user_id', 'v.admin_evaluator_id')
    .join('crew_profiles as p', 'p.user_id', 'v.crew_id')
    .join('events as e', 'e.id', 'v.event_id')
    .where('v.id', id)
    .select(
      'v.*',
      's.evaluator_name',
      's.evaluator_description',
      'a.full_name as admin_name',
      'p.full_name as crew_name',
      'e.name as event_name',
    )
    .first();
  assert(v, 404, 'Evaluation not found');
  v.scores = await db('evaluation_scores as s')
    .join('event_evaluation_criteria as c', 'c.id', 's.event_criterion_id')
    .where('s.evaluation_id', id)
    .select('s.event_criterion_id', 's.score', 'c.criterion_name_snapshot as name');
  return v;
}
export async function list(eventId) {
  const q = db('evaluations as v')
    .join('crew_profiles as p', 'p.user_id', 'v.crew_id')
    .join('events as e', 'e.id', 'v.event_id')
    .leftJoin('external_evaluator_sessions as s', 's.id', 'v.external_session_id')
    .leftJoin('crew_profiles as a', 'a.user_id', 'v.admin_evaluator_id')
    .select(
      'v.id',
      'v.event_id',
      'v.crew_id',
      'v.status',
      'v.evaluator_type',
      'v.admin_evaluator_id',
      'v.created_at',
      'p.full_name as crew_name',
      'e.name as event_name',
      's.evaluator_name',
      'a.full_name as admin_name',
    )
    .orderBy('v.created_at', 'desc');
  if (eventId) q.where('v.event_id', eventId);
  return q;
}
export async function transition(id, action, body, actor) {
  return db.transaction(async (trx) => {
    const initial = await trx('evaluations').where({ id }).first();
    assert(initial, 404, 'Evaluation not found');
    await lockEvent(trx, initial.event_id);
    const v = await trx('evaluations').where({ id }).forUpdate().first();
    let update;
    if (action === 'publish') {
      assert(v.status === 'SUBMITTED', 409, 'Only submitted evaluations can be published');
      const { feedback_public } = z.object({ feedback_public: z.string().max(5000) }).parse(body);
      update = {
        status: 'PUBLISHED',
        feedback_public,
        published_at: now(),
        published_by: actor.user.id,
      };
    } else if (action === 'unpublish') {
      assert(v.status === 'PUBLISHED', 409, 'Evaluation is not published');
      update = {
        status: 'SUBMITTED',
        feedback_public: null,
        published_at: null,
        published_by: null,
      };
    } else if (action === 'reopen') {
      assert(v.status === 'SUBMITTED', 409, 'Unpublish the evaluation before reopening it');
      update = { status: 'DRAFT', submitted_at: null, feedback_public: null };
    } else {
      assert(
        v.status === 'DRAFT' && v.admin_evaluator_id === actor.user.id,
        403,
        'Only the author can submit this draft',
      );
      update = { status: 'SUBMITTED', submitted_at: now() };
    }
    await trx('evaluations')
      .where({ id })
      .update({ ...update, updated_at: now() });
    await audit(trx, actor, `EVALUATION_${action.toUpperCase()}`, 'evaluation', id, {
      previous_status: v.status,
    });
  });
}
export async function edit(id, body, actor) {
  const v = await detail(id);
  assert(v.admin_evaluator_id === actor.user.id, 403, 'Only the author can edit this evaluation');
  return saveAdmin(v.event_id, v.crew_id, body, actor);
}
