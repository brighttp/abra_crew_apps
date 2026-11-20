import { Router, Route, Navigate } from '@solidjs/router';
import { Show, createSignal, onMount } from 'solid-js';
import { user, authReady, refreshAuth } from './stores/auth';
import AppLayout from './components/Layout';
import { LoadingSkeleton } from './components/ui';
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';
import { CrewList, CrewForm, CrewDetail } from './pages/Crew';
import { EventList, EventForm, EventDetail, EventRegistrations } from './pages/Events';
import { AdminPerformance, MyPerformance, EvaluationReview } from './pages/Performance';
import { PublicEvent, ExternalEvaluation } from './pages/Public';
import { AccountSettings, AdminSettings } from './pages/Settings';
import Reports from './pages/Reports';
import { Applications, AuditLogs, NotFound } from './pages/Misc';
function Guard(p) {
  return (
    <Show when={user()} fallback={<Navigate href="/login" />}>
      <Show when={user()?.account_role === p.role} fallback={<Navigate href="/unauthorized" />}>
        <AppLayout>{p.children}</AppLayout>
      </Show>
    </Show>
  );
}
function Root(p) {
  const [error, setError] = createSignal('');
  onMount(() => refreshAuth().catch((e) => setError(e.message)));
  return (
    <Show
      when={!error()}
      fallback={
        <div class="standalone-message">
          <h1>Unable to connect</h1>
          <p class="error">{error()}</p>
          <button onClick={() => location.reload()}>Try again</button>
        </div>
      }
    >
      <Show when={authReady()} fallback={<LoadingSkeleton />}>
        {p.children}
      </Show>
    </Show>
  );
}
export default function App() {
  return (
    <Router root={Root}>
      <Route
        path="/"
        component={() => (
          <Navigate
            href={
              !user()
                ? '/login'
                : user().account_role === 'ADMIN'
                  ? '/admin/dashboard'
                  : '/crew/dashboard'
            }
          />
        )}
      />
      <Route path="/login" component={Auth} />
      <Route path="/register" component={() => <Auth register />} />
      <Route path="/admin" component={(p) => <Guard role="ADMIN">{p.children}</Guard>}>
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/crew" component={CrewList} />
        <Route path="/crew/new" component={CrewForm} />
        <Route path="/crew/approvals" component={() => <CrewList approvals />} />
        <Route path="/crew/:id" component={CrewDetail} />
        <Route path="/crew/:id/edit" component={CrewForm} />
        <Route path="/events" component={EventList} />
        <Route path="/events/new" component={EventForm} />
        <Route path="/events/:id" component={EventDetail} />
        <Route path="/events/:id/edit" component={EventForm} />
        <Route path="/events/:id/registrations" component={EventRegistrations} />
        <Route path="/performance" component={AdminPerformance} />
        <Route path="/performance/:evaluationId" component={EvaluationReview} />
        <Route path="/reports" component={Reports} />
        <Route path="/settings" component={AdminSettings} />
        <Route path="/audit-logs" component={AuditLogs} />
      </Route>
      <Route path="/crew" component={(p) => <Guard role="CREW">{p.children}</Guard>}>
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/profile" component={() => <CrewDetail self />} />
        <Route path="/events" component={EventList} />
        <Route path="/events/:id" component={EventDetail} />
        <Route path="/applications" component={Applications} />
        <Route path="/performance" component={MyPerformance} />
        <Route path="/settings" component={AccountSettings} />
      </Route>
      <Route path="/event/:registrationToken" component={PublicEvent} />
      <Route path="/evaluate/:evaluationToken" component={ExternalEvaluation} />
      <Route path="/unauthorized" component={() => <NotFound unauthorized />} />
      <Route path="*404" component={NotFound} />
    </Router>
  );
}
