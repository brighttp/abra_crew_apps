import { db } from '../config/database.js';
import { event } from '../utils/validation.js';
import { assert, audit, now, pageOf } from '../utils/core.js';
import { lockEvent, availability } from './registration.service.js';
export async function calendar(filters, crewId) {
  const q = db('events as e')
    .whereNull('e.deleted_at')
    .where('e.start_date', '<=', filters.to)
    .where('e.end_date', '>=', filters.from);
  if (crewId)
    q.whereExists(
      db('event_assignments').select('id').whereRaw('event_id = e.id').where('crew_id', crewId),
    );
  return q
    .select('e.id', 'e.name', 'e.start_date', 'e.end_date', 'e.status')
    .orderBy('e.start_date')
    .orderBy('e.id');
}
export async function list(filters = {}, crewId) {
  const { page, limit } = pageOf(filters);
  const q = db('events as e').whereNull('e.deleted_at');
  if (crewId)
    q.whereExists(
      db('event_assignments').select('id').whereRaw('event_id = e.id').where('crew_id', crewId),
    );
  if (filters.search) q.where('e.name', 'like', `%${String(filters.search).slice(0, 100)}%`);
  if (filters.status) q.where('e.status', filters.status);
  const [{ total }] = await q.clone().count({ total: 'e.id' });
  const items = await q
    .select(
      'e.*',
      db.raw('(SELECT COUNT(*) FROM event_assignments a WHERE a.event_id = e.id) AS crew_count'),
      db.raw(
        "(SELECT COUNT(DISTINCT v.crew_id) FROM evaluations v WHERE v.event_id = e.id AND v.status IN ('SUBMITTED','PUBLISHED')) AS evaluated_crew",
      ),
      db.raw(
        '(SELECT is_enabled FROM event_registration_settings r WHERE r.event_id = e.id) AS registration_enabled',
      ),
    )
    .orderBy(
      filters.sort === 'name' ? 'e.name' : 'e.start_date',
      filters.sort === 'name' ? 'asc' : 'desc',
    )
    .limit(limit)
    .offset((page - 1) * limit);
  for (const item of items) {
    if (crewId) {
      delete item.created_by;
      delete item.evaluated_crew;
      delete item.registration_enabled;
    } else {
      const settings = await db('event_registration_settings').where({ event_id: item.id }).first();
      item.registration_availability = availability(item, settings, Number(item.crew_count));
    }
  }
  return { items, total: Number(total), page, limit };
}
export async function detail(id, crewId) {
  const row = await db('events').where({ id }).whereNull('deleted_at').first();
  assert(row, 404, 'Event not found');
  if (crewId)
    assert(
      await db('event_assignments').where({ event_id: id, crew_id: crewId }).first(),
      403,
      'You are not assigned to this event',
    );
  if (crewId) delete row.created_by;
  return row;
}
export async function assigned(id) {
  return db('event_assignments as a')
    .join('crew_profiles as p', 'p.user_id', 'a.crew_id')
    .join('users as u', 'u.id', 'a.crew_id')
    .where('a.event_id', id)
    .select(
      'a.crew_id as id',
      'p.full_name',
      'u.username',
      'p.profile_photo_path',
      'a.assignment_source',
      'a.assigned_at',
    );
}
export async function save(id, body, actor) {
  const data = event.parse(body);
  return db.transaction(async (trx) => {
    if (id) {
      await lockEvent(trx, id);
      await trx('events')
        .where({ id })
        .update({ ...data, updated_at: now() });
    } else {
      [id] = await trx('events').insert({ ...data, created_by: actor.user.id });
      await trx('event_registration_settings').insert({ event_id: id });
    }
    await audit(trx, actor, 'EVENT_SAVED', 'event', id, { status: data.status });
    return { id };
  });
}
export async function archive(id, actor) {
  return db.transaction(async (trx) => {
    await lockEvent(trx, id);
    await trx('events').where({ id }).update({ deleted_at: now(), updated_at: now() });
    await trx('event_registration_settings')
      .where({ event_id: id })
      .update({ is_enabled: false, token_hash: null });
    await trx('event_evaluation_links')
      .where({ event_id: id })
      .update({ is_active: false, revoked_at: now() });
    await audit(trx, actor, 'EVENT_ARCHIVED', 'event', id);
  });
}
