import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useLang } from '../context/LangContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import '../styles.css';

// The roles, in the order the group reads them: the system first, then the
// elected offices, then an ordinary member.
const ROLE_ORDER = ['system_admin', 'admin', 'treasurer', 'secretary', 'member'];

/** What each role may do, and who administers the system. */
export default function AdminRoles() {
  const { t } = useLang();
  const toast = useToast();
  const confirm = useConfirm();

  const [accounts, setAccounts] = useState(null);
  const [busy, setBusy] = useState(0);

  const load = useCallback(async () => {
    setAccounts(await api.get('/admin/members'));
  }, []);

  useEffect(() => { load().catch((e) => toast.error(e.message)); }, [load, toast]);

  async function setAdmin(account, makeAdmin) {
    const ask = makeAdmin ? t('admin.makeAdmin') : t('admin.removeAdmin');
    if (!(await confirm({ message: `${ask} — ${account.full_name}?` }))) return;
    setBusy(account.id);
    try {
      const res = await api.patch(`/admin/accounts/${account.id}/role`, { system_admin: makeAdmin });
      toast.success(res.message);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(0);
    }
  }

  if (!accounts) return <Spinner />;

  const admins = accounts.filter((a) => a.role === 'system_admin');
  const plainMembers = accounts.filter((a) => a.role === 'member');

  return (
    <div className="adminroles">
      <PageHeader title={t('admin.rolesTitle')} subtitle={t('admin.rolesSubtitle')} />
      <p className="sysadmin__note">{t('admin.rolesNote')}</p>

      {/* The one hard rule about roles: these two never sit together. */}
      <section className="dash__card">
        <h2 className="dash__sectionTitle">{t('admin.separationTitle')}</h2>
        <ul className="rolesrules">
          <li className="rolesrules__item rolesrules__item--ok">
            <span className="rolesrules__mark" aria-hidden="true">✓</span>
            <span>{t('admin.separationAllowed')}</span>
          </li>
          <li className="rolesrules__item rolesrules__item--no">
            <span className="rolesrules__mark" aria-hidden="true">×</span>
            <span>{t('admin.separationBody')}</span>
          </li>
        </ul>
      </section>

      {/* What each role may do */}
      <section>
        <h2 className="dash__sectionTitle">{t('admin.permMatrix')}</h2>
        <div className="rolecards">
          {ROLE_ORDER.map((role) => {
            const caps = t(`admin.caps.${role}`);
            return (
              <article key={role} className={`rolecard rolecard--${role}`}>
                <header className="rolecard__head">
                  <h3 className="rolecard__name">{t(`roles.${role}`)}</h3>
                </header>
                <ul className="rolecard__list">
                  {Array.isArray(caps)
                    ? caps.map((c) => <li key={c}>{c}</li>)
                    : <li>{caps}</li>}
                </ul>
              </article>
            );
          })}
        </div>
      </section>

      {/* Who administers the system */}
      <section className="dash__card">
        <h2 className="dash__sectionTitle">{t('admin.systemAdministrators')}</h2>
        {admins.length === 0 ? (
          <p className="muted">{t('common.none')}</p>
        ) : (
          <ul className="adminusers__list">
            {admins.map((a) => (
              <li key={a.id} className="adminusers__card">
                <div className="adminusers__head">
                  <div>
                    <h3 className="adminusers__name">{a.full_name}</h3>
                    <p className="adminusers__meta">
                      <code>{a.username}</code>
                      {a.membership_number ? ` · ${a.membership_number}` : ''}
                    </p>
                  </div>
                  <span className="tag">{t('roles.system_admin')}</span>
                </div>
                <div className="adminusers__actions">
                  <button
                    type="button"
                    className="btn btn--ghost btn--small"
                    disabled={busy === a.id}
                    onClick={() => setAdmin(a, false)}
                  >
                    {t('admin.removeAdmin')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Accounts that may be given the system role */}
      <section className="dash__card">
        <h2 className="dash__sectionTitle">{t('admin.accountsTitle')}</h2>
        <p className="sysadmin__note">{t('admin.roleNote')}</p>
        {plainMembers.length === 0 ? (
          <p className="muted">{t('common.none')}</p>
        ) : (
          <ul className="adminusers__list">
            {plainMembers.map((a) => (
              <li key={a.id} className="adminusers__card">
                <div className="adminusers__head">
                  <div>
                    <h3 className="adminusers__name">{a.full_name}</h3>
                    <p className="adminusers__meta"><code>{a.username}</code>{a.membership_number ? ` · ${a.membership_number}` : ''}</p>
                  </div>
                  <span className={`tag ${a.is_active ? 'tag--green' : 'tag--grey'}`}>
                    {a.is_active ? t('admin.active') : t('admin.suspended')}
                  </span>
                </div>
                <div className="adminusers__actions">
                  <button
                    type="button"
                    className="btn btn--sky btn--small"
                    disabled={busy === a.id}
                    onClick={() => setAdmin(a, true)}
                  >
                    {t('admin.makeAdmin')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
