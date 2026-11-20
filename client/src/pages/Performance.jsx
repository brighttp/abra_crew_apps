import { createResource, createSignal, For, Show } from 'solid-js';
import { A, useParams } from '@solidjs/router';
import { api, post, patch, query } from '../services/api';
import { user } from '../stores/auth';
import {
  PageHeader,
  Async,
  DataTable,
  StatCard,
  score,
  date,
  StatusBadge,
  DateRangePicker,
  FormField,
  EvaluationForm,
  EmptyState,
  act,
  confirm,
} from '../components/ui';
import { lazy } from 'solid-js';
const PerformanceChart = lazy(() => import('../components/PerformanceChart'));
export function MyPerformance() {
  const [data, { refetch }] = createResource(() => api('/me/performance'));
  return (
    <>
      <PageHeader
        title="My performance"
        description="Your progress, built from real experiences."
      />
      <Async resource={data} retry={refetch}>
        <Show when={data()}>
          {(d) => (
            <>
              <div class="stats-grid three">
                <StatCard
                  label="Overall performance"
                  value={score(d().overall_score)}
                  accent
                  note="Each completed event counts equally"
                />
                <StatCard label="Evaluated events" value={d().eligible_events} />
                <StatCard label="Published evaluations" value={d().published_evaluations} />
              </div>
              <Show
                when={d().history.length}
                fallback={
                  <EmptyState
                    title="Your progress starts with your next event"
                    description="Published evaluations from completed events will appear here."
                  />
                }
              >
                <div class="two-columns">
                  <section class="panel">
                    <h2>Performance over time</h2>
                    <PerformanceChart items={d().history} />
                  </section>
                  <section class="panel">
                    <h2>Category scores</h2>
                    <PerformanceChart bar items={d().categories} />
                  </section>
                </div>
                <h2>Event feedback</h2>
                <For each={d().history}>
                  {(event) => (
                    <section class="panel">
                      <div class="section-heading">
                        <div>
                          <h3>{event.name}</h3>
                          <span class="muted">
                            {date(event.date)} · {event.evaluation_count} evaluations
                          </span>
                        </div>
                        <strong class="large-score">
                          {score(event.score)}
                          <small>/ 5</small>
                        </strong>
                      </div>
                      <For each={event.feedback}>
                        {(f) => (
                          <blockquote>
                            {f.text}
                            <footer>Anonymous feedback</footer>
                          </blockquote>
                        )}
                      </For>
                      <Show when={!event.feedback.length}>
                        <p class="muted">No written feedback published.</p>
                      </Show>
                    </section>
                  )}
                </For>
              </Show>
            </>
          )}
        </Show>
      </Async>
    </>
  );
}
export function AdminPerformance() {
  const [from, setFrom] = createSignal(''),
    [to, setTo] = createSignal(''),
    [minEvents, setMinEvents] = createSignal(''),
    [minEvaluations, setMinEvaluations] = createSignal(''),
    [skill, setSkill] = createSignal(''),
    [sort, setSort] = createSignal('rating');
  const [skills] = createResource(() => api('/skills'));
  const [ranks, { refetch }] = createResource(
    () => [from(), to(), minEvents(), minEvaluations(), skill(), sort()],
    (v) =>
      api(
        '/admin/analytics/rankings' +
          query({
            from: v[0],
            to: v[1],
            min_events: v[2],
            min_evaluations: v[3],
            skill_id: v[4],
            sort: v[5],
          }),
      ),
  );
  const [reviews] = createResource(() => api('/evaluations'));
  const [events] = createResource(
    () => [from(), to()],
    (v) => api('/admin/analytics/events' + query({ from: v[0], to: v[1] })),
  );
  return (
    <>
      <PageHeader
        title="Performance"
        description="Published results. Clear insights. Better experiences."
      >
        <A class="button" href="/admin/reports">Reports</A>
      </PageHeader>
      <section class="panel">
        <div class="toolbar">
          <DateRangePicker from={from()} to={to()} onFrom={setFrom} onTo={setTo} />
          <FormField
            label="Minimum events"
            type="number"
            min="0"
            value={minEvents()}
            onInput={setMinEvents}
          />
          <FormField
            label="Minimum evaluations"
            type="number"
            min="0"
            value={minEvaluations()}
            onInput={setMinEvaluations}
          />
          <label class="field">
            <span>Skill</span>
            <select onChange={(e) => setSkill(e.currentTarget.value)}>
              <option value="">All skills</option>
              <For each={skills()}>{(s) => <option value={s.id}>{s.name}</option>}</For>
            </select>
          </label>
          <label class="field">
            <span>Sort by</span>
            <select onChange={(e) => setSort(e.currentTarget.value)}>
              <option value="rating">Highest score</option>
              <option value="name">Name A–Z</option>
            </select>
          </label>
        </div>
        <h2>Crew ranking</h2>
        <Async resource={ranks} retry={refetch}>
          <DataTable
            rows={ranks()}
            empty="No evaluated crew match these filters"
            columns={[
              { label: 'CREW', render: (r) => <A href={`/admin/crew/${r.id}`}>{r.full_name}</A> },
              {
                label: 'SCORE',
                render: (r) => <strong class="accent">{score(r.overall_score)}</strong>,
              },
              { label: 'COMPLETED EVENTS', key: 'eligible_events' },
              { label: 'EVALUATIONS', key: 'published_evaluations' },
            ]}
          />
        </Async>
      </section>
      <section class="panel">
        <h2>Event performance & participation</h2>
        <DataTable
          rows={events()}
          columns={[
            { label: 'EVENT', render: (r) => <A href={`/admin/events/${r.id}`}>{r.name}</A> },
            { label: 'STATUS', render: (r) => <StatusBadge value={r.status} /> },
            { label: 'ASSIGNED', key: 'assigned' },
            { label: 'EVALUATED', key: 'evaluated' },
            { label: 'PUBLISHED', key: 'published' },
            { label: 'EVENT SCORE', render: (r) => score(r.score) },
          ]}
        />
      </section>
      <section class="panel">
        <h2>Evaluation review queue</h2>
        <DataTable
          rows={reviews()}
          columns={[
            { label: 'CREW', key: 'crew_name' },
            { label: 'EVENT', key: 'event_name' },
            { label: 'EVALUATOR', render: (r) => r.evaluator_name || r.admin_name },
            { label: 'STATUS', render: (r) => <StatusBadge value={r.status} /> },
            { label: '', render: (r) => <A href={`/admin/performance/${r.id}`}>Review →</A> },
          ]}
        />
      </section>
    </>
  );
}
export function EvaluationReview() {
  const params = useParams();
  const [data, { refetch }] = createResource(
    () => params.evaluationId,
    (id) => api('/evaluations/' + id),
  );
  const [feedback, setFeedback] = createSignal('');
  const [editing, setEditing] = createSignal(false);
  async function transition(action) {
    if (
      await confirm(
        `${action.charAt(0).toUpperCase() + action.slice(1)} evaluation?`,
        action === 'publish'
          ? 'Only the reviewed public feedback will be visible to crew. Check it for identifying details.'
          : 'Performance scores update immediately when publication changes.',
      )
    )
      await act(
        () =>
          post(`/evaluations/${params.evaluationId}/${action}`, { feedback_public: feedback() }),
        refetch,
      );
  }
  return (
    <>
      <PageHeader
        title="Review evaluation"
        description="Review scores and remove identifying details from public feedback."
      />
      <Async resource={data} retry={refetch}>
        <Show when={data()} keyed>
          {(d) => {
            setFeedback(d.feedback_public ?? d.feedback_original ?? '');
            return (
              <>
                <section class="panel">
                  <div class="section-heading">
                    <div>
                      <h2>{d.crew_name}</h2>
                      <p class="muted">{d.event_name}</p>
                    </div>
                    <StatusBadge value={d.status} />
                  </div>
                  <p>
                    Evaluator: <strong>{d.evaluator_name || d.admin_name}</strong>{' '}
                    {d.evaluator_description && `· ${d.evaluator_description}`}
                  </p>
                  <p class="muted text-xs">
                    Evaluator information is visible only to administrators.
                  </p>
                  <DataTable
                    rows={d.scores}
                    columns={[
                      { label: 'CRITERION', key: 'name' },
                      { label: 'SCORE', key: 'score' },
                    ]}
                  />
                  <h3>Original feedback (admin only)</h3>
                  <p class="preserve-space">{d.feedback_original || 'No written feedback'}</p>
                  <FormField
                    label="Public feedback"
                    hint="Remove names, roles, signatures, and identifying details. Leave blank to hide written feedback."
                  >
                    <textarea
                      rows="5"
                      maxlength="5000"
                      value={feedback()}
                      onInput={(e) => setFeedback(e.currentTarget.value)}
                      disabled={d.status === 'PUBLISHED'}
                    />
                  </FormField>
                  <div class="actions mt-5">
                    <Show when={d.status === 'SUBMITTED'}>
                      <button class="primary" onClick={() => transition('publish')}>
                        Publish evaluation
                      </button>
                      <button onClick={() => transition('reopen')}>Return for correction</button>
                    </Show>
                    <Show when={d.status === 'PUBLISHED'}>
                      <button onClick={() => transition('unpublish')}>Unpublish</button>
                    </Show>
                    <Show when={d.status === 'DRAFT' && d.admin_evaluator_id === user().id}>
                      <button onClick={() => setEditing(!editing())}>Edit my draft</button>
                      <button class="primary" onClick={() => transition('submit')}>
                        Submit draft
                      </button>
                    </Show>
                    <A class="button" href={`/admin/events/${d.event_id}`}>
                      Back to event
                    </A>
                  </div>
                </section>
                <Show when={editing() && d.status === 'DRAFT'}>
                  <section class="panel">
                    <EvaluationForm
                      criteria={d.scores.map((s) => ({
                        id: s.event_criterion_id,
                        criterion_name_snapshot: s.name,
                      }))}
                      initial={d}
                      onSave={async (body, submit) =>
                        act(
                          async () => {
                            await patch('/evaluations/' + d.id, body);
                            if (submit) await post(`/evaluations/${d.id}/submit`);
                          },
                          () => {
                            setEditing(false);
                            refetch();
                          },
                        )
                      }
                    />
                  </section>
                </Show>
              </>
            );
          }}
        </Show>
      </Async>
    </>
  );
}
