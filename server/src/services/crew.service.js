import bcrypt from 'bcryptjs';
import { db } from '../config/database.js';
import { crew, profile, password, z, text } from '../utils/validation.js';
import { assert, audit, now, pageOf } from '../utils/core.js';
import { performance, overallScoreQuery } from './performance.service.js';
import { crewPerformance } from '../serializers/crewPerformance.serializer.js';
export const baseCrew = () =>
  db('users as u')
    .join('crew_profiles as p', 'p.user_id', 'u.id')
    .where('u.account_role', 'CREW')
    .whereNull('u.deleted_at');
export async function detail(id) {
  const u = await baseCrew()
    .where('u.id', id)
    .select(
      'u.id',
      'u.username',
      'u.email',
      'u.approval_state',
      'p.full_name',
      'p.phone',
      'p.profile_photo_path',
    )
    .first();
  assert(u, 404, 'Crew not found');
  u.skills = await db('crew_skills as cs')
    .join('skills as s', 's.id', 'cs.skill_id')
    .where('cs.crew_id', id)
    .select('s.id', 's.name');
  u.events = await db('event_assignments as a')
    .join('events as e', 'e.id', 'a.event_id')
    .where('a.crew_id', id)
    .select('e.id', 'e.name', 'e.status', 'e.start_date', 'e.end_date', 'e.location')
    .orderBy('e.start_date', 'desc');
  u.performance = crewPerformance(await performance(id));
  return u;
}
export async function list(filters = {}, pending = false) {
  const { page, limit } = pageOf(filters);
  const q = baseCrew().where('u.approval_state', pending ? 'PENDING' : 'APPROVED');
  if (filters.search)
    q.where((b) =>
      b
        .where('p.full_name', 'like', `%${String(filters.search).slice(0, 100)}%`)
        .orWhere('u.username', 'like', `%${String(filters.search).slice(0, 100)}%`),
    );
  if (filters.skill_id)
    q.whereExists(
      db('crew_skills').select('id').whereRaw('crew_id = u.id').where('skill_id', filters.skill_id),
    );
  const [{ total }] = await q.clone().count({ total: 'u.id' });
  const overall = overallScoreQuery();
  const items = await q
    .leftJoin(overall.as('perf'), 'perf.crew_id', 'u.id')
    .select(
      'u.id',
      'u.username',
      'u.approval_state',
      'p.full_name',
      'p.profile_photo_path',
      'perf.overall_score',
      db.raw('(SELECT COUNT(*) FROM event_assignments a WHERE a.crew_id = u.id) AS total_events'),
    )
    .orderBy(
      filters.sort === 'rating'
        ? 'perf.overall_score'
        : filters.sort === 'events'
          ? 'total_events'
          : 'p.full_name',
      filters.sort === 'name' || !filters.sort ? 'asc' : 'desc',
    )
    .limit(limit)
    .offset((page - 1) * limit);
  for (const item of items)
    item.skills = await db('crew_skills as cs')
      .join('skills as s', 's.id', 'cs.skill_id')
      .where('cs.crew_id', item.id)
      .select('s.id', 's.name');
  return { items, total: Number(total), page, limit };
}
export async function create(body, actor) {
  const data = crew.parse(body);
  return db.transaction(async (trx) => {
    const [id] = await trx('users').insert({
      username: data.username,
      email: data.email,
      password_hash: await bcrypt.hash(data.password, 12),
      account_role: 'CREW',
      approval_state: 'APPROVED',
      approved_at: now(),
      approved_by: actor.user.id,
    });
    await trx('crew_profiles').insert({
      user_id: id,
      full_name: data.full_name,
      phone: data.phone,
    });
    await audit(trx, actor, 'CREW_CREATED', 'user', id);
    return { id };
  });
}
export async function update(id, body, actor) {
  const data = profile.parse(body);
  return db.transaction(async (trx) => {
    assert(
      await trx('users').where({ id, account_role: 'CREW' }).whereNull('deleted_at').first(),
      404,
      'Crew not found',
    );
    await trx('users').where({ id }).update({ email: data.email, updated_at: now() });
    await trx('crew_profiles')
      .where({ user_id: id })
      .update({ full_name: data.full_name, phone: data.phone, updated_at: now() });
    await audit(trx, actor, 'CREW_UPDATED', 'user', id);
  });
}
export async function archive(id, actor) {
  return db.transaction(async (trx) => {
    assert(
      await trx('users').where({ id, account_role: 'CREW' }).whereNull('deleted_at').first(),
      404,
      'Crew not found',
    );
    await trx('users')
      .where({ id })
      .update({ deleted_at: now(), session_version: trx.raw('session_version + 1') });
    await audit(trx, actor, 'CREW_ARCHIVED', 'user', id);
  });
}
export async function approve(id, approved, actor) {
  return db.transaction(async (trx) => {
    const count = await trx('users')
      .where({ id, account_role: 'CREW', approval_state: 'PENDING' })
      .whereNull('deleted_at')
      .update({
        approval_state: approved ? 'APPROVED' : 'REJECTED',
        approved_by: actor.user.id,
        approved_at: now(),
        updated_at: now(),
      });
    assert(count, 409, 'Account is no longer pending approval');
    await audit(trx, actor, approved ? 'ACCOUNT_APPROVED' : 'ACCOUNT_REJECTED', 'user', id);
  });
}
export async function resetPassword(id, body, actor) {
  const data = z.object({ password }).parse(body);
  const password_hash = await bcrypt.hash(data.password, 12);
  return db.transaction(async (trx) => {
    assert(
      await trx('users').where({ id, account_role: 'CREW' }).whereNull('deleted_at').first(),
      404,
      'Crew not found',
    );
    await trx('users')
      .where({ id })
      .update({
        password_hash,
        session_version: trx.raw('session_version + 1'),
        updated_at: now(),
      });
    await audit(trx, actor, 'PASSWORD_RESET', 'user', id);
  });
}
export async function setSkills(id, ids, actor) {
  return db.transaction(async (trx) => {
    assert(
      await trx('users')
        .where({ id, account_role: 'CREW' })
        .whereNull('deleted_at')
        .forUpdate()
        .first(),
      404,
      'Crew not found',
    );
    assert(
      (await trx('skills').whereIn('id', ids)).length === new Set(ids).size,
      422,
      'Unknown skill',
    );
    await trx('crew_skills').where({ crew_id: id }).delete();
    if (ids.length)
      await trx('crew_skills').insert(
        [...new Set(ids)].map((skill_id) => ({ crew_id: id, skill_id })),
      );
    await audit(trx, actor, 'CREW_SKILLS_UPDATED', 'user', id, { skill_ids: ids });
  });
}
export async function saveSkill(id, body, actor) {
  const { name } = z.object({ name: text }).parse(body);
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  assert(slug, 422, 'Skill name must include letters or numbers');
  return db.transaction(async (trx) => {
    if (id) {
      assert(
        await trx('skills').where({ id }).update({ name, slug, updated_at: now() }),
        404,
        'Skill not found',
      );
    } else [id] = await trx('skills').insert({ name, slug });
    await audit(trx, actor, 'SKILL_SAVED', 'skill', id);
    return { id };
  });
}
