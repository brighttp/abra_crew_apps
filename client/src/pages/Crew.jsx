import { createResource, createSignal, For, Show } from 'solid-js';
import { A, useNavigate, useParams } from '@solidjs/router';
import { Plus, ArrowUpRight } from 'lucide-solid';
import { api, post, patch, put, remove, query } from '../services/api';
import { user } from '../stores/auth';
import {
  PageHeader,
  Async,
  DataTable,
  SearchInput,
  Pagination,
  Avatar,
  SkillTag,
  score,
  act,
  confirm,
  prompt,
  FormField,
  StatCard,
  StatusBadge,
  EmptyState,
  date,
} from '../components/ui';
import { lazy } from 'solid-js';
const PerformanceChart = lazy(() => import('../components/PerformanceChart'));
export function CrewList(p) {
  const [search, setSearch] = createSignal(''),
    [skill, setSkill] = createSignal(''),
    [sort, setSort] = createSignal('name'),
    [page, setPage] = createSignal(1);
  const [skills] = createResource(() => api('/skills'));
  const [data, { refetch }] = createResource(
    () => [search(), skill(), sort(), page(), p.approvals],
    (v) =>
      api(
        `/crew${v[4] ? '/pending-approvals' : ''}` +
          query({ search: v[0], skill_id: v[1], sort: v[2], page: v[3] }),
      ),
  );
  async function review(id, approval) {
    if (
      await confirm(
        approval ? 'Approve this account?' : 'Reject this account?',
        'Account approval does not approve event participation.',
      )
    )
      await act(() => post(`/crew/${id}/${approval ? 'approve' : 'reject'}`), refetch);
  }
  return (
    <>
      <PageHeader
        title={p.approvals ? 'Account approvals' : 'Crew directory'}
        description={
          p.approvals
            ? 'Review new accounts before granting crew access.'
            : 'The people who make it happen.'
        }
      >
        <A class="button primary" href="/admin/crew/new">
          <Plus size={16} /> Add crew
        </A>
      </PageHeader>
      <section class="panel" classList={{ 'crew-directory': !p.approvals }}>
        <div class="toolbar">
          <SearchInput
            value={search()}
            onInput={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search name or username…"
          />
          <select
            aria-label="Filter skill"
            value={skill()}
            onChange={(e) => {
              setSkill(e.currentTarget.value);
              setPage(1);
            }}
          >
            <option value="">All skills</option>
            <For each={skills()}>{(s) => <option value={s.id}>{s.name}</option>}</For>
          </select>
          <select
            aria-label="Sort crew"
            value={sort()}
            onChange={(e) => {
              setSort(e.currentTarget.value);
              setPage(1);
            }}
          >
            <option value="name">Name A–Z</option>
            <option value="events">Most events</option>
            <option value="rating">Highest score</option>
          </select>
        </div>
        <Async resource={data} retry={refetch}>
          <Show when={!p.approvals}>
            <Show
              when={data()?.items?.length}
              fallback={
                <EmptyState title="No crew found" description="Try another name or skill filter." />
              }
            >
              <div class="crew-profile-grid">
                <For each={data()?.items}>
                  {(r) => (
                    <article
                      class="crew-profile-card"
                      style={{ '--profile-hue': String((r.id * 47 + 90) % 360) }}
                    >
                      <div class="crew-profile-avatar">
                        <Avatar name={r.full_name} photo={r.profile_photo_path} id={r.id} />
                      </div>
                      <h2>{r.full_name}</h2>
                      <p class="crew-profile-username">@{r.username}</p>
                      <div class="crew-profile-skills">
                        <For each={r.skills?.slice(0, 2)}>{(s) => <SkillTag name={s.name} />}</For>
                        <Show when={r.skills?.length > 2}>
                          <span class="crew-more-skills">+{r.skills.length - 2}</span>
                        </Show>
                        <Show when={!r.skills?.length}>
                          <span class="muted">Crew member</span>
                        </Show>
                      </div>
                      <dl class="crew-profile-stats">
                        <div>
                          <dt>Events</dt>
                          <dd>{r.total_events}</dd>
                        </div>
                        <div>
                          <dt>Score / 5</dt>
                          <dd title={score(r.overall_score)}>
                            {r.overall_score == null ? '—' : score(r.overall_score)}
                          </dd>
                        </div>
                        <div>
                          <dt>Skills</dt>
                          <dd>{r.skills?.length || 0}</dd>
                        </div>
                      </dl>
                      <A
                        class="crew-profile-link"
                        href={`/admin/crew/${r.id}`}
                        aria-label={`View profile of ${r.full_name}`}
                      >
                        View profile <ArrowUpRight size={16} />
                      </A>
                    </article>
                  )}
                </For>
              </div>
            </Show>
          </Show>
          <Show when={p.approvals}>
            <DataTable
              rows={data()?.items}
              columns={[
                {
                  label: 'CREW MEMBER',
                  render: (r) => (
                    <A class="person" href={`/admin/crew/${r.id}`}>
                      <Avatar name={r.full_name} photo={r.profile_photo_path} id={r.id} />
                      <span>
                        {r.full_name}
                        <small>@{r.username}</small>
                      </span>
                    </A>
                  ),
                },
                {
                  label: 'SKILLS',
                  render: (r) => (
                    <div class="tags">
                      <For each={r.skills}>{(s) => <SkillTag name={s.name} />}</For>
                    </div>
                  ),
                },
                { label: 'EVENTS', key: 'total_events' },
                {
                  label: 'PERFORMANCE',
                  render: (r) => (
                    <span classList={{ accent: r.overall_score != null }}>
                      {score(r.overall_score)}
                    </span>
                  ),
                },
                {
                  label: '',
                  render: (r) =>
                    p.approvals ? (
                      <div class="actions">
                        <button class="primary small" onClick={() => review(r.id, true)}>
                          Approve
                        </button>
                        <button class="small" onClick={() => review(r.id, false)}>
                          Reject
                        </button>
                      </div>
                    ) : (
                      <A href={`/admin/crew/${r.id}`} aria-label={'View ' + r.full_name}>
                        <ArrowUpRight size={18} />
                      </A>
                    ),
                },
              ]}
            />
          </Show>
          <Pagination data={data()} onPage={setPage} />
        </Async>
      </section>
    </>
  );
}
export function CrewForm() {
  const params = useParams(),
    navigate = useNavigate();
  const [data] = createResource(
    () => params.id,
    (id) => api('/crew/' + id),
  );
  const [busy, setBusy] = createSignal(false);
  async function submit(e) {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    await act(
      () => (params.id ? patch('/crew/' + params.id, body) : post('/crew', body)),
      (result) => navigate('/admin/crew/' + (params.id || result.id)),
    );
    setBusy(false);
  }
  return (
    <>
      <PageHeader
        title={params.id ? 'Edit crew profile' : 'Add a crew member'}
        description="Admin-created accounts are approved immediately."
      />
      <Show when={!params.id || data()}>
        <form class="panel form-panel stack" onSubmit={submit}>
          <label class="field">
            <span>Full name *</span>
            <input name="full_name" value={data()?.full_name || ''} required maxlength="200" />
          </label>
          <Show when={!params.id}>
            <label class="field">
              <span>Username *</span>
              <input name="username" required minlength="3" pattern="[a-zA-Z0-9_.\-]+" />
            </label>
            <label class="field">
              <span>Initial password *</span>
              <input
                name="password"
                type="password"
                required
                minlength="8"
                autocomplete="new-password"
              />
              <small>At least 8 characters.</small>
            </label>
          </Show>
          <label class="field">
            <span>Email</span>
            <input name="email" type="email" value={data()?.email || ''} />
          </label>
          <label class="field">
            <span>Phone number</span>
            <input name="phone" type="tel" maxlength="40" value={data()?.phone || ''} />
          </label>
          <div class="actions">
            <button class="primary" disabled={busy()}>
              Save crew
            </button>
            <A class="button" href="/admin/crew">
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
export function CrewDetail(p) {
  const params = useParams(),
    navigate = useNavigate();
  const isAdmin = () => user().account_role === 'ADMIN';
  const crewId = () => (p.self ? user().id : params.id);
  const [data, { refetch }] = createResource(crewId, (id) => api('/crew/' + id));
  const [skills] = createResource(() => api('/skills'));
  const [editing, setEditing] = createSignal(false);
  async function saveProfile(e) {
    e.preventDefault();
    await act(
      () => patch('/crew/' + crewId(), Object.fromEntries(new FormData(e.currentTarget))),
      async () => {
        await refetch();
        setEditing(false);
      },
    );
  }
  async function photo(e) {
    const file = e.currentTarget.files[0];
    if (file) {
      const body = new FormData();
      body.append('photo', file);
      await act(() => api(`/crew/${crewId()}/photo`, { method: 'POST', body }), refetch);
    }
  }
  return (
    <>
      <PageHeader
        title={p.self ? 'My profile' : 'Crew profile'}
        description="Experience, skills, and progress in one place."
      >
        <Show when={isAdmin()}>
          <A class="button" href={`/admin/crew/${crewId()}/edit`}>
            Edit profile
          </A>
          <button
            onClick={async () => {
              const password = await prompt('Set a new password', '', 'password');
              if (password !== undefined)
                act(
                  () => post(`/crew/${crewId()}/reset-password`, { password }),
                  null,
                  'Password reset. Existing sessions are invalid.',
                );
            }}
          >
            Reset password
          </button>
          <button
            class="danger"
            onClick={async () => {
              if (
                await confirm(
                  'Archive this crew account?',
                  'Login will be disabled. Historical records remain available.',
                )
              )
                act(
                  () => remove('/crew/' + crewId()),
                  () => navigate('/admin/crew'),
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
            <>
              <section class="panel profile-summary">
                <div class="person">
                  <Avatar name={d().full_name} photo={d().profile_photo_path} id={crewId()} />
                  <div>
                    <h2>{d().full_name}</h2>
                    <span class="muted">@{d().username}</span>
                  </div>
                </div>
                <div class="contact-info">
                  <span>{d().email || 'No email'}</span>
                  <span>{d().phone || 'No phone number'}</span>
                </div>
                <label class="button">
                  Upload photo
                  <input
                    class="sr-only"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={photo}
                  />
                </label>
                <Show when={p.self}>
                  <button onClick={() => setEditing(!editing())}>Edit profile</button>
                </Show>
              </section>
              <Show when={editing()}>
                <form class="panel stack form-panel" onSubmit={saveProfile}>
                  <label class="field">
                    <span>Full name</span>
                    <input name="full_name" value={d().full_name} required />
                  </label>
                  <label class="field">
                    <span>Email</span>
                    <input name="email" type="email" value={d().email || ''} />
                  </label>
                  <label class="field">
                    <span>Phone</span>
                    <input name="phone" value={d().phone || ''} />
                  </label>
                  <button class="primary">Save changes</button>
                </form>
              </Show>
              <div class="stats-grid three">
                <StatCard label="Total events" value={d().events.length} />
                <StatCard
                  label="Overall performance"
                  value={score(d().performance.overall_score)}
                  accent
                />
                <StatCard label="Evaluated events" value={d().performance.eligible_events} />
              </div>
              <section class="panel">
                <h2>Skill tags</h2>
                <div class="tags">
                  <For each={d().skills}>{(s) => <SkillTag name={s.name} />}</For>
                  <Show when={!d().skills.length}>
                    <p class="muted">No skills assigned yet.</p>
                  </Show>
                </div>
                <Show when={isAdmin()}>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const skill_ids = new FormData(e.currentTarget).getAll('skills').map(Number);
                      await act(() => put(`/crew/${crewId()}/skills`, { skill_ids }), refetch);
                    }}
                  >
                    <div class="checkbox-grid">
                      <For each={skills()}>
                        {(s) => (
                          <label>
                            <input
                              type="checkbox"
                              name="skills"
                              value={s.id}
                              checked={d().skills.some((v) => v.id === s.id)}
                            />
                            {s.name}
                          </label>
                        )}
                      </For>
                    </div>
                    <button class="small">Save skill tags</button>
                  </form>
                </Show>
              </section>
              <div class="two-columns">
                <section class="panel">
                  <h2>Performance trend</h2>
                  <PerformanceChart items={d().performance.history} />
                </section>
                <section class="panel">
                  <h2>Category scores</h2>
                  <For each={d().performance.categories}>
                    {(c) => (
                      <div class="activity-row">
                        <span>{c.name}</span>
                        <strong>{score(c.score)}</strong>
                      </div>
                    )}
                  </For>
                  <Show when={!d().performance.categories.length}>
                    <p class="muted">Not Evaluated</p>
                  </Show>
                </section>
              </div>
              <section class="panel">
                <h2>Event history</h2>
                <DataTable
                  rows={d().events}
                  columns={[
                    {
                      label: 'EVENT',
                      render: (r) => (
                        <A href={`${isAdmin() ? '/admin' : '/crew'}/events/${r.id}`}>{r.name}</A>
                      ),
                    },
                    { label: 'DATE', render: (r) => date(r.start_date) },
                    { label: 'STATUS', render: (r) => <StatusBadge value={r.status} /> },
                  ]}
                />
              </section>
            </>
          )}
        </Show>
      </Async>
    </>
  );
}
