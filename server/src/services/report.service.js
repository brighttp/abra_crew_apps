import ExcelJS from 'exceljs';
import { db } from '../config/database.js';
import { rankings, performance } from './performance.service.js';
import { safeCell, assert } from '../utils/core.js';
export async function reportRows(type, filters) {
  if (type === 'performance' || type === 'rankings')
    return (await rankings(filters)).map((p) => ({
      crew_id: p.id,
      name: p.full_name,
      overall_score: p.overall_score,
      completed_events: p.eligible_events,
      published_evaluations: p.published_evaluations,
    }));
  if (type === 'crew')
    return db('users as u')
      .join('crew_profiles as p', 'p.user_id', 'u.id')
      .where('u.account_role', 'CREW')
      .whereNull('u.deleted_at')
      .select('u.id', 'u.username', 'u.email', 'p.full_name', 'p.phone');
  if (type === 'registrations') {
    const q = db('event_registrations as r')
      .join('events as e', 'e.id', 'r.event_id')
      .join('crew_profiles as p', 'p.user_id', 'r.crew_id')
      .select('e.name as event', 'p.full_name as crew', 'r.application_status', 'r.applied_at');
    if (filters.event_id) q.where('e.id', filters.event_id);
    if (filters.from) q.where('e.end_date', '>=', filters.from);
    if (filters.to) q.where('e.end_date', '<=', filters.to);
    return q;
  }
  if (type === 'evaluations') {
    const q = db('evaluations as v')
      .join('events as e', 'e.id', 'v.event_id')
      .join('crew_profiles as p', 'p.user_id', 'v.crew_id')
      .join('evaluation_scores as s', 's.evaluation_id', 'v.id')
      .select('v.id', 'e.name as event', 'p.full_name as crew', 'v.status')
      .avg({ evaluation_score: 's.score' })
      .groupBy('v.id', 'e.name', 'p.full_name', 'v.status');
    if (filters.event_id) q.where('e.id', filters.event_id);
    if (filters.from) q.where('e.end_date', '>=', filters.from);
    if (filters.to) q.where('e.end_date', '<=', filters.to);
    return q;
  }
  assert(['events', 'participation', 'assignments'].includes(type), 404, 'Report not found');
  const q = db('event_assignments as a')
    .join('events as e', 'e.id', 'a.event_id')
    .join('crew_profiles as p', 'p.user_id', 'a.crew_id')
    .select(
      'e.id as event_id',
      'e.name as event',
      'e.start_date',
      'e.end_date',
      'e.status',
      'p.full_name as crew',
      'a.assignment_source',
    );
  if (filters.event_id) q.where('e.id', filters.event_id);
  if (filters.from) q.where('e.end_date', '>=', filters.from);
  if (filters.to) q.where('e.end_date', '<=', filters.to);
  return q;
}
export async function exportReport(type, filters, res) {
  const rows = await reportRows(type, filters);
  const keys = rows.length ? Object.keys(rows[0]) : ['No matching records'];
  const safe = rows.map((row) =>
    Object.fromEntries(
      keys.map((key) => [key, typeof row[key] === 'number' ? row[key] : safeCell(row[key])]),
    ),
  );
  if (filters.format === 'xlsx') {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Report');
    sheet.columns = keys.map((key) => ({ header: key, key, width: 25 }));
    sheet.addRows(safe);
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="crew-os-${type}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } else {
    const quote = (v) => '"' + String(v ?? '').replaceAll('"', '""') + '"';
    const csv = [
      keys.map(quote).join(','),
      ...safe.map((row) => keys.map((key) => quote(row[key])).join(',')),
    ].join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="crew-os-${type}.csv"`);
    res.send('\uFEFF' + csv);
  }
}
export async function dashboard() {
  const count = async (table, where = {}) =>
    Number((await db(table).where(where).whereNull('deleted_at').count({ n: 'id' }))[0].n);
  const ranks = await rankings();
  return {
    total_crew: await count('users', { account_role: 'CREW', approval_state: 'APPROVED' }),
    total_events: await count('events'),
    upcoming_events: await count('events', { status: 'UPCOMING' }),
    ongoing_events: await count('events', { status: 'ONGOING' }),
    completed_events: await count('events', { status: 'COMPLETED' }),
    pending_accounts: await count('users', { account_role: 'CREW', approval_state: 'PENDING' }),
    pending_applications: Number(
      (
        await db('event_registrations').where({ application_status: 'PENDING' }).count({ n: 'id' })
      )[0].n,
    ),
    average_performance: ranks.length
      ? ranks.reduce((s, r) => s + r.overall_score, 0) / ranks.length
      : null,
    evaluations: await db('evaluations').select('status').count({ count: 'id' }).groupBy('status'),
    recent_activity: await db('audit_logs')
      .select('action', 'entity_type', 'entity_id', 'created_at')
      .orderBy('id', 'desc')
      .limit(8),
    rankings: ranks.slice(0, 5),
  };
}
export async function eventAnalytics(filters = {}) {
  const q = db('events')
    .select('id', 'name', 'status', 'start_date', 'end_date')
    .whereNull('deleted_at');
  if (filters.from) q.where('end_date', '>=', filters.from);
  if (filters.to) q.where('end_date', '<=', filters.to);
  const rows = await q;
  for (const e of rows) {
    e.assigned = Number(
      (await db('event_assignments').where({ event_id: e.id }).count({ n: 'id' }))[0].n,
    );
    e.evaluated = Number(
      (
        await db('evaluations')
          .where({ event_id: e.id })
          .whereIn('status', ['SUBMITTED', 'PUBLISHED'])
          .countDistinct({ n: 'crew_id' })
      )[0].n,
    );
    e.published = Number(
      (await db('evaluations').where({ event_id: e.id, status: 'PUBLISHED' }).count({ n: 'id' }))[0]
        .n,
    );
    const scoreRows = await db('evaluations as v')
      .join('evaluation_scores as s', 's.evaluation_id', 'v.id')
      .where({ 'v.event_id': e.id, 'v.status': 'PUBLISHED' })
      .select('v.crew_id', 'v.id')
      .avg({ score: 's.score' })
      .groupBy('v.crew_id', 'v.id');
    const crew = new Map();
    for (const r of scoreRows) {
      const a = crew.get(r.crew_id) || [];
      a.push(Number(r.score));
      crew.set(r.crew_id, a);
    }
    const means = [...crew.values()].map((a) => a.reduce((x, y) => x + y, 0) / a.length);
    e.score = means.length ? means.reduce((x, y) => x + y, 0) / means.length : null;
  }
  return rows;
}
