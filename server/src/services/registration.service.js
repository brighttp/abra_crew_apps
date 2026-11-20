import { db } from '../config/database.js';
import { assert, audit, hash, token, now } from '../utils/core.js';
import { registration } from '../utils/validation.js';
export async function lockEvent(trx, eventId) {
  const event = await trx('events')
    .where({ id: eventId })
    .whereNull('deleted_at')
    .forUpdate()
    .first();
  assert(event, 404, 'Event not found');
  return event;
}
export async function capacity(trx, eventId) {
  let settingsQuery = trx('event_registration_settings').where({ event_id: eventId });
  let assignmentsQuery = trx('event_assignments').where({ event_id: eventId }).select('id');
  if (trx.isTransaction) {
    settingsQuery = settingsQuery.forUpdate();
    assignmentsQuery = assignmentsQuery.forUpdate();
  }
  const settings = await settingsQuery.first();
  const count = (await assignmentsQuery).length;
  return { settings, count, full: settings?.quota != null && count >= settings.quota };
}
export function availability(event, settings, count) {
  if (
    !settings?.is_enabled ||
    !settings.token_hash ||
    ['DRAFT', 'COMPLETED', 'CANCELLED'].includes(event.status)
  )
    return 'Closed';
  if (settings.deadline && new Date(settings.deadline + 'Z') < new Date()) return 'Closed';
  if (settings.quota != null && count >= settings.quota) return 'Full';
  return 'Open';
}
export async function publicEvent(raw) {
  const settings = await db('event_registration_settings')
    .where({ token_hash: hash(raw) })
    .first();
  assert(settings, 404, 'Registration link is invalid or revoked');
  const event = await db('events').where({ id: settings.event_id }).whereNull('deleted_at').first();
  assert(event, 404, 'Event not found');
  const { count } = await capacity(db, event.id);
  return {
    id: event.id,
    name: event.name,
    client_name: settings.show_client ? event.client_name : undefined,
    location: event.location,
    start_date: event.start_date,
    end_date: event.end_date,
    description: settings.public_description,
    instructions: settings.instructions,
    availability: availability(event, settings, count),
    available_slots:
      settings.show_slots && settings.quota != null ? Math.max(0, settings.quota - count) : null,
    deadline: settings.deadline,
  };
}
export async function applyWithin(trx, raw, crewId) {
  const initial = await trx('event_registration_settings')
    .where({ token_hash: hash(raw) })
    .first();
  assert(initial, 404, 'Registration link is invalid or revoked');
  const event = await lockEvent(trx, initial.event_id);
  const { settings, count } = await capacity(trx, event.id);
  assert(settings.token_hash === hash(raw), 404, 'Registration link has changed');
  assert(
    availability(event, settings, count) === 'Open',
    409,
    availability(event, settings, count) === 'Full'
      ? 'Event quota is full'
      : 'Registration is closed',
  );
  assert(
    !(await trx('event_assignments').where({ event_id: event.id, crew_id: crewId }).first()),
    409,
    'You are already assigned to this event',
  );
  const existing = await trx('event_registrations')
    .where({ event_id: event.id, crew_id: crewId })
    .first();
  assert(
    !existing || existing.application_status === 'WITHDRAWN',
    409,
    'An application already exists',
  );
  if (existing)
    await trx('event_registrations').where({ id: existing.id }).update({
      application_status: 'PENDING',
      applied_at: now(),
      reviewed_at: null,
      reviewed_by: null,
      rejection_reason: null,
      updated_at: now(),
    });
  else await trx('event_registrations').insert({ event_id: event.id, crew_id: crewId });
  return { message: 'Application submitted for review' };
}
export const apply = (raw, actor) =>
  db.transaction(async (trx) => {
    const result = await applyWithin(trx, raw, actor.user.id);
    await audit(trx, actor, 'EVENT_APPLIED', 'user', actor.user.id);
    return result;
  });
export async function assignWithin(trx, eventId, crewId, actor, source = 'MANUAL') {
  await lockEvent(trx, eventId);
  const user = await trx('users')
    .where({ id: crewId, account_role: 'CREW', approval_state: 'APPROVED' })
    .whereNull('deleted_at')
    .first();
  assert(user, 422, 'Crew must have an approved account');
  assert(
    !(await trx('event_assignments').where({ event_id: eventId, crew_id: crewId }).first()),
    409,
    'Crew is already assigned',
  );
  const { full } = await capacity(trx, eventId);
  assert(!full, 409, 'Event quota is full');
  await trx('event_assignments').insert({
    event_id: eventId,
    crew_id: crewId,
    assignment_source: source,
    assigned_by: actor.user.id,
  });
  await audit(trx, actor, 'CREW_ASSIGNED', 'event', eventId, { crew_id: crewId, source });
}
export async function assign(eventId, crewIds, actor) {
  return db.transaction(async (trx) => {
    for (const crewId of [...new Set(crewIds)]) await assignWithin(trx, eventId, crewId, actor);
  });
}
export async function removeAssignment(eventId, crewId, actor) {
  return db.transaction(async (trx) => {
    await lockEvent(trx, eventId);
    assert(
      !(await trx('evaluations').where({ event_id: eventId, crew_id: crewId }).first()),
      409,
      'Assignments with evaluation history cannot be removed',
    );
    await trx('event_assignments').where({ event_id: eventId, crew_id: crewId }).delete();
    await trx('event_registrations')
      .where({ event_id: eventId, crew_id: crewId, application_status: 'APPROVED' })
      .update({ application_status: 'WITHDRAWN', updated_at: now() });
    await audit(trx, actor, 'CREW_UNASSIGNED', 'event', eventId, { crew_id: crewId });
  });
}
export async function review(eventId, applicationId, approved, actor, reason = '') {
  return db.transaction(async (trx) => {
    await lockEvent(trx, eventId);
    const application = await trx('event_registrations')
      .where({ id: applicationId, event_id: eventId })
      .forUpdate()
      .first();
    assert(application, 404, 'Application not found');
    assert(
      application.application_status === 'PENDING',
      409,
      'Application has already been reviewed',
    );
    if (approved) await assignWithin(trx, eventId, application.crew_id, actor, 'REGISTRATION');
    await trx('event_registrations')
      .where({ id: applicationId })
      .update({
        application_status: approved ? 'APPROVED' : 'REJECTED',
        reviewed_at: now(),
        reviewed_by: actor.user.id,
        rejection_reason: approved ? null : reason,
        updated_at: now(),
      });
    await audit(
      trx,
      actor,
      approved ? 'APPLICATION_APPROVED' : 'APPLICATION_REJECTED',
      'registration',
      applicationId,
    );
  });
}
export async function settings(eventId, body, actor) {
  const data = registration.parse(body);
  return db.transaction(async (trx) => {
    await lockEvent(trx, eventId);
    const { count } = await capacity(trx, eventId);
    assert(
      data.quota == null || data.quota >= count,
      409,
      'Quota cannot be lower than the number of assigned crew',
    );
    await trx('event_registration_settings')
      .where({ event_id: eventId })
      .update({
        ...data,
        deadline: data.deadline ? new Date(data.deadline) : null,
        updated_at: now(),
      });
    await audit(trx, actor, 'REGISTRATION_SETTINGS_UPDATED', 'event', eventId);
  });
}
export async function regenerate(eventId, actor, revoke = false) {
  const raw = token();
  await db.transaction(async (trx) => {
    await lockEvent(trx, eventId);
    await trx('event_registration_settings')
      .where({ event_id: eventId })
      .update({
        token_hash: revoke ? null : hash(raw),
        ...(revoke ? { is_enabled: false } : {}),
        updated_at: now(),
      });
    await audit(
      trx,
      actor,
      revoke ? 'REGISTRATION_LINK_REVOKED' : 'REGISTRATION_LINK_REGENERATED',
      'event',
      eventId,
    );
  });
  return revoke ? { message: 'Registration link revoked' } : { token: raw };
}
export async function applications(eventId) {
  return db('event_registrations as r')
    .join('users as u', 'u.id', 'r.crew_id')
    .join('crew_profiles as p', 'p.user_id', 'u.id')
    .where('r.event_id', eventId)
    .select('r.*', 'u.username', 'u.approval_state', 'p.full_name')
    .orderBy('r.applied_at', 'desc');
}
export async function mine(crewId) {
  return db('event_registrations as r')
    .join('events as e', 'e.id', 'r.event_id')
    .where('r.crew_id', crewId)
    .select(
      'r.id',
      'r.event_id',
      'r.application_status',
      'r.applied_at',
      'r.rejection_reason',
      'e.name',
      'e.start_date',
      'e.location',
    )
    .orderBy('r.applied_at', 'desc');
}
export async function withdraw(applicationId, actor) {
  return db.transaction(async (trx) => {
    const r = await trx('event_registrations')
      .where({ id: applicationId, crew_id: actor.user.id })
      .first();
    assert(r, 404, 'Application not found');
    await lockEvent(trx, r.event_id);
    const updated = await trx('event_registrations')
      .where({ id: applicationId, application_status: 'PENDING' })
      .update({ application_status: 'WITHDRAWN', updated_at: now() });
    assert(updated, 409, 'Only pending applications can be withdrawn');
    await audit(trx, actor, 'APPLICATION_WITHDRAWN', 'registration', applicationId);
  });
}
