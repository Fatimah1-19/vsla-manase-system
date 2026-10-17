import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useLang } from '../context/LangContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Modal from '../components/Modal.jsx';
import Spinner from '../components/Spinner.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { shortDate, dateTime } from '../utils/format.js';
import '../styles.css';

const langLabel = (lang, t) => (lang === 'en' ? t('admin.languageEn') : t('admin.languageNy'));

/** The system administrator opens accounts and asks the chairperson for changes. */
export default function AdminUsers() {
  const { t } = useLang();
  const toast = useToast();
  const confirm = useConfirm();

  const [accounts, setAccounts] = useState(null);
  const [requests, setRequests] = useState([]);
  const [busy, setBusy] = useState(false);
  const [add, setAdd] = useState(null);         // the "open an account" form
  const [edit, setEdit] = useState(null);       // the "ask for a change" form

  const load = useCallback(async () => {
    const [members, reqs] = await Promise.all([
      api.get('/admin/members'),
      api.get('/admin/change-requests'),
    ]);
    setAccounts(members);
    setRequests(reqs);
  }, []);

  useEffect(() => { load().catch((e) => toast.error(e.message)); }, [load, toast]);

  async function submitAdd(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.post('/admin/accounts', add);
      toast.success(res.message);
      if (!res.sms_sent) toast.info(res.sms_error || t('admin.passwordNotTexted'));
      setAdd(null);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitEdit(e) {
    e.preventDefault();
    setBusy(true);
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
      setBusy(false);
    }
  }

  async function askStatusChange(account) {
    const kind = account.is_active ? 'deactivate_user' : 'reactivate_user';
    const msg = account.is_active ? t('admin.suspend') : t('admin.reactivate');
    if (!(await confirm({ message: `${msg} — ${account.full_name}?` }))) return;
    try {
      await api.post('/admin/change-requests', { kind, target_user_id: account.id });
      toast.success(t('admin.requestSent'));
      await load();
    } catch (err) {
      toast.error(err.message);
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
        action={<button type="button" className="btn" onClick={() => setAdd({ full_name: '', phone: '', language: 'ny', village: '' })}>{t('admin.addMember')}</button>}
      />

      <section className="sysadmin__grid">
        <section className="dash__card">
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
      </section>

      <section>
        <h2 className="dash__sectionTitle">{t('admin.accounts')}</h2>
        {accounts.length === 0 ? (
          <EmptyState title={t('common.none')} />
        ) : (
          <ul className="adminusers__list">
            {accounts.map((a) => (
              <li key={a.id} className="adminusers__card">
                <div className="adminusers__head">
                  <div>
                    <h3 className="adminusers__name">{a.full_name}</h3>
                    <p className="adminusers__meta">
                      <code>{a.username}</code>
                      {a.phone ? ` · ${a.phone}` : ''}
                      {a.membership_number ? ` · ${a.membership_number}` : ''}
                    </p>
                  </div>
                  <div className="adminusers__tags">
                    <span className="tag">{t(`roles.${a.role}`)}</span>
                    <span className={`tag ${a.is_active ? 'tag--green' : 'tag--grey'}`}>
                      {a.is_active ? t('admin.active') : t('admin.suspended')}
                    </span>
                  </div>
                </div>

                <p className="adminusers__login">
                  {t('admin.lastLogin')}: {a.last_login ? dateTime(a.last_login) : t('admin.never')}
                  {a.village ? ` · ${a.village}` : ''}
                </p>

                <div className="adminusers__actions">
                  <button type="button" className="btn btn--sky btn--small" onClick={() => setEdit({
                    id: a.id, full_name: a.full_name, phone: a.phone || '',
                    language: a.language || 'ny', village: a.village || '', reason: '',
                  })}>
                    {t('admin.edit')}
                  </button>
                  <button type="button" className="btn btn--ghost btn--small" onClick={() => askStatusChange(a)}>
                    {a.is_active ? t('admin.suspend') : t('admin.reactivate')}
                  </button>
                </div>
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
            <button type="submit" form="addAccountForm" className="btn" disabled={busy}>
              {busy ? t('common.saving') : t('common.save')}
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
            <button type="submit" form="editAccountForm" className="btn" disabled={busy}>
              {busy ? t('common.sending') : t('admin.proposeChange')}
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
    </div>
  );
}
