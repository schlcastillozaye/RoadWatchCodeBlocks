import { useMemo, useState } from 'react';
import { EmptyState, ErrorState, LoadingBlock, Banner, Spinner } from '../components/Feedback';
import { Modal } from '../components/Modal';
import { Badge } from '../components/StatusBadge';
import { Pagination, PageHeader, Section } from '../components/ui';
import { api } from '../lib/api';
import { errorMessage } from '../lib/errors';
import { ROLE_LABELS, formatDate } from '../lib/format';
import type { Role, User } from '../lib/types';
import { useAsync, useDebounced } from '../lib/useAsync';

const PAGE_SIZE = 15;

export function UsersPage() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search);
  const [role, setRole] = useState<Role | ''>('');
  const [status, setStatus] = useState<'' | 'ACTIVE' | 'SUSPENDED'>('');
  const [page, setPage] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);

  const query = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      search: debouncedSearch || undefined,
      role: (role || undefined) as Role | undefined,
      status: status || undefined,
    }),
    [page, debouncedSearch, role, status],
  );

  const users = useAsync(() => api.listUsers(query), [query.page, query.search, query.role, query.status]);

  const refresh = () => void users.reload();

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Create accounts, assign roles and manage access."
        actions={
          <>
            <button type="button" className="btn btn-secondary btn-sm" onClick={refresh}>
              ⟳ Refresh
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreateOpen(true)}>
              + New user
            </button>
          </>
        }
      />

      <Section className="mb-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="brand-label" htmlFor="user-search">
              Search
            </label>
            <input
              id="user-search"
              className="brand-input"
              placeholder="Name, email or phone"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>
          <div>
            <label className="brand-label" htmlFor="user-role">
              Role
            </label>
            <select
              id="user-role"
              className="brand-input"
              value={role}
              onChange={(event) => {
                setRole(event.target.value as Role | '');
                setPage(1);
              }}
            >
              <option value="">All roles</option>
              {(Object.keys(ROLE_LABELS) as Role[]).map((key) => (
                <option key={key} value={key}>
                  {ROLE_LABELS[key]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="brand-label" htmlFor="user-status">
              Status
            </label>
            <select
              id="user-status"
              className="brand-input"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as '' | 'ACTIVE' | 'SUSPENDED');
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
            </select>
          </div>
        </div>
      </Section>

      {users.loading && !users.data ? (
        <LoadingBlock label="Loading users…" />
      ) : users.error && !users.data ? (
        <ErrorState message={users.error} onRetry={users.reload} />
      ) : (users.data?.items.length ?? 0) === 0 ? (
        <EmptyState icon="☺" title="No users match these filters" message="Adjust the filters or add a new user." />
      ) : (
        <Section>
          <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,0.8fr)_auto] gap-3 border-b border-azure pb-2 text-xs font-semibold uppercase tracking-wide text-ink-3 lg:grid">
            <span>User</span>
            <span>Role</span>
            <span>Phone</span>
            <span>Status</span>
            <span className="text-right">Joined</span>
          </div>

          <ul className="divide-y divide-azure/70">
            {users.data!.items.map((user) => (
              <li
                key={user.id}
                className="grid gap-3 py-3.5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,0.8fr)_auto] lg:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-navy">{user.fullName}</p>
                  <p className="truncate text-xs text-ink-3">{user.email}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 lg:hidden">
                    <Badge tone="slate">{ROLE_LABELS[user.role]}</Badge>
                    <StatusPill status={user.status} />
                  </div>
                </div>

                <div className="hidden lg:block">
                  <Badge tone="slate">{ROLE_LABELS[user.role]}</Badge>
                </div>
                <div className="hidden text-sm text-ink-2 lg:block">{user.phone ?? '—'}</div>
                <div className="hidden lg:block">
                  <StatusPill status={user.status} />
                </div>

                <div className="flex items-center justify-between gap-2 lg:justify-end">
                  <span className="text-xs text-ink-3 lg:hidden">{formatDate(user.createdAt)}</span>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(user)}>
                    Manage
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <Pagination
            page={users.data!.page}
            totalPages={users.data!.totalPages}
            total={users.data!.total}
            onPage={setPage}
          />
        </Section>
      )}

      <CreateUserDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onDone={() => {
          refresh();
          setCreateOpen(false);
        }}
      />

      {editing && (
        <ManageUserDialog
          user={editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </>
  );
}

function StatusPill({ status }: { status: string }) {
  return status === 'ACTIVE' ? <Badge tone="green">Active</Badge> : <Badge tone="red">Suspended</Badge>;
}

function CreateUserDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('MAINTENANCE_OFFICER');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setFullName('');
    setEmail('');
    setPhone('');
    setPassword('');
    setRole('MAINTENANCE_OFFICER');
    setError(null);
  };

  const submit = async () => {
    setError(null);
    if (fullName.trim().length < 2) return setError('Enter the full name.');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter a valid email address.');
    if (password.length < 8) return setError('Password must be at least 8 characters.');

    setSaving(true);
    try {
      await api.createUser({
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        password,
        role,
      });
      reset();
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Create user"
      description="Officers can only update reports assigned to them."
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={saving}>
            {saving && <Spinner size={16} className="border-white/40 border-t-white" />}
            Create user
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Banner tone="error">{error}</Banner>}
        <div>
          <label className="brand-label" htmlFor="new-name">
            Full name
          </label>
          <input id="new-name" className="brand-input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="brand-label" htmlFor="new-email">
              Email
            </label>
            <input
              id="new-email"
              type="email"
              className="brand-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="brand-label" htmlFor="new-phone">
              Phone (optional)
            </label>
            <input id="new-phone" className="brand-input" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="brand-label" htmlFor="new-password">
              Temporary password
            </label>
            <input
              id="new-password"
              className="brand-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
          </div>
          <div>
            <label className="brand-label" htmlFor="new-role">
              Role
            </label>
            <select
              id="new-role"
              className="brand-input"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              {(Object.keys(ROLE_LABELS) as Role[]).map((key) => (
                <option key={key} value={key}>
                  {ROLE_LABELS[key]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function ManageUserDialog({ user, onClose, onDone }: { user: User; onClose: () => void; onDone: () => void }) {
  const [fullName, setFullName] = useState(user.fullName);
  const [phone, setPhone] = useState(user.phone ?? '');
  const [role, setRole] = useState<Role>(user.role);
  const [status, setStatus] = useState<'ACTIVE' | 'SUSPENDED'>(user.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      await api.updateUser(user.id, {
        fullName: fullName.trim(),
        phone: phone.trim() || undefined,
        role,
        status,
      });
      if (newPassword) {
        if (newPassword.length < 8) throw new Error('New password must be at least 8 characters.');
        await api.resetPassword(user.id, newPassword);
      }
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const resetPw = async () => {
    setError(null);
    setNotice(null);
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    setSaving(true);
    try {
      await api.resetPassword(user.id, newPassword);
      setNewPassword('');
      setNotice('Password reset. Share the new password securely with the user.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Manage user"
      description={user.email}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Close
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
            {saving && <Spinner size={16} className="border-white/40 border-t-white" />}
            Save changes
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Banner tone="error">{error}</Banner>}
        {notice && <Banner tone="success">{notice}</Banner>}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="brand-label" htmlFor="edit-name">
              Full name
            </label>
            <input id="edit-name" className="brand-input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <label className="brand-label" htmlFor="edit-phone">
              Phone
            </label>
            <input id="edit-phone" className="brand-input" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <label className="brand-label" htmlFor="edit-role">
              Role
            </label>
            <select id="edit-role" className="brand-input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {(Object.keys(ROLE_LABELS) as Role[]).map((key) => (
                <option key={key} value={key}>
                  {ROLE_LABELS[key]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="brand-label" htmlFor="edit-status">
              Status
            </label>
            <select
              id="edit-status"
              className="brand-input"
              value={status}
              onChange={(e) => setStatus(e.target.value as 'ACTIVE' | 'SUSPENDED')}
            >
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
            </select>
          </div>
        </div>

        <div className="rounded-brand-sm border border-azure bg-cream p-3.5">
          <label className="brand-label" htmlFor="edit-password">
            Reset password (optional)
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="edit-password"
              className="brand-input"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password (min 8 characters)"
            />
            <button type="button" className="btn btn-secondary btn-sm shrink-0" onClick={resetPw} disabled={saving}>
              Reset now
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
