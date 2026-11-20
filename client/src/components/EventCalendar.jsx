import { createSignal, createMemo, createResource, For, Show } from 'solid-js';
import { A } from '@solidjs/router';
import { ChevronLeft, ChevronRight } from 'lucide-solid';
import { api } from '../services/api';
import { date, StatusBadge } from './ui';

const key = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export default function EventCalendar(props) {
  const today = new Date();
  const [month, setMonth] = createSignal(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = createSignal(key(today));
  const range = createMemo(() => {
    const m = month();
    return { from: key(m), to: key(new Date(m.getFullYear(), m.getMonth() + 1, 0)) };
  });
  const [events, { refetch }] = createResource(range, (r) =>
    api(`/events/calendar?from=${r.from}&to=${r.to}`),
  );
  const currentEvents = () => (events.loading || events.error ? [] : events() || []);
  const onDay = (day) =>
    currentEvents().filter(
      (e) => e.start_date.slice(0, 10) <= day && e.end_date.slice(0, 10) >= day,
    );
  const cells = createMemo(() => {
    const m = month(),
      offset = (m.getDay() + 6) % 7;
    const days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    return Array.from({ length: Math.ceil((offset + days) / 7) * 7 }, (_, i) => {
      const n = i - offset + 1;
      return n > 0 && n <= days
        ? { n, key: key(new Date(m.getFullYear(), m.getMonth(), n)) }
        : null;
    });
  });
  function move(delta) {
    const next = new Date(month().getFullYear(), month().getMonth() + delta, 1);
    setMonth(next);
    setSelected(key(next));
  }
  return (
    <section class="panel event-calendar" aria-label="Event calendar">
      <div class="section-heading calendar-heading">
        <div>
          <h2>Event calendar</h2>
          <p class="muted text-xs">Select a date to explore its events.</p>
        </div>
        <button
          class="button"
          onClick={() => {
            setMonth(new Date(today.getFullYear(), today.getMonth(), 1));
            setSelected(key(today));
          }}
        >
          Today
        </button>
      </div>
      <div class="calendar-navigation">
        <button class="icon-button" aria-label="Previous month" onClick={() => move(-1)}>
          <ChevronLeft size={20} />
        </button>
        <h3 aria-live="polite">
          {month().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </h3>
        <button class="icon-button" aria-label="Next month" onClick={() => move(1)}>
          <ChevronRight size={20} />
        </button>
      </div>
      <Show when={events.error}>
        <p role="alert">
          Unable to load events.{' '}
          <button class="button" onClick={refetch}>
            Retry
          </button>
        </p>
      </Show>
      <div class="calendar-grid" aria-busy={events.loading}>
        <For each={['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']}>
          {(day) => <span class="calendar-weekday">{day}</span>}
        </For>
        <For each={cells()}>
          {(day) => (
            <Show when={day} fallback={<div class="calendar-blank" />}>
              <button
                class="calendar-day"
                classList={{
                  'is-today': day.key === key(today),
                  'is-selected': day.key === selected(),
                }}
                aria-pressed={day.key === selected()}
                aria-current={day.key === key(today) ? 'date' : undefined}
                aria-label={`${date(day.key)}, ${onDay(day.key).length} events`}
                onClick={() => setSelected(day.key)}
              >
                <span class="calendar-number">{day.n}</span>
                <span class="calendar-event-labels">
                  <For each={onDay(day.key).slice(0, 2)}>
                    {(e) => <span title={e.name}>{e.name}</span>}
                  </For>
                  <Show when={onDay(day.key).length > 2}>
                    <span>+{onDay(day.key).length - 2} more</span>
                  </Show>
                </span>
                <Show when={onDay(day.key).length}>
                  <span class="calendar-count">
                    {onDay(day.key).length}
                    <span class="sr-only"> events</span>
                  </span>
                </Show>
              </button>
            </Show>
          )}
        </For>
      </div>
      <div class="calendar-agenda" aria-live="polite">
        <h3>{date(selected())}</h3>
        <Show when={!events.loading} fallback={<p class="muted">Loading events…</p>}>
          <Show
            when={!events.error && onDay(selected()).length}
            fallback={
              <p class="muted">
                {events.error ? 'Events unavailable.' : 'No events scheduled for this date.'}
              </p>
            }
          >
            <For each={onDay(selected())}>
              {(e) => (
                <A class="calendar-agenda-event" href={`${props.base}/events/${e.id}`}>
                  <div>
                    <strong>{e.name}</strong>
                    <span class="muted">
                      {date(e.start_date)} – {date(e.end_date)}
                    </span>
                  </div>
                  <StatusBadge value={e.status} />
                </A>
              )}
            </For>
          </Show>
        </Show>
      </div>
    </section>
  );
}
