import { createResource, createSignal } from 'solid-js';
import { A, useNavigate } from '@solidjs/router';
import { api, post, patch, remove } from '../services/api';
import { setUser } from '../stores/auth';
import {
  PageHeader,
  DataTable,
  act,
  confirm,
  prompt,
  notice,
  StatusBadge,
} from '../components/ui';
export function AccountSettings() {
  const navigate = useNavigate();
  const [busy, setBusy] = createSignal(false);
  return (
    <>
      <PageHeader title="Account settings" description="Keep your account secure." />
      <form
        class="panel form-panel stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const body = Object.fromEntries(new FormData(e.currentTarget));
          if (body.password !== body.confirm_password)
            return notice('Passwords do not match', 'error');
          setBusy(true);
          await act(
            () => post('/auth/change-password', body),
            () => {
              setUser(null);
              navigate('/login');
            },
            'Password changed. Please sign in again.',
          );
          setBusy(false);
        }}
      >
        <h2>Change password</h2>
        <label class="field">
          <span>Current password</span>
          <input name="current_password" type="password" required autocomplete="current-password" />
        </label>
        <label class="field">
          <span>New password</span>
          <input
            name="password"
            type="password"
            required
            minlength="8"
            autocomplete="new-password"
          />
          <small>At least 8 characters.</small>
        </label>
        <label class="field">
          <span>Confirm new password</span>
          <input name="confirm_password" type="password" required autocomplete="new-password" />
        </label>
        <button class="primary" disabled={busy()}>
          Change password
        </button>
      </form>
    </>
  );
}
export function AdminSettings() {
  const [skills, { refetch: refreshSkills }] = createResource(() => api('/skills'));
  const [criteria, { refetch: refreshCriteria }] = createResource(() => api('/criteria'));
  return (
    <>
      <PageHeader
        title="Workspace settings"
        description="Manage your skills and evaluation criteria."
      >
        <A class="button" href="/admin/audit-logs">Audit log</A>
      </PageHeader>
      <section class="panel">
        <div class="section-heading">
          <h2>Skill tags</h2>
          <button
            onClick={async () => {
              const name = await prompt('New skill name');
              if (name !== undefined) act(() => post('/skills', { name }), refreshSkills);
            }}
          >
            Add skill
          </button>
        </div>
        <DataTable
          rows={skills()}
          columns={[
            { label: 'SKILL', key: 'name' },
            {
              label: '',
              render: (s) => (
                <div class="actions">
                  <button
                    class="small"
                    onClick={async () => {
                      const name = await prompt('Rename skill', s.name);
                      if (name !== undefined)
                        act(() => patch('/skills/' + s.id, { name }), refreshSkills);
                    }}
                  >
                    Rename
                  </button>
                  <button
                    class="small danger"
                    onClick={async () => {
                      if (await confirm('Delete unused skill?'))
                        act(() => remove('/skills/' + s.id), refreshSkills);
                    }}
                  >
                    Delete
                  </button>
                </div>
              ),
            },
          ]}
        />
      </section>
      <section class="panel">
        <div class="section-heading">
          <h2>Evaluation criteria</h2>
          <button
            onClick={async () => {
              const name = await prompt('New criterion name');
              if (name !== undefined)
                act(
                  () =>
                    post('/criteria', {
                      name,
                      description: 'Rate from 1 (Poor) to 5 (Excellent)',
                      is_active: true,
                    }),
                  refreshCriteria,
                );
            }}
          >
            Add criterion
          </button>
        </div>
        <p class="muted">
          Changes apply to future event snapshots. Existing evaluation criteria remain unchanged.
        </p>
        <DataTable
          rows={criteria()}
          columns={[
            { label: 'CRITERION', key: 'name' },
            { label: 'DESCRIPTION', key: 'description' },
            {
              label: 'STATE',
              render: (c) => <StatusBadge value={c.is_active ? 'ACTIVE' : 'DISABLED'} />,
            },
            {
              label: '',
              render: (c) => (
                <div class="actions">
                  <button
                    class="small"
                    onClick={async () => {
                      const name = await prompt('Criterion name', c.name);
                      if (name === undefined) return;
                      const description = await prompt('Criterion description', c.description);
                      if (description !== undefined)
                        act(
                          () =>
                            patch('/criteria/' + c.id, {
                              name,
                              description,
                              is_active: !!c.is_active,
                            }),
                          refreshCriteria,
                        );
                    }}
                  >
                    Edit
                  </button>
                  <button
                    class="small"
                    onClick={async () => {
                      if (await confirm(c.is_active ? 'Disable criterion?' : 'Enable criterion?'))
                        act(
                          () =>
                            patch('/criteria/' + c.id, {
                              name: c.name,
                              description: c.description,
                              is_active: !c.is_active,
                            }),
                          refreshCriteria,
                        );
                    }}
                  >
                    {c.is_active ? 'Disable' : 'Enable'}
                  </button>
                </div>
              ),
            },
          ]}
        />
      </section>
      <AccountSettings />
    </>
  );
}
