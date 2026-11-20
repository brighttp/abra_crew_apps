import { For, Show, createSignal, onCleanup, onMount } from 'solid-js';
import { A } from '@solidjs/router';
import Swal from 'sweetalert2';
import { ChevronLeft, ChevronRight, Plus, ArrowUpRight, Users, Search } from 'lucide-solid';
const theme = {
  background: '#202630',
  color: '#F3F4F6',
  confirmButtonColor: '#D8F56A',
  cancelButtonColor: '#343C47',
};
export const notice = (title, icon = 'success') =>
  Swal.fire({
    ...theme,
    title,
    icon,
    toast: true,
    position: 'top-end',
    timer: 3500,
    showConfirmButton: false,
  });
export const confirm = async (title, text = 'This action changes saved data.') =>
  (
    await Swal.fire({
      ...theme,
      title,
      text,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Confirm',
    })
  ).isConfirmed;
export const prompt = async (title, value = '', type = 'text') => {
  const r = await Swal.fire({
    ...theme,
    title,
    input: type,
    inputValue: value,
    showCancelButton: true,
  });
  return r.isConfirmed ? r.value : undefined;
};
export async function act(fn, done, message = 'Saved successfully') {
  try {
    const result = await fn();
    if (done) await done(result);
    if (message) notice(message);
    return result;
  } catch (e) {
    notice(e.message, 'error');
  }
}
export const score = (v) => (v == null ? 'Not Evaluated' : Number(v).toFixed(2));
export const date = (v) =>
  v
    ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(
        new Date(String(v).slice(0, 10) + 'T12:00:00'),
      )
    : '—';
export function PageHeader(p) {
  return (
    <header class="page-heading">
      <div>
        <p class="eyebrow">{p.eyebrow || 'ABRACODEBRA / CREW OS'}</p>
        <h1>{p.title}</h1>
        <p class="muted">{p.description}</p>
      </div>
      <div class="actions">{p.children}</div>
    </header>
  );
}
export function StatCard(p) {
  return (
    <div class="stat-card">
      <div class="stat-label">
        {p.label}
        {p.icon && <p.icon size={17} />}
      </div>
      <strong
        classList={{
          accent: p.accent,
          'stat-text-value': typeof p.value === 'string' && p.value.length > 8,
        }}
      >
        {p.value ?? '—'}
      </strong>
      <span class="muted text-xs">{p.note}</span>
    </div>
  );
}
export function StatusBadge(p) {
  return (
    <span class={'badge badge-' + String(p.value).toLowerCase()}>
      {String(p.value || '—').replaceAll('_', ' ')}
    </span>
  );
}
export function SkillTag(p) {
  return <span class="skill-tag">{p.name}</span>;
}
export function Avatar(p) {
  return (
    <span class="avatar">
      <Show
        when={p.photo}
        fallback={p.name
          ?.split(' ')
          .slice(0, 2)
          .map((s) => s[0])
          .join('')}
      >
        <img src={`/api/crew/${p.id}/photo`} alt="" />
      </Show>
    </span>
  );
}
export function EmptyState(p) {
  return (
    <div class="empty">
      <Users size={28} />
      <h3>{p.title || 'Nothing here yet'}</h3>
      <p class="muted">{p.description || 'Your saved records will appear here.'}</p>
      {p.children}
    </div>
  );
}
export function LoadingSkeleton() {
  return (
    <div class="skeleton" role="status" aria-label="Loading">
      <div />
      <div />
      <div />
    </div>
  );
}
export function Async(p) {
  return (
    <Show
      when={!p.resource.error}
      fallback={
        <div class="error" role="alert">
          {p.resource.error?.message}
          <button onClick={p.retry}>Try again</button>
        </div>
      }
    >
      <Show when={!p.resource.loading} fallback={<LoadingSkeleton />}>
        {p.children}
      </Show>
    </Show>
  );
}
export function FormField(p) {
  return (
    <label class="field">
      <span>
        {p.label}
        {p.required ? ' *' : ''}
      </span>
      <Show
        when={p.children}
        fallback={
          <input
            type={p.type || 'text'}
            value={p.value ?? ''}
            onInput={(e) => p.onInput?.(e.currentTarget.value)}
            required={p.required}
            min={p.min}
            max={p.max}
            minLength={p.minLength}
            autocomplete={p.autocomplete}
            placeholder={p.placeholder}
          />
        }
      >
        {p.children}
      </Show>
      <Show when={p.hint}>
        <small>{p.hint}</small>
      </Show>
    </label>
  );
}
export function SearchInput(p) {
  return (
    <label class="search-input">
      <Search size={17} />
      <input
        aria-label={p.label || 'Search'}
        placeholder={p.placeholder || 'Search…'}
        value={p.value}
        onInput={(e) => p.onInput(e.currentTarget.value)}
      />
    </label>
  );
}
export function Pagination(p) {
  return (
    <div class="pagination">
      <span>
        {p.data?.total || 0} records · Page {p.data?.page || 1}
      </span>
      <div class="actions">
        <button
          class="icon-button"
          aria-label="Previous page"
          disabled={!p.data || p.data.page <= 1}
          onClick={() => p.onPage(p.data.page - 1)}
        >
          <ChevronLeft size={17} />
        </button>
        <button
          class="icon-button"
          aria-label="Next page"
          disabled={!p.data || p.data.page * p.data.limit >= p.data.total}
          onClick={() => p.onPage(p.data.page + 1)}
        >
          <ChevronRight size={17} />
        </button>
      </div>
    </div>
  );
}
export function DataTable(p) {
  return (
    <Show when={p.rows?.length} fallback={<EmptyState title={p.empty || 'No matching records'} />}>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <For each={p.columns}>{(c) => <th>{c.label}</th>}</For>
            </tr>
          </thead>
          <tbody>
            <For each={p.rows}>
              {(row) => (
                <tr>
                  <For each={p.columns}>
                    {(c) => (
                      <td data-label={c.label} classList={{ 'table-actions': !c.label }}>
                        {c.render ? c.render(row) : (row[c.key] ?? '—')}
                      </td>
                    )}
                  </For>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </Show>
  );
}
export function EventCard(p) {
  return (
    <A class="event-card" href={`${p.base}/events/${p.event.id}`}>
      <div class="flex justify-between gap-3">
        <StatusBadge value={p.event.status} />
        <ArrowUpRight size={17} />
      </div>
      <h3>{p.event.name}</h3>
      <p class="muted">{p.event.client_name || p.event.location}</p>
      <Show when={p.base === '/admin'}>
        <div class="muted text-xs">
          <span>Registration {p.event.registration_availability?.toLowerCase() || 'closed'}</span>
          <span class="block mt-1">
            {p.event.evaluated_crew} / {p.event.crew_count} crew evaluated
          </span>
        </div>
      </Show>
      <footer>
        <span>{date(p.event.start_date)}</span>
        <span>{p.event.crew_count} crew</span>
      </footer>
    </A>
  );
}
export function RatingInput(p) {
  return (
    <fieldset class="rating">
      <legend>{p.label}</legend>
      <div class="rating-options">
        <For each={[1, 2, 3, 4, 5]}>
          {(n) => (
            <label classList={{ selected: p.value === n }}>
              <input
                type="radio"
                name={p.name}
                value={n}
                checked={p.value === n}
                onChange={() => p.onChange(n)}
                required
                disabled={p.disabled}
              />
              <span>{n}</span>
            </label>
          )}
        </For>
      </div>
      <div class="rating-scale">
        <span>Poor</span>
        <span>Excellent</span>
      </div>
    </fieldset>
  );
}
export function EvaluationForm(p) {
  const [scores, setScores] = createSignal(
    Object.fromEntries((p.initial?.scores || []).map((s) => [s.event_criterion_id, s.score])),
  );
  const [feedback, setFeedback] = createSignal(p.initial?.feedback_original || '');
  const [busy, setBusy] = createSignal(false);
  async function save(submit) {
    if (
      submit &&
      !(await confirm('Submit this evaluation?', 'You can no longer edit it after submission.'))
    )
      return;
    setBusy(true);
    try {
      await p.onSave(
        {
          scores: p.criteria.map((c) => ({ event_criterion_id: c.id, score: scores()[c.id] })),
          feedback: feedback(),
        },
        submit,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save(true);
      }}
      class="stack"
    >
      <For each={p.criteria}>
        {(c) => (
          <RatingInput
            name={'criterion-' + c.id}
            label={c.criterion_name_snapshot}
            value={scores()[c.id]}
            onChange={(v) => setScores((s) => ({ ...s, [c.id]: v }))}
          />
        )}
      </For>
      <FormField label="Written feedback">
        <textarea
          rows="4"
          maxlength="5000"
          value={feedback()}
          onInput={(e) => setFeedback(e.currentTarget.value)}
          placeholder="Share specific observations and suggestions."
        />
      </FormField>
      <div class="actions">
        <button
          type="button"
          disabled={busy() || Object.keys(scores()).length !== p.criteria.length}
          onClick={() => save(false)}
        >
          Save draft
        </button>
        <button class="primary" disabled={busy()}>
          Submit evaluation
        </button>
      </div>
    </form>
  );
}
export function DateRangePicker(p) {
  return (
    <div class="date-range">
      <FormField label="From" type="date" value={p.from} onInput={p.onFrom} />
      <FormField label="To" type="date" value={p.to} onInput={p.onTo} />
    </div>
  );
}
