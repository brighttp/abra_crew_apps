import { createResource, For, Show } from 'solid-js';
import { A } from '@solidjs/router';
import { Users, CalendarDays, ChartNoAxesCombined, Clock, Plus, ArrowUpRight } from 'lucide-solid';
import { api } from '../services/api';
import { user } from '../stores/auth';
import { StatCard, Async, EventCard, EmptyState, score, StatusBadge, date } from '../components/ui';
import { lazy } from 'solid-js';
import brandImage from '../assets/sidebar-logo-320.webp';
import brandImageLarge from '../assets/sidebar-logo-554.webp';
import brandFallback from '../assets/sidebar-logo.png';
import EventCalendar from '../components/EventCalendar';
import CrewLeaderboard from '../components/CrewLeaderboard';
const PerformanceChart = lazy(() => import('../components/PerformanceChart'));
export default function Dashboard() {
  const isAdmin = () => user().account_role === 'ADMIN';
  const [data, { refetch }] = createResource(async () =>
    isAdmin() ? api('/admin/dashboard') : api('/me/performance'),
  );
  const [events] = createResource(() => api('/events?limit=3'));
  return (
    <>
      <header class="dashboard-heading">
        <h1 class="dashboard-logo">
          <picture>
            <source
              type="image/webp"
              srcset={`${brandImage} 320w, ${brandImageLarge} 554w`}
              sizes="(max-width: 500px) 80vw, 360px"
            />
            <img src={brandFallback} width="554" height="162" alt="Abracodebra" decoding="async" />
          </picture>
        </h1>
        <Show when={isAdmin()}>
          <A class="button primary" href="/admin/events/new">
            <Plus size={16} /> Create event
          </A>
        </Show>
      </header>
      <Async resource={data} retry={refetch}>
        <Show when={data()}>
          {(d) => (
            <>
              <div class="stats-grid" classList={{ 'crew-stats': !isAdmin() }}>
                <Show
                  when={isAdmin()}
                  fallback={
                    <>
                      <StatCard
                        label="Overall performance"
                        value={score(d().overall_score)}
                        accent
                        icon={ChartNoAxesCombined}
                        note="Published · completed events"
                      />
                      <StatCard
                        label="Evaluated events"
                        value={d().eligible_events}
                        icon={CalendarDays}
                      />
                      <StatCard
                        label="Published evaluations"
                        value={d().published_evaluations}
                        icon={Users}
                      />
                    </>
                  }
                >
                  <StatCard
                    label="Active crew"
                    value={d().total_crew}
                    icon={Users}
                    note="Approved crew accounts"
                  />
                  <StatCard
                    label="Total events"
                    value={d().total_events}
                    icon={CalendarDays}
                    note={`${d().completed_events} completed`}
                  />
                  <StatCard
                    label="Upcoming events"
                    value={d().upcoming_events}
                    icon={Clock}
                    note={`${d().ongoing_events} ongoing`}
                  />
                  <StatCard
                    label="Average performance"
                    value={score(d().average_performance)}
                    accent
                    icon={ChartNoAxesCombined}
                    note="Out of 5 · evaluated crew"
                  />
                </Show>
              </div>
              <Show
                when={
                  isAdmin() && (d().pending_accounts || 0) + (d().pending_applications || 0) > 0
                }
              >
                <div class="attention">
                  <div>
                    <strong>A little attention goes a long way.</strong>
                    <p>
                      {d().pending_accounts} account approvals · {d().pending_applications} event
                      applications waiting for review
                    </p>
                  </div>
                  <A class="button" href="/admin/crew/approvals">
                    Review accounts <ArrowUpRight size={16} />
                  </A>
                </div>
              </Show>
              <Show when={isAdmin()}>
                <div class="actions mb-5 text-xs muted">
                  <span>Evaluations:</span>
                  <For each={d().evaluations}>
                    {(item) => (
                      <span>
                        {item.count} {item.status.toLowerCase()}
                      </span>
                    )}
                  </For>
                  <Show when={!d().evaluations?.length}>
                    <span>No evaluations yet</span>
                  </Show>
                </div>
              </Show>
              <EventCalendar base={isAdmin() ? '/admin' : '/crew'} />
              <div class="section-heading">
                <h2>{isAdmin() ? 'Recent events' : 'Your events'}</h2>
                <A href={`${isAdmin() ? '/admin' : '/crew'}/events`}>
                  View all <ArrowUpRight size={14} />
                </A>
              </div>
              <Show
                when={events()?.items?.length}
                fallback={
                  <EmptyState
                    title="Your next event starts here"
                    description={
                      isAdmin()
                        ? 'Create an event and bring the right people together.'
                        : 'Your assigned events will appear here.'
                    }
                  />
                }
              >
                <div class="event-grid">
                  <For each={events()?.items}>
                    {(e) => <EventCard event={e} base={isAdmin() ? '/admin' : '/crew'} />}
                  </For>
                </div>
              </Show>
              <div classList={{ 'two-columns': !isAdmin(), 'dashboard-bottom': !isAdmin() }}>
                <Show
                  when={isAdmin()}
                  fallback={
                    <section class="panel">
                      <div class="section-heading">
                        <h2>{isAdmin() ? 'Crew performance' : 'Your performance trend'}</h2>
                        <span class="muted text-xs">PUBLISHED RESULTS</span>
                      </div>
                      <Show
                        when={isAdmin() ? d().rankings?.length : d().history?.length}
                        fallback={
                          <EmptyState
                            title="Performance takes shape here"
                            description="Scores appear after evaluations are published and events are completed."
                          />
                        }
                      >
                        <PerformanceChart
                          bar={isAdmin()}
                          items={
                            isAdmin()
                              ? d().rankings.map((r) => ({
                                  name: r.full_name,
                                  score: r.overall_score,
                                }))
                              : d().history
                          }
                        />
                      </Show>
                    </section>
                  }
                >
                  <CrewLeaderboard items={d().rankings || []} />
                </Show>
                <Show when={!isAdmin()}>
                  <section class="panel">
                    <div class="section-heading">
                      <h2>Category scores</h2>
                    </div>
                    <For each={d().categories}>
                      {(c) => (
                        <div class="activity-row">
                          <span>{c.name}</span>
                          <strong class="accent">{score(c.score)}</strong>
                        </div>
                      )}
                    </For>
                  </section>
                </Show>
              </div>
            </>
          )}
        </Show>
      </Async>
    </>
  );
}
