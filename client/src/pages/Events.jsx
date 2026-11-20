import { createResource, createSignal, For, Show } from 'solid-js';
import { A, useNavigate, useParams } from '@solidjs/router';
import { Plus, Link, Copy } from 'lucide-solid';
import { api, post, patch, put, remove, query } from '../services/api';
import { user } from '../stores/auth';
import {
  PageHeader,
  Async,
  DataTable,
  SearchInput,
  Pagination,
  EventCard,
  EmptyState,
  StatusBadge,
  FormField,
  EvaluationForm,
  act,
  confirm,
  prompt,
  notice,
  date,
} from '../components/ui';
const statuses = ['DRAFT', 'UPCOMING', 'ONGOING', 'COMPLETED', 'CANCELLED'];
export function EventList() {
  const [search, setSearch] = createSignal(''),
    [status, setStatus] = createSignal(''),
    [page, setPage] = createSignal(1),
    [sort, setSort] = createSignal('date');
  const isAdmin = () => user().account_role === 'ADMIN';
  const [data, { refetch }] = createResource(
    () => [search(), status(), page(), sort()],
    (v) => api('/events' + query({ search: v[0], status: v[1], page: v[2], sort: v[3] })),
  );
  return (
    <>
      <PageHeader
        title={isAdmin() ? 'Events' : 'My events'}
        description="From first brief to the final moment."
      >
        <Show when={isAdmin()}>
          <A class="button primary" href="/admin/events/new">
            <Plus size={16} /> Create event
          </A>
        </Show>
      </PageHeader>
      <div class="toolbar">
        <SearchInput
          value={search()}
          onInput={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Search events…"
        />
        <select
          aria-label="Event status"
          onChange={(e) => {
            setStatus(e.currentTarget.value);
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          <For each={statuses}>{(s) => <option>{s}</option>}</For>
        </select>
        <select aria-label="Sort events" onChange={(e) => setSort(e.currentTarget.value)}>
          <option value="date">Latest date</option>
          <option value="name">Name A–Z</option>
        </select>
      </div>
      <Async resource={data} retry={refetch}>
        <Show when={data()?.items.length} fallback={<EmptyState title="No events yet" />}>
          <div class="event-grid">
            <For each={data()?.items}>
              {(event) => <EventCard event={event} base={isAdmin() ? '/admin' : '/crew'} />}
            </For>
          </div>
        </Show>
        <Pagination data={data()} onPage={setPage} />
      </Async>
    </>
  );
}
export function EventForm() {
  const params = useParams(),
    navigate = useNavigate();
  const [data] = createResource(
    () => params.id,
    (id) => api('/events/' + id),
  );
  const [busy, setBusy] = createSignal(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    const body = Object.fromEntries(new FormData(e.currentTarget));
    await act(
      () => (params.id ? patch('/events/' + params.id, body) : post('/events', body)),
      (r) => navigate('/admin/events/' + (params.id || r.id)),
    );
    setBusy(false);
  }
  return (
    <>
      <PageHeader
        title={params.id ? 'Edit event' : 'Create an event'}
        description="Set the details. Bring your crew together."
      />
      <Show when={!params.id || data()}>
        <form class="panel form-panel stack" onSubmit={submit}>
          <label class="field">
            <span>Event name *</span>
            <input name="name" value={data()?.name || ''} required maxlength="200" />
          </label>
          <label class="field">
            <span>Client name</span>
            <input name="client_name" value={data()?.client_name || ''} maxlength="200" />
          </label>
          <label class="field">
            <span>Location *</span>
            <input name="location" value={data()?.location || ''} required maxlength="200" />
          </label>
          <div class="two-columns">
            <label class="field">
              <span>Start date *</span>
              <input type="date" name="start_date" value={data()?.start_date || ''} required />
            </label>
            <label class="field">
              <span>End date *</span>
              <input type="date" name="end_date" value={data()?.end_date || ''} required />
            </label>
          </div>
          <label class="field">
            <span>Status</span>
            <select name="status">
              <For each={statuses}>
                {(s) => <option selected={data()?.status === s}>{s}</option>}
              </For>
            </select>
          </label>
          <label class="field">
            <span>Description</span>
            <textarea
              name="description"
              rows="5"
              maxlength="10000"
              value={data()?.description || ''}
            />
          </label>
          <div class="actions">
            <button class="primary" disabled={busy()}>
              Save event
            </button>
            <A class="button" href="/admin/events">
              Cancel
            </A>
          </div>
        </form>
      </Show>
      <Show when={data.error}>
        <p class="error">{data.error.message}</p>
      </Show>
    </>
  );
}
function ShareLink(p) {
  return (
    <Show when={p.value}>
      <div class="share-link">
        <label class="field">
          <span>Copy this link now. It is shown only when generated.</span>
          <input readonly value={p.value} onFocus={(e) => e.currentTarget.select()} />
        </label>
        <button
          aria-label="Copy link"
          onClick={() => act(() => navigator.clipboard.writeText(p.value), null, 'Link copied')}
        >
          <Copy size={17} />
        </button>
      </div>
    </Show>
  );
}
function RegistrationSettings(p) {
  const [data, { refetch }] = createResource(
    () => p.id,
    (id) => api(`/events/${id}/registration-settings`),
  );
  const [link, setLink] = createSignal('');
  async function submit(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = {
      is_enabled: fd.has('is_enabled'),
      deadline: fd.get('deadline') ? new Date(fd.get('deadline')).toISOString() : null,
      quota: fd.get('quota') ? Number(fd.get('quota')) : null,
      public_description: fd.get('public_description'),
      instructions: fd.get('instructions'),
      show_client: fd.has('show_client'),
      show_slots: fd.has('show_slots'),
    };
    await act(() => put(`/events/${p.id}/registration-settings`, body), refetch);
  }
  return (
    <section class="panel">
      <div class="section-heading">
        <h2>Open registration</h2>
        <A href={`/admin/events/${p.id}/registrations`}>Review applications →</A>
      </div>
      <Async resource={data} retry={refetch}>
        <Show when={data()}>
          {(d) => (
            <form class="stack" onSubmit={submit}>
              <label class="checkbox">
                <input type="checkbox" name="is_enabled" checked={!!d().is_enabled} />
                Accept event applications
              </label>
              <div class="two-columns">
                <label class="field">
                  <span>Deadline (optional)</span>
                  <input
                    type="datetime-local"
                    name="deadline"
                    value={
                      d().deadline
                        ? new Date(
                            new Date(d().deadline + 'Z').getTime() -
                              new Date().getTimezoneOffset() * 60000,
                          )
                            .toISOString()
                            .slice(0, 16)
                        : ''
                    }
                  />
                </label>
                <label class="field">
                  <span>Crew quota (optional)</span>
                  <input type="number" min="1" name="quota" value={d().quota || ''} />
                  <small>Pending applications do not consume slots.</small>
                </label>
              </div>
              <label class="field">
                <span>Public description</span>
                <textarea
                  name="public_description"
                  value={d().public_description || ''}
                  rows="3"
                  maxlength="10000"
                />
              </label>
              <label class="field">
                <span>Instructions</span>
                <textarea
                  name="instructions"
                  value={d().instructions || ''}
                  rows="2"
                  maxlength="5000"
                />
              </label>
              <div class="actions">
                <label class="checkbox">
                  <input type="checkbox" name="show_client" checked={!!d().show_client} />
                  Show client
                </label>
                <label class="checkbox">
                  <input type="checkbox" name="show_slots" checked={!!d().show_slots} />
                  Show available slots
                </label>
              </div>
              <div class="actions">
                <button class="primary">Save registration settings</button>
                <button
                  type="button"
                  onClick={async () => {
                    if (
                      await confirm(
                        'Generate registration link?',
                        'The previous registration link will stop working.',
                      )
                    )
                      await act(
                        () => post(`/events/${p.id}/registration-link/regenerate`),
                        (r) => {
                          setLink(location.origin + '/event/' + r.token);
                          refetch();
                        },
                      );
                  }}
                >
                  Generate link
                </button>
                <button
                  type="button"
                  disabled={!d().has_link}
                  onClick={async () => {
                    if (await confirm('Revoke registration link?'))
                      await act(
                        () => remove(`/events/${p.id}/registration-link`),
                        () => {
                          setLink('');
                          refetch();
                        },
                      );
                  }}
                >
                  Revoke
                </button>
              </div>
            </form>
          )}
        </Show>
      </Async>
      <ShareLink value={link()} />
    </section>
  );
}
function EvaluationSection(p) {
  const [link, setLink] = createSignal(''),
    [selected, setSelected] = createSignal(''),
    [expiry, setExpiry] = createSignal('');
  const [criteria, { refetch: refreshCriteria }] = createResource(
    () => p.id,
    (id) => api(`/events/${id}/criteria`),
  );
  const [allCriteria] = createResource(() => api('/criteria'));
  const [evaluations, { refetch }] = createResource(
    () => p.id,
    (id) => api(`/events/${id}/evaluations`),
  );
  const [linkInfo, { refetch: refreshLink }] = createResource(
    () => p.id,
    (id) => api(`/events/${id}/evaluation-link`),
  );
  const [sessions, { refetch: refreshSessions }] = createResource(
    () => p.id,
    (id) => api(`/events/${id}/evaluator-sessions`),
  );
  const selectedDraft = () =>
    evaluations()?.find(
      (v) =>
        v.crew_id === Number(selected()) &&
        v.admin_evaluator_id === user().id &&
        v.status === 'DRAFT',
    );
  const [draft] = createResource(
    () => selectedDraft()?.id,
    (id) => api('/evaluations/' + id),
  );
  return (
    <section class="panel">
      <div class="section-heading">
        <h2>Performance evaluation</h2>
        <StatusBadge value={linkInfo()?.is_active ? 'LINK ACTIVE' : 'LINK INACTIVE'} />
      </div>
      <p class="muted">
        One shared link. Each evaluator has a private session and can assess multiple crew members.
      </p>
      <div class="toolbar">
        <FormField
          label="Link expiration (optional)"
          type="datetime-local"
          value={expiry()}
          onInput={setExpiry}
        />
        <button
          onClick={async () => {
            if (
              await confirm(
                'Generate evaluation link?',
                'The previous link and its evaluator sessions will be revoked.',
              )
            )
              await act(
                () =>
                  post(`/events/${p.id}/evaluation-link`, {
                    expires_at: expiry() ? new Date(expiry()).toISOString() : null,
                  }),
                (r) => {
                  setLink(location.origin + '/evaluate/' + r.token);
                  refreshLink();
                  refreshSessions();
                },
              );
          }}
        >
          Generate shared link
        </button>
        <button
          disabled={!linkInfo()?.is_active}
          onClick={async () => {
            if (await confirm('Revoke evaluation link?'))
              act(
                () => remove(`/events/${p.id}/evaluation-link`),
                () => {
                  setLink('');
                  refreshLink();
                  refreshSessions();
                },
              );
          }}
        >
          Revoke link
        </button>
      </div>
      <ShareLink value={link()} />
      <details>
        <summary>Event criteria</summary>
        <p class="muted">
          Criteria are snapshotted for this event and locked after the first evaluation.
        </p>
        <Show when={criteria()}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const criterion_ids = new FormData(e.currentTarget).getAll('criteria').map(Number);
              await act(() => put(`/events/${p.id}/criteria`, { criterion_ids }), refreshCriteria);
            }}
          >
            <div class="checkbox-grid">
              <For each={allCriteria()?.filter((c) => c.is_active)}>
                {(c) => (
                  <label>
                    <input
                      name="criteria"
                      value={c.id}
                      type="checkbox"
                      checked={criteria()?.some((s) => s.criterion_id === c.id)}
                      disabled={!!evaluations()?.length}
                    />
                    {c.name}
                  </label>
                )}
              </For>
            </div>
            <button disabled={!!evaluations()?.length}>Save event criteria</button>
          </form>
        </Show>
      </details>
      <details>
        <summary>Evaluate a crew member</summary>
        <label class="field">
          <span>Select assigned crew</span>
          <select value={selected()} onChange={(e) => setSelected(e.currentTarget.value)}>
            <option value="">Select crew…</option>
            <For each={p.crew}>{(c) => <option value={c.id}>{c.full_name}</option>}</For>
          </select>
        </label>
        <Show when={selected() && !draft.loading} keyed>
          {(crewId) => (
            <EvaluationForm
              criteria={criteria() || []}
              initial={draft()}
              onSave={(body, submit) =>
                act(
                  () =>
                    post(`/events/${p.id}/evaluations`, {
                      ...body,
                      crew_id: Number(crewId),
                      submit,
                    }),
                  () => {
                    setSelected('');
                    refetch();
                  },
                )
              }
            />
          )}
        </Show>
      </details>
      <h3>Evaluation review</h3>
      <Async resource={evaluations} retry={refetch}>
        <DataTable
          rows={evaluations()}
          columns={[
            { label: 'CREW', key: 'crew_name' },
            { label: 'EVALUATOR', render: (r) => r.evaluator_name || r.admin_name },
            { label: 'STATUS', render: (r) => <StatusBadge value={r.status} /> },
            { label: '', render: (r) => <A href={`/admin/performance/${r.id}`}>Review →</A> },
          ]}
        />
      </Async>
      <details>
        <summary>Manage external sessions</summary>
        <DataTable
          rows={sessions()}
          columns={[
            { label: 'NAME', key: 'evaluator_name' },
            { label: 'DESCRIPTION', key: 'evaluator_description' },
            {
              label: '',
              render: (s) => (
                <button
                  class="small"
                  disabled={!!s.revoked_at}
                  onClick={async () => {
                    if (await confirm('Revoke this evaluator session?'))
                      act(
                        () => remove(`/events/${p.id}/evaluator-sessions/${s.id}`),
                        refreshSessions,
                      );
                  }}
                >
                  {s.revoked_at ? 'Revoked' : 'Revoke'}
                </button>
              ),
            },
          ]}
        />
      </details>
    </section>
  );
}
export function EventDetail() {
  const params = useParams(),
    navigate = useNavigate();
  const isAdmin = () => user().account_role === 'ADMIN';
  const [data, { refetch }] = createResource(
    () => params.id,
    (id) => api('/events/' + id),
  );
  const [assigned, { refetch: refreshCrew }] = createResource(
    () => isAdmin() && params.id,
    (id) => api(`/events/${id}/crew`),
  );
  const [search, setSearch] = createSignal('');
  const [directory] = createResource(
    () => (isAdmin() ? [search()] : false),
    (v) => api('/crew' + query({ search: v[0], limit: 100 })),
  );
  async function assign(e) {
    e.preventDefault();
    const crew_ids = new FormData(e.currentTarget).getAll('crew').map(Number);
    await act(() => post(`/events/${params.id}/crew`, { crew_ids }), refreshCrew);
  }
  return (
    <>
      <PageHeader
        title={data()?.name || 'Event details'}
        description={data()?.client_name || 'Bring the right people together.'}
      >
        <Show when={isAdmin()}>
          <A class="button" href={`/admin/events/${params.id}/edit`}>
            Edit event
          </A>
          <button
            class="danger"
            onClick={async () => {
              if (
                await confirm(
                  'Archive this event?',
                  'Links will be revoked. Historical performance is preserved.',
                )
              )
                act(
                  () => remove('/events/' + params.id),
                  () => navigate('/admin/events'),
                );
            }}
          >
            Archive
          </button>
        </Show>
      </PageHeader>
      <Async resource={data} retry={refetch}>
        <Show when={data()}>
          {(d) => (
            <section class="panel">
              <div class="event-info">
                <StatusBadge value={d().status} />
                <span>
                  {date(d().start_date)} – {date(d().end_date)}
                </span>
                <span>{d().location}</span>
              </div>
              <p class="preserve-space">{d().description || 'No description provided.'}</p>
            </section>
          )}
        </Show>
      </Async>
      <Show when={isAdmin()}>
        <section class="panel">
          <div class="section-heading">
            <h2>Assigned crew</h2>
            <span class="muted">{assigned()?.length || 0} people</span>
          </div>
          <Async resource={assigned} retry={refreshCrew}>
            <DataTable
              rows={assigned()}
              columns={[
                { label: 'CREW', render: (r) => <A href={`/admin/crew/${r.id}`}>{r.full_name}</A> },
                { label: 'SOURCE', render: (r) => <StatusBadge value={r.assignment_source} /> },
                {
                  label: '',
                  render: (r) => (
                    <button
                      class="small danger"
                      onClick={async () => {
                        if (await confirm('Remove this assignment?'))
                          act(() => remove(`/events/${params.id}/crew/${r.id}`), refreshCrew);
                      }}
                    >
                      Remove
                    </button>
                  ),
                },
              ]}
            />
          </Async>
          <details>
            <summary>Assign existing crew</summary>
            <SearchInput value={search()} onInput={setSearch} placeholder="Find approved crew…" />
            <form onSubmit={assign}>
              <div class="checkbox-grid">
                <For
                  each={directory()?.items.filter((c) => !assigned()?.some((a) => a.id === c.id))}
                >
                  {(c) => (
                    <label>
                      <input type="checkbox" name="crew" value={c.id} />
                      {c.full_name}
                    </label>
                  )}
                </For>
              </div>
              <button class="primary">Assign selected crew</button>
            </form>
          </details>
        </section>
        <RegistrationSettings id={params.id} />
        <EvaluationSection id={params.id} crew={assigned() || []} />
      </Show>
    </>
  );
}
export function EventRegistrations() {
  const params = useParams();
  const [status, setStatus] = createSignal('');
  const [data, { refetch }] = createResource(
    () => params.id,
    (id) => api(`/events/${id}/applications`),
  );
  async function review(r, approve) {
    if (
      !(await confirm(
        approve ? 'Approve this application?' : 'Reject this application?',
        approve
          ? 'The crew member will be assigned if capacity is available.'
          : 'The applicant will see the rejection status.',
      ))
    )
      return;
    const reason = approve ? '' : await prompt('Reason (optional)');
    if (reason === undefined) return;
    act(
      () =>
        post(`/events/${params.id}/applications/${r.id}/${approve ? 'approve' : 'reject'}`, {
          reason,
        }),
      refetch,
    );
  }
  return (
    <>
      <PageHeader
        title="Event applications"
        description="Account approval and event participation are reviewed separately."
      >
        <A class="button" href={`/admin/events/${params.id}`}>
          Back to event
        </A>
      </PageHeader>
      <section class="panel">
        <div class="toolbar">
          <select
            aria-label="Application status"
            onChange={(e) => setStatus(e.currentTarget.value)}
          >
            <option value="">All applications</option>
            <For each={['PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN']}>
              {(s) => <option>{s}</option>}
            </For>
          </select>
          <span class="muted">{data()?.length || 0} applications</span>
        </div>
        <Async resource={data} retry={refetch}>
          <DataTable
            rows={data()?.filter((r) => !status() || r.application_status === status())}
            columns={[
              {
                label: 'APPLICANT',
                render: (r) => <A href={`/admin/crew/${r.crew_id}`}>{r.full_name}</A>,
              },
              { label: 'ACCOUNT', render: (r) => <StatusBadge value={r.approval_state} /> },
              { label: 'APPLICATION', render: (r) => <StatusBadge value={r.application_status} /> },
              { label: 'APPLIED', render: (r) => date(r.applied_at) },
              {
                label: '',
                render: (r) => (
                  <Show when={r.application_status === 'PENDING'}>
                    <div class="actions">
                      <button
                        class="primary small"
                        disabled={r.approval_state !== 'APPROVED'}
                        onClick={() => review(r, true)}
                      >
                        Approve
                      </button>
                      <button class="small" onClick={() => review(r, false)}>
                        Reject
                      </button>
                    </div>
                  </Show>
                ),
              },
            ]}
          />
        </Async>
      </section>
    </>
  );
}
