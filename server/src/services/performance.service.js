import { db } from '../config/database.js';
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
// SQL equivalent of calculate(), used for server-side sorting before pagination.
export function overallScoreQuery() {
  const evaluations = db('evaluation_scores as s')
    .join('evaluations as v', 'v.id', 's.evaluation_id')
    .join('events as e', 'e.id', 'v.event_id')
    .where({ 'v.status': 'PUBLISHED', 'e.status': 'COMPLETED' })
    .select('v.crew_id', 'v.event_id', 'v.id')
    .avg({ evaluation_score: 's.score' })
    .groupBy('v.crew_id', 'v.event_id', 'v.id');
  const events = db
    .from(evaluations.as('ev'))
    .select('crew_id', 'event_id')
    .avg({ event_score: 'evaluation_score' })
    .groupBy('crew_id', 'event_id');
  return db
    .from(events.as('ep'))
    .select('crew_id')
    .avg({ overall_score: 'event_score' })
    .groupBy('crew_id');
}
// Event-level means ensure evaluators in a popular event never outweigh other events.
export function calculate(rows) {
  const events = new Map();
  for (const row of rows) {
    if (row.status !== 'PUBLISHED' || row.event_status !== 'COMPLETED') continue;
    let e = events.get(row.event_id);
    if (!e) {
      e = {
        event_id: row.event_id,
        name: row.event_name,
        date: row.end_date,
        evaluations: new Map(),
        categories: new Map(),
        feedback: new Map(),
      };
      events.set(row.event_id, e);
    }
    const scores = e.evaluations.get(row.evaluation_id) || [];
    scores.push(Number(row.score));
    e.evaluations.set(row.evaluation_id, scores);
    const cat = e.categories.get(row.criterion_id) || {
      id: row.criterion_id,
      name: row.criterion_name,
      scores: [],
    };
    cat.scores.push(Number(row.score));
    e.categories.set(row.criterion_id, cat);
    if (row.feedback_public) e.feedback.set(row.evaluation_id, row.feedback_public);
  }
  const history = [...events.values()]
    .map((e) => ({
      event_id: e.event_id,
      name: e.name,
      date: e.date,
      score: mean([...e.evaluations.values()].map(mean)),
      evaluation_count: e.evaluations.size,
      categories: [...e.categories.values()].map((c) => ({
        id: c.id,
        name: c.name,
        score: mean(c.scores),
      })),
      feedback: [...e.feedback.values()].map((text) => ({ text })),
    }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const cats = new Map();
  for (const e of history)
    for (const c of e.categories) {
      const v = cats.get(c.id) || { name: c.name, values: [] };
      v.values.push(c.score);
      cats.set(c.id, v);
    }
  return {
    overall_score: mean(history.map((e) => e.score)),
    eligible_events: history.length,
    published_evaluations: history.reduce((n, e) => n + e.evaluation_count, 0),
    categories: [...cats.values()].map((c) => ({ name: c.name, score: mean(c.values) })),
    history,
  };
}
export async function performance(crewId, filters = {}) {
  const q = db('evaluation_scores as s')
    .join('evaluations as v', 'v.id', 's.evaluation_id')
    .join('events as e', 'e.id', 'v.event_id')
    .join('event_evaluation_criteria as c', 'c.id', 's.event_criterion_id')
    .where({ 'v.crew_id': crewId, 'v.status': 'PUBLISHED', 'e.status': 'COMPLETED' })
    .select(
      'v.id as evaluation_id',
      'v.status',
      'v.feedback_public',
      'e.id as event_id',
      'e.status as event_status',
      'e.name as event_name',
      'e.end_date',
      'c.criterion_id',
      'c.criterion_name_snapshot as criterion_name',
      's.score',
    );
  if (filters.from) q.where('e.end_date', '>=', filters.from);
  if (filters.to) q.where('e.end_date', '<=', filters.to);
  if (filters.event_id) q.where('e.id', filters.event_id);
  return calculate(await q);
}
export async function rankings(filters = {}) {
  const q = db('users as u')
    .join('crew_profiles as p', 'p.user_id', 'u.id')
    .where({ 'u.account_role': 'CREW', 'u.approval_state': 'APPROVED' })
    .whereNull('u.deleted_at')
    .select('u.id', 'u.username', 'p.full_name');
  if (filters.skill_id)
    q.whereExists(
      db('crew_skills').select('id').whereRaw('crew_id = u.id').where('skill_id', filters.skill_id),
    );
  const rows = [];
  for (const u of await q) {
    const p = await performance(u.id, filters);
    if (
      p.overall_score !== null &&
      p.eligible_events >= (Number(filters.min_events) || 0) &&
      p.published_evaluations >= (Number(filters.min_evaluations) || 0)
    )
      rows.push({ ...u, ...p });
  }
  return rows.sort((a, b) =>
    filters.sort === 'name'
      ? a.full_name.localeCompare(b.full_name)
      : b.overall_score - a.overall_score,
  );
}
