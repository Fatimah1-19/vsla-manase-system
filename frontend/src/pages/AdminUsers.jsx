import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';
import { useLang } from '../context/LangContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Modal from '../components/Modal.jsx';
import Spinner from '../components/Spinner.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { shortDate, dateTime } from '../utils/format.js';
import '../styles.css';

const ROLE_ORDER = ['admin', 'treasurer', 'secretary', 'member', 'system_admin'];
const OFFICE_ROLES = ['admin', 'treasurer', 'secretary'];

/** How one account stands right now: locked by wrong passwords, or on/off. */
function statusOf(a) {
  if (a.locked_until && new Date(a.locked_until) > new Date()) return 'locked';
  return a.is_active ? 'active' : 'deactivated';
}

const STATUS_TAG = { active: 'tag--green', deactivated: 'tag--grey', suspended: 'tag--grey', locked: 'tag--gold' };

/**
 * The account table. The administrator searches it, opens a person's details,
 * asks the chairperson to change details or suspend an account, sets a fresh
 * password herself, and hands out or takes back the system-administrator role.
 */
export default function AdminUsers() {
  const { t } = useLang();
  const toast = useToast();
  const confirm = useConfirm();
  const { user, isSystemAdmin } = useAuth();

  const [accounts, setAccounts] = useState(null);
  const [requests, setRequests] = useState([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [busy, setBusy] = useState(0);

  const [add, setAdd] = useState(null);      // the "open an account" form
  const [edit, setEdit] = useState(null);    // the "ask for a change" form
  const [view, setView] = useState(null);    // the details panel
  const [roleFor, setRoleFor] = useState(null); // the "manage role" panel
  const [deactivateFor, setDeactivateFor] = useState(null); // direct deactivation modal
  const [deactivateReason, setDeactivateReason] = useState('');
  const [deactivateOther, setDeactivateOther] = useState('');

  const load = useCallback(async () => {
    const [members, myRequests] = await Promise.all([
      api.get('/admin/members'),
      api.get('/admin/change-requests'),
    ]);
    setAccounts(members);
    setRequests(myRequests);
  }, []);

  useEffect(() => { load().catch((e) => toast.error(e.message)); }, [load, toast]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (accounts || []).filter((a) => {
      if (roleFilter && a.role !== roleFilter) return false;
      if (statusFilter && statusOf(a) !== statusFilter) return false;
      if (!q) return true;
      return [a.full_name, a.username, a.phone, a.membership_number]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
    });
  }, [accounts, search, roleFilter, statusFilter]);

  async function submitAdd(e) {
    e.preventDefault();
    setBusy(-1);
    try {
      const res = await api.post('/admin/accounts', add);
      toast.success(res.message);
      if (!res.sms_sent) toast.info(res.sms_error || t('admin.passwordNotTexted'));
      setAdd(null);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(0);
    }
  }

  async function submitEdit(e) {
    e.preventDefault();
    setBusy(-1);
    try {
      const payload = {};
      for (const key of ['full_name', 'phone', 'language', 'village']) {
        if (edit[key]) payload[key] = edit[key];
      }
      await api.post('/admin/change-requests', {
        kind: 'update_user', target_user_id: edit.id, payload, reason: edit.reason,
      });
      toast.success(t('admin.requestSent'));
      setEdit(null);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(0);
    }
  }

  function openDeactivateModal(account) {
    setDeactivateFor(account);
    setDeactivateReason('');
    setDeactivateOther('');
  }

  async function doDeactivate(e) {
    if (e) e.preventDefault();
    if (!deactivateFor) return;
    if (!deactivateReason) {
      toast.error(t('admin.selectReason'));
      return;
    }
    if (deactivateReason === 'Other' && !deactivateOther.trim()) {
      toast.error(t('admin.specifyReason'));
      return;
    }
    const msg = t('admin.confirmDeactivate').replace('{name}', deactivateFor.full_name);
    if (!(await confirm({ message: msg }))) return;
    setBusy(deactivateFor.id);
    try {
      await api.post(`/admin/accounts/${deactivateFor.id}/deactivate`, {
        reason: deactivateReason,
        reasonDetail: deactivateOther,
      });
      toast.success(t('admin.deactivatedSuccess'));
      setDeactivateFor(null);
      setDeactivateReason('');
      setDeactivateOther('');
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(0);
    }
  }

  async function doReactivate(account) {
    const msg = t('admin.confirmReactivate').replace('{name}', account.full_name);
    if (!(await confirm({ message: msg }))) return;
    setBusy(account.id);
    try {
      await api.post(`/admin/accounts/${account.id}/reactivate`);
      toast.success(t('admin.reactivatedSuccess'));
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(0);
    }
  }

  async function resetPassword(account) {
    if (!(await confirm({ message: `${t('admin.confirmReset')}` }))) return;
    setBusy(account.id);
    try {
      const res = await api.post(`/admin/accounts/${account.id}/reset-password`);
      if (res.temporary_password) {
        toast.info(`${t('admin.resetNoPhone')} ${res.temporary_password}`);
      } else {
        toast.success(t('admin.resetDone'));
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(0);
    }
  }

  async function applyRole(account, makeAdmin) {
    setBusy(account.id);
    try {
      const res = await api.patch(`/admin/accounts/${account.id}/role`, { system_admin: makeAdmin });
      toast.success(res.message);
      setRoleFor(null);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(0);
    }
  }

  async function openView(account) {
    setView(account);
    try {
      setView(await api.get(`/admin/accounts/${account.id}`));
    } catch {
      // The row we already have is enough if the detail call fails.
    }
  }

  async function withdraw(id) {
    if (!(await confirm({ message: t('admin.withdraw') + '?' }))) return;
    try {
      await api.post(`/admin/change-requests/${id}/withdraw`);
      await load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  if (!accounts) return <Spinner />;

  return (
    <div className="adminusers">
      <PageHeader
        title={t('admin.title')}
        subtitle={t('admin.subtitle')}
      />

      {/* Search and filters */}
      <div className="adminusers__filters">
        <input
          className="adminusers__search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('admin.searchUsers')}
          aria-label={t('admin.searchUsers')}
        />
        <label className="adminusers__filter">
          <span>{t('common.role')}</span>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="">{t('admin.allRoles')}</option>
            {ROLE_ORDER.map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}
          </select>
        </label>
        <label className="adminusers__filter">
          <span>{t('common.status')}</span>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">{t('admin.allStatus')}</option>
            <option value="active">{t('admin.active')}</option>
            <option value="deactivated">{t('admin.deactivated')}</option>
            <option value="suspended">{t('admin.suspended')}</option>
            <option value="locked">{t('admin.statusLocked')}</option>
          </select>
        </label>
      </div>

      <section>
        <h2 className="dash__sectionTitle">{t('admin.accounts')}</h2>
        {filtered.length === 0 ? (
          <EmptyState title={t('admin.noUsers')} />
        ) : (
          <div className="adminusers__scroll">
            <table className="sysadmin__table adminusers__table">
              <thead>
                <tr>
                  <th>{t('common.name')}</th>
                  <th>{t('admin.contact')}</th>
                  <th>{t('common.role')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('admin.created')}</th>
                  <th>{t('admin.lastLogin')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => {
                  const st = statusOf(a);
                  return (
                    <tr key={a.id}>
                      <td>
                        <strong>{a.full_name}</strong>
                        <div className="adminusers__sub">
                          <code>{a.username}</code>
                          {a.membership_number ? ` · ${a.membership_number}` : ''}
                        </div>
                      </td>
                      <td>{a.phone || '—'}</td>
                      <td><span className="tag">{t(`roles.${a.role}`)}</span></td>
                      <td>
                        <span className={`tag ${STATUS_TAG[st]}`}>
                          {st === 'active' ? t('admin.active') : st === 'deactivated' || st === 'suspended' ? t('admin.deactivated') : t('admin.statusLocked')}
                        </span>
                      </td>
                      <td>{shortDate(a.created_at)}</td>
                      <td>{a.last_login ? dateTime(a.last_login) : t('admin.never')}</td>
                      <td>
                        <div className="adminusers__rowActions">
                          <button type="button" className="btn btn--small" onClick={() => openView(a)}>
                            {t('common.view')}
                          </button>
                          <button type="button" className="btn btn--small btn--gold" onClick={() => setEdit({
                            id: a.id, full_name: a.full_name, phone: a.phone || '',
                            language: a.language || 'ny', village: a.village || '', reason: '',
                          })}>
                            {t('admin.edit')}
                          </button>
                          <button type="button" className="btn btn--small" onClick={() => setRoleFor(a)}>
                            {t('admin.manageRole')}
                          </button>
                          <button type="button" className="btn btn--small btn--sky" disabled={busy === a.id} onClick={() => resetPassword(a)}>
                            {t('admin.resetPassword')}
                          </button>
                          {a.is_active ? (
                            <button type="button" className="btn btn--small btn--danger" disabled={busy === a.id} onClick={() => openDeactivateModal(a)}>
                              {t('admin.deactivate')}
                            </button>
                          ) : (
                            <button type="button" className="btn btn--small btn--sky" disabled={busy === a.id} onClick={() => doReactivate(a)}>
                              {t('admin.reactivate')}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* What the administrator has already asked the chairperson for */}
      <section className="dash__card adminusers__requestsCard">
        <h2 className="dash__sectionTitle">{t('admin.myRequests')}</h2>
        {requests.length === 0 ? (
          <p className="muted">{t('admin.noRequests')}</p>
        ) : (
          <ul className="adminusers__requests">
            {requests.map((r) => (
              <li key={r.id} className="adminusers__request">
                <div>
                  <strong>{t(`admin.kind_${r.kind}`)}</strong>
                  {r.target_name ? <span className="muted"> · {r.target_name}</span> : null}
                  <p className="muted">{shortDate(r.created_at)}</p>
                </div>
                <span className={`tag ${r.status === 'approved' ? 'tag--green' : r.status === 'rejected' ? 'tag--grey' : 'tag--gold'}`}>
                  {t(`admin.status${r.status.charAt(0).toUpperCase()}${r.status.slice(1)}`)}
                </span>
                {r.status === 'pending' && (
                  <button type="button" className="btn btn--ghost btn--small" onClick={() => withdraw(r.id)}>
                    {t('admin.withdraw')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Open an account */}
      <Modal
        open={!!add}
        title={t('admin.addAccount')}
        onClose={() => setAdd(null)}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setAdd(null)}>{t('common.cancel')}</button>
            <button type="submit" form="addAccountForm" className="btn" disabled={busy === -1}>
              {busy === -1 ? t('common.saving') : t('common.save')}
            </button>
          </>
        }
      >
        {add && (
          <form id="addAccountForm" onSubmit={submitAdd} className="settings__form">
            <div className="settings__row">
              <label className="field-label" htmlFor="add-name">{t('admin.fullName')}</label>
              <input id="add-name" value={add.full_name} onChange={(e) => setAdd({ ...add, full_name: e.target.value })} required />
            </div>
            <div className="settings__row">
              <label className="field-label" htmlFor="add-phone">{t('admin.phone')}</label>
              <input id="add-phone" value={add.phone} onChange={(e) => setAdd({ ...add, phone: e.target.value })} placeholder="0995727978" />
            </div>
            <div className="settings__row">
              <label className="field-label" htmlFor="add-village">{t('admin.village')}</label>
              <input id="add-village" value={add.village} onChange={(e) => setAdd({ ...add, village: e.target.value })} />
            </div>
            <div className="settings__row">
              <label className="field-label" htmlFor="add-lang">{t('admin.language')}</label>
              <select id="add-lang" value={add.language} onChange={(e) => setAdd({ ...add, language: e.target.value })}>
                <option value="ny">{t('admin.languageNy')}</option>
                <option value="en">{t('admin.languageEn')}</option>
              </select>
            </div>
            <p className="settings__note">{t('admin.requestSentNote')}</p>
          </form>
        )}
      </Modal>

      {/* Ask for a change */}
      <Modal
        open={!!edit}
        title={t('admin.proposeChange')}
        onClose={() => setEdit(null)}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setEdit(null)}>{t('common.cancel')}</button>
            <button type="submit" form="editAccountForm" className="btn" disabled={busy === -1}>
              {busy === -1 ? t('common.sending') : t('admin.proposeChange')}
            </button>
          </>
        }
      >
        {edit && (
          <form id="editAccountForm" onSubmit={submitEdit} className="settings__form">
            <div className="settings__row">
              <label className="field-label" htmlFor="edit-name">{t('admin.fullName')}</label>
              <input id="edit-name" value={edit.full_name} onChange={(e) => setEdit({ ...edit, full_name: e.target.value })} />
            </div>
            <div className="settings__row">
              <label className="field-label" htmlFor="edit-phone">{t('admin.phone')}</label>
              <input id="edit-phone" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
            </div>
            <div className="settings__row">
              <label className="field-label" htmlFor="edit-village">{t('admin.village')}</label>
              <input id="edit-village" value={edit.village} onChange={(e) => setEdit({ ...edit, village: e.target.value })} />
            </div>
            <div className="settings__row">
              <label className="field-label" htmlFor="edit-lang">{t('admin.language')}</label>
              <select id="edit-lang" value={edit.language} onChange={(e) => setEdit({ ...edit, language: e.target.value })}>
                <option value="ny">{t('admin.languageNy')}</option>
                <option value="en">{t('admin.languageEn')}</option>
              </select>
            </div>
            <div className="settings__row">
              <label className="field-label" htmlFor="edit-reason">{t('admin.reason')}</label>
              <input id="edit-reason" value={edit.reason} onChange={(e) => setEdit({ ...edit, reason: e.target.value })} />
            </div>
            <p className="settings__note">{t('admin.requestSentNote')}</p>
          </form>
        )}
      </Modal>

      {/* View details */}
      <Modal open={!!view} title={t('admin.userDetails')} onClose={() => setView(null)}>
        {view && (
          <dl className="adminusers__details">
            <div><dt>{t('admin.fullName')}</dt><dd>{view.full_name}</dd></div>
            <div><dt>{t('admin.username')}</dt><dd><code>{view.username}</code></dd></div>
            <div><dt>{t('common.role')}</dt><dd>{t(`roles.${view.role}`)}</dd></div>
            <div><dt>{t('common.status')}</dt><dd>{statusOf(view) === 'active' ? t('admin.active') : statusOf(view) === 'deactivated' || statusOf(view) === 'suspended' ? t('admin.deactivated') : t('admin.statusLocked')}</dd></div>
            <div><dt>{t('admin.contact')}</dt><dd>{view.phone || '—'}</dd></div>
            <div><dt>{t('admin.membershipNumber')}</dt><dd>{view.membership_number || '—'}</dd></div>
            <div><dt>{t('admin.village')}</dt><dd>{view.village || '—'}</dd></div>
            <div><dt>{t('admin.language')}</dt><dd>{view.language === 'en' ? t('admin.languageEn') : t('admin.languageNy')}</dd></div>
            <div><dt>{t('admin.created')}</dt><dd>{dateTime(view.created_at)}</dd></div>
            <div><dt>{t('admin.lastLogin')}</dt><dd>{view.last_login ? dateTime(view.last_login) : t('admin.never')}</dd></div>
            <div><dt>{t('admin.mustChange')}</dt><dd>{view.must_change_password ? t('common.yes') : t('common.no')}</dd></div>
          </dl>
        )}
      </Modal>

      {/* Manage role */}
      <Modal
        open={!!roleFor}
        title={t('admin.manageRole')}
        onClose={() => setRoleFor(null)}
        footer={roleFor && roleFor.role !== 'admin' && !OFFICE_ROLES.includes(roleFor.role) && view !== roleFor && roleFor.id !== user?.id ? (
          <button
            type="button"
            className="btn"
            disabled={busy === roleFor.id}
            onClick={() => applyRole(roleFor, roleFor.role !== 'system_admin')}
          >
            {roleFor.role === 'system_admin' ? t('admin.removeAdmin') : t('admin.makeAdmin')}
          </button>
        ) : null}
      >
        {roleFor && (
          <div className="adminusers__role">
            <p><strong>{roleFor.full_name}</strong></p>
            <p className="muted">{t('common.role')}: {t(`roles.${roleFor.role}`)}</p>

            {roleFor.id === user?.id ? (
              <p className="notice notice--warn">{t('admin.roleSelfLocked')}</p>
            ) : OFFICE_ROLES.includes(roleFor.role) ? (
              <p className="notice notice--warn">
                {roleFor.role === 'admin' ? t('admin.separationBody') : t('admin.officeLocked')}
              </p>
            ) : (
              <p className="settings__note">{t('admin.roleNote')}</p>
            )}
          </div>
        )}
      </Modal>

      {/* Deactivate account */}
      <Modal
        open={!!deactivateFor}
        title={t('admin.deactivateAccount')}
        onClose={() => setDeactivateFor(null)}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setDeactivateFor(null)}>{t('common.cancel')}</button>
            <button type="button" className="btn btn--danger" onClick={doDeactivate} disabled={busy === deactivateFor?.id}>
              {busy === deactivateFor?.id ? t('common.saving') : t('admin.deactivate')}
            </button>
          </>
        }
      >
        {deactivateFor && (
          <form onSubmit={doDeactivate} className="settings__form">
            <div className="settings__row">
              <p><strong>{deactivateFor.full_name}</strong> <span className="muted">({deactivateFor.username})</span></p>
              <p className="muted">{t('common.status')}: {deactivateFor.is_active ? t('admin.active') : t('admin.deactivated')}</p>
            </div>
            <div className="settings__row">
              <label className="field-label" htmlFor="deact-reason">{t('admin.reasonForDeactivation')}</label>
              <select id="deact-reason" value={deactivateReason} onChange={(e) => setDeactivateReason(e.target.value)} required>
                <option value="">{t('admin.selectReason')}</option>
                <option value="Resigned">{t('admin.reasonResigned')}</option>
                <option value="Removed by group decision">{t('admin.reasonRemoved')}</option>
                <option value="Misappropriation of funds">{t('admin.reasonMisappropriation')}</option>
                <option value="Fraudulent activity">{t('admin.reasonFraud')}</option>
                <option value="Repeated rule violations">{t('admin.reasonViolations')}</option>
                <option value="Long-term inactivity">{t('admin.reasonInactivity')}</option>
                <option value="Serious loan default">{t('admin.reasonLoanDefault')}</option>
                <option value="False or duplicate information/account">{t('admin.reasonFalse')}</option>
                <option value="Deceased">{t('admin.reasonDeceased')}</option>
                <option value="Other">{t('admin.reasonOther')}</option>
              </select>
            </div>
            {deactivateReason === 'Other' && (
              <div className="settings__row">
                <label className="field-label" htmlFor="deact-other">{t('admin.specifyReason')}</label>
                <input id="deact-other" value={deactivateOther} onChange={(e) => setDeactivateOther(e.target.value)} required />
              </div>
            )}
            <p className="notice notice--warn">{t('admin.deactivateWarning')}</p>
            <p className="settings__note">{t('admin.deactivateNote')}</p>
          </form>
        )}
      </Modal>
    </div>
  );
}
