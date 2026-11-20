import { createResource, createSignal, For } from 'solid-js';
import { api, query } from '../services/api';
import { PageHeader, DateRangePicker, FormField } from '../components/ui';
import { Download } from 'lucide-solid';
export default function Reports() {
  const [from, setFrom] = createSignal(''),
    [to, setTo] = createSignal(''),
    [event, setEvent] = createSignal('');
  const [events] = createResource(() => api('/events?limit=100'));
  const reports = [
    ['crew', 'Crew directory', 'Crew profiles and contact information.'],
    ['participation', 'Event participation', 'Crew participation across events.'],
    ['assignments', 'Assignment lists', 'Assigned crew and assignment sources.'],
    ['registrations', 'Registration results', 'Event application statuses.'],
    ['performance', 'Performance ranking', 'Equal-weighted scores from completed events.'],
    ['evaluations', 'Evaluation summary', 'Individual evaluation averages and publication status.'],
  ];
  return (
    <>
      <PageHeader
        title="Reports"
        description="Turn your operational data into useful, shareable reports."
      />
      <section class="panel">
        <div class="toolbar">
          <DateRangePicker from={from()} to={to()} onFrom={setFrom} onTo={setTo} />
          <label class="field">
            <span>Event</span>
            <select value={event()} onChange={(e) => setEvent(e.currentTarget.value)}>
              <option value="">All events</option>
              <For each={events()?.items}>{(e) => <option value={e.id}>{e.name}</option>}</For>
            </select>
          </label>
        </div>
        <p class="muted text-xs">
          Date filters use the event end date. Crew directory exports include all current crew.
        </p>
      </section>
      <div class="report-grid">
        <For each={reports}>
          {([key, title, description]) => (
            <section class="panel report-card">
              <Download size={22} class="accent" />
              <h2>{title}</h2>
              <p class="muted">{description}</p>
              <div class="actions">
                <For each={['csv', 'xlsx']}>
                  {(format) => (
                    <a
                      class="button"
                      href={
                        '/api/admin/reports/' +
                        key +
                        query({ format, from: from(), to: to(), event_id: event() })
                      }
                    >
                      {format.toUpperCase()} <Download size={14} />
                    </a>
                  )}
                </For>
              </div>
            </section>
          )}
        </For>
      </div>
    </>
  );
}
