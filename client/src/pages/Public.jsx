import { createResource, createSignal, Show, For } from 'solid-js';
import { A, useParams } from '@solidjs/router';
import { api, post } from '../services/api';
import { user } from '../stores/auth';
import logoSmall from '../assets/sidebar-logo-320.webp';
import logoLarge from '../assets/sidebar-logo-554.webp';
import logoFallback from '../assets/sidebar-logo.png';
import {
  PageHeader,
  Async,
  StatusBadge,
  FormField,
  EvaluationForm,
  act,
  confirm,
  notice,
  date,
} from '../components/ui';
function PublicLayout(p) {
  return (
    <div class="public-page">
      <header>
        <A class="public-logo" href="/login" aria-label="Abracodebra — Crew OS">
          <picture>
            <source
              type="image/webp"
              srcset={`${logoSmall} 320w, ${logoLarge} 554w`}
              sizes="(max-width: 500px) 220px, 260px"
            />
            <img src={logoFallback} width="554" height="162" alt="Abracodebra" decoding="async" />
          </picture>
        </A>
        <span class="muted text-xs">{p.label}</span>
      </header>
      <main>{p.children}</main>
      <footer class="muted">Abracodebra · People make the experience.</footer>
    </div>
  );
}
export function PublicEvent() {
  const params = useParams();
  const [data, { refetch }] = createResource(
    () => params.registrationToken,
    (t) => api('/public/events/' + t),
  );
  const [applied, setApplied] = createSignal(false);
  return (
    <PublicLayout label="EVENT REGISTRATION">
      <Async resource={data} retry={refetch}>
        <Show when={data()}>
          {(d) => (
            <>
              <PageHeader
                eyebrow="BE PART OF THE EXPERIENCE"
                title={d().name}
                description={d().client_name}
              />
              <section class="panel stack">
                <div class="event-info">
                  <StatusBadge value={d().availability} />
                  <span>
                    {date(d().start_date)} – {date(d().end_date)}
                  </span>
                  <span>{d().location}</span>
                </div>
                <p class="preserve-space">{d().description}</p>
                <Show when={d().instructions}>
                  <div class="callout preserve-space">{d().instructions}</div>
                </Show>
                <Show when={d().available_slots !== null}>
                  <p>{d().available_slots} available crew slots</p>
                </Show>
                <Show when={d().deadline}>
                  <p class="muted">Apply by {date(d().deadline)}</p>
                </Show>
                <Show
                  when={d().availability === 'Open'}
                  fallback={
                    <div class="callout">Registration is {d().availability.toLowerCase()}.</div>
                  }
                >
                  <Show
                    when={user()}
                    fallback={
                      <div class="actions">
                        <A
                          class="button primary"
                          href={'/login?event=' + encodeURIComponent(params.registrationToken)}
                        >
                          Sign in to apply
                        </A>
                        <A
                          class="button"
                          href={'/register?event=' + encodeURIComponent(params.registrationToken)}
                        >
                          Create crew account
                        </A>
                      </div>
                    }
                  >
                    <Show
                      when={user()?.account_role === 'CREW'}
                      fallback={<p class="muted">Sign in with a crew account to apply.</p>}
                    >
                      <button
                        class="primary"
                        disabled={applied()}
                        onClick={async () => {
                          if (
                            await confirm(
                              'Apply for this event?',
                              'An administrator will review your application.',
                            )
                          )
                            act(
                              () => post(`/public/events/${params.registrationToken}/apply`),
                              () => {
                                setApplied(true);
                                refetch();
                              },
                              'Application submitted',
                            );
                        }}
                      >
                        {applied() ? 'Application submitted' : 'Apply for event →'}
                      </button>
                    </Show>
                  </Show>
                </Show>
              </section>
            </>
          )}
        </Show>
      </Async>
    </PublicLayout>
  );
}
export function ExternalEvaluation() {
  const params = useParams();
  const [link, { refetch: refreshLink }] = createResource(
    () => params.evaluationToken,
    (t) => api('/public/evaluation/' + t),
  );
  const [session, { refetch }] = createResource(async () => {
    try {
      return await api('/external-evaluation/session');
    } catch (e) {
      if ([401, 410].includes(e.status)) return null;
      throw e;
    }
  });
  const [selected, setSelected] = createSignal(null),
    [busy, setBusy] = createSignal(false);
  const active = () => (session() && session().event.id === link()?.event.id ? session() : null);
  async function identify(e) {
    e.preventDefault();
    setBusy(true);
    await act(
      () =>
        post(
          `/public/evaluation/${params.evaluationToken}/session`,
          Object.fromEntries(new FormData(e.currentTarget)),
        ),
      refetch,
      'Evaluation session started',
    );
    setBusy(false);
  }
  const progress = () => active()?.evaluations.filter((v) => v.status !== 'DRAFT').length || 0;
  return (
    <PublicLayout label="CREW EVALUATION">
      <Async resource={link} retry={refreshLink}>
        <Show when={link()}>
          <PageHeader
            eyebrow="YOUR FEEDBACK MAKES A DIFFERENCE"
            title={link()?.event.name}
            description="Share your observations with the team."
          />
          <Async resource={session} retry={refetch}>
            <Show
              when={active()}
              fallback={
                <section class="panel">
                  <h2>Let’s start with you</h2>
                  <p class="muted">
                    Your identity is visible to administrators. Crew receive anonymous published
                    feedback.
                  </p>
                  <form class="stack" onSubmit={identify}>
                    <label class="field">
                      <span>Your name *</span>
                      <input name="evaluator_name" required maxlength="200" autocomplete="name" />
                    </label>
                    <label class="field">
                      <span>Your description / role *</span>
                      <input
                        name="evaluator_description"
                        placeholder="e.g. PIC Lapangan"
                        required
                        maxlength="200"
                      />
                    </label>
                    <button class="primary" disabled={busy()}>
                      Start evaluating →
                    </button>
                  </form>
                </section>
              }
            >
              <section class="panel evaluation-panel">
                <div class="evaluation-summary">
                  <div>
                    <h2>Hello, {active()?.evaluator_name}.</h2>
                    <p class="muted">Choose a crew member to share your feedback.</p>
                  </div>
                </div>
                <div class="evaluation-progress">
                  <div>
                    <span>Evaluation progress</span>
                    <strong>
                      {progress()} / {active()?.crew.length} completed
                    </strong>
                  </div>
                  <progress
                    aria-label="Crew evaluations completed"
                    value={progress()}
                    max={active()?.crew.length || 1}
                  />
                </div>
                <Show
                  when={!selected()}
                  fallback={
                    <>
                      <button class="text-button" onClick={() => setSelected(null)}>
                        ← Back to crew
                      </button>
                      <h2>{active()?.crew.find((c) => c.id === selected())?.full_name}</h2>
                      <Show when={selected()} keyed>
                        {(crewId) => (
                          <EvaluationForm
                            criteria={active()?.criteria || []}
                            initial={active()?.evaluations.find((v) => v.crew_id === crewId)}
                            onSave={(body, submit) =>
                              act(
                                () =>
                                  post(
                                    `/external-evaluation/crew/${crewId}/${submit ? 'submit' : 'draft'}`,
                                    body,
                                  ),
                                () => {
                                  setSelected(null);
                                  refetch();
                                },
                                submit ? 'Evaluation submitted. Thank you!' : 'Draft saved',
                              )
                            }
                          />
                        )}
                      </Show>
                    </>
                  }
                >
                  <div class="evaluation-crew-list">
                    <For each={active()?.crew}>
                      {(c) => {
                        const evaluation = () =>
                          active()?.evaluations.find((v) => v.crew_id === c.id);
                        return (
                          <div class="evaluation-crew">
                            <div class="evaluation-person">
                              <strong>{c.full_name}</strong>
                              <small>
                                {evaluation()?.status === 'DRAFT'
                                  ? 'Draft saved'
                                  : evaluation()
                                    ? 'Submitted'
                                    : 'Ready for your feedback'}
                              </small>
                            </div>
                            <button
                              classList={{
                                primary: !evaluation() || evaluation().status === 'DRAFT',
                              }}
                              disabled={evaluation() && evaluation().status !== 'DRAFT'}
                              onClick={() => setSelected(c.id)}
                            >
                              {evaluation()?.status === 'DRAFT'
                                ? 'Continue'
                                : evaluation()
                                  ? 'Completed'
                                  : 'Evaluate'}
                            </button>
                          </div>
                        );
                      }}
                    </For>
                  </div>
                </Show>
              </section>
              <p class="muted text-xs">
                You can return using this browser while your session and the event link remain
                active. Submitted evaluations are locked until an administrator reopens them.
              </p>
            </Show>
          </Async>
        </Show>
      </Async>
    </PublicLayout>
  );
}
