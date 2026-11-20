import { For, Show } from 'solid-js';
import { A } from '@solidjs/router';
import { Trophy, ArrowUpRight } from 'lucide-solid';
import { Avatar, EmptyState, score } from './ui';

export default function CrewLeaderboard(props) {
  const rank = (item) =>
    props.items.findIndex((r) => score(r.overall_score) === score(item.overall_score)) + 1;
  return (
    <section class="panel crew-leaderboard">
      <div class="section-heading">
        <div>
          <span class="leaderboard-eyebrow">
            <Trophy size={14} /> THE PEOPLE BEHIND THE EXPERIENCE
          </span>
          <h2>Crew leaderboard</h2>
        </div>
        <A href="/admin/performance">
          View all <ArrowUpRight size={15} />
        </A>
      </div>
      <p class="leaderboard-description">Top crew · Published evaluations from completed events.</p>
      <Show
        when={props.items.length}
        fallback={
          <EmptyState
            title="Every great crew starts somewhere"
            description="Crew rankings appear once evaluations are published for completed events."
          />
        }
      >
        <ol class="leaderboard-list">
          <For each={props.items}>
            {(r) => (
              <li>
                <A
                  class="leaderboard-row"
                  classList={{ 'leaderboard-first': rank(r) === 1 }}
                  href={`/admin/crew/${r.id}`}
                >
                  <span class={`leaderboard-rank rank-${rank(r)}`} aria-label={`Rank ${rank(r)}`}>
                    <Show when={rank(r) === 1} fallback={String(rank(r)).padStart(2, '0')}>
                      <Trophy size={19} />
                    </Show>
                  </span>
                  <Avatar
                    name={r.full_name.replace(/^\[DEMO\]\s*/, '')}
                    photo={r.profile_photo_path}
                    id={r.id}
                  />
                  <div class="leaderboard-person">
                    <strong>{r.full_name}</strong>
                    <span>
                      {r.eligible_events} completed events · {r.published_evaluations} evaluations
                    </span>
                  </div>
                  <div class="leaderboard-score">
                    <strong>{score(r.overall_score)}</strong>
                    <span>OUT OF 5</span>
                  </div>
                </A>
              </li>
            )}
          </For>
        </ol>
        <p class="leaderboard-footnote">
          Every completed event carries equal weight. Matching scores share a rank.
        </p>
      </Show>
    </section>
  );
}
