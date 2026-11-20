// Explicit allowlist: never serialize evaluator IDs, sessions, names, or original feedback.
export function crewPerformance(p) {
  return {
    overall_score: p.overall_score,
    eligible_events: p.eligible_events,
    published_evaluations: p.published_evaluations,
    categories: p.categories.map((c) => ({ name: c.name, score: c.score })),
    history: p.history.map((e) => ({
      event_id: e.event_id,
      name: e.name,
      date: e.date,
      score: e.score,
      evaluation_count: e.evaluation_count,
      categories: e.categories.map((c) => ({ name: c.name, score: c.score })),
      feedback: e.feedback.map((f) => ({ text: f.text })),
    })),
  };
}
