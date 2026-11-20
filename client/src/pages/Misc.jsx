import { createResource, createSignal, Show } from 'solid-js';
import { A } from '@solidjs/router';
import { api, post, query } from '../services/api';
import {
  PageHeader,
  Async,
  DataTable,
  StatusBadge,
  Pagination,
  SearchInput,
  DateRangePicker,
  date,
  act,
  confirm,
} from '../components/ui';
export function Applications() {
  const [data, { refetch }] = createResource(() => api('/me/applications'));
  return (
    <>
      <PageHeader title="My applications" description="Follow your next opportunity." />
      <section class="panel">
        <Async resource={data} retry={refetch}>
          <DataTable
            rows={data()}
            columns={[
              { label: 'EVENT', key: 'name' },
              { label: 'DATE', render: (r) => date(r.start_date) },
              { label: 'STATUS', render: (r) => <StatusBadge value={r.application_status} /> },
              { label: 'NOTES', key: 'rejection_reason' },
              {
                label: '',
                render: (r) => (
                  <Show when={r.application_status === 'PENDING'}>
                    <button
                      class="small"
                      onClick={async () => {
                        if (await confirm('Withdraw application?'))
                          act(() => post(`/me/applications/${r.id}/withdraw`), refetch);
                      }}
                    >
                      Withdraw
                    </button>
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
export function AuditLogs() {
  const [search, setSearch] = createSignal(''),
    [page, setPage] = createSignal(1),
    [from, setFrom] = createSignal(''),
    [to, setTo] = createSignal('');
  const [data, { refetch }] = createResource(
    () => [search(), page(), from(), to()],
    (v) => api('/admin/audit-logs' + query({ action: v[0], page: v[1], from: v[2], to: v[3] })),
  );
  return (
    <>
      <PageHeader
        title="Audit log"
        description="A record of important changes across your workspace."
      />
      <section class="panel">
        <div class="toolbar">
          <SearchInput
            value={search()}
            onInput={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Filter actions…"
          />
          <DateRangePicker from={from()} to={to()} onFrom={setFrom} onTo={setTo} />
        </div>
        <Async resource={data} retry={refetch}>
          <DataTable
            rows={data()?.items}
            columns={[
              { label: 'WHEN', render: (r) => r.created_at },
              { label: 'ACTOR', render: (r) => r.actor || r.actor_type },
              { label: 'ACTION', key: 'action' },
              { label: 'TARGET', render: (r) => `${r.entity_type} ${r.entity_id || ''}` },
              {
                label: 'DETAILS',
                render: (r) => <span class="muted text-xs">{JSON.stringify(r.metadata_json)}</span>,
              },
            ]}
          />
          <Pagination data={data()} onPage={setPage} />
        </Async>
      </section>
    </>
  );
}
export function NotFound(p) {
  return (
    <div class="standalone-message">
      <span class="brand-symbol">a✳</span>
      <h1>{p.unauthorized ? 'Access restricted' : 'Page not found'}</h1>
      <p class="muted">
        {p.unauthorized
          ? 'Your account does not have permission to open this page.'
          : 'This page may have moved or the link may be incorrect.'}
      </p>
      <A class="button primary" href="/">
        Back to workspace
      </A>
    </div>
  );
}
