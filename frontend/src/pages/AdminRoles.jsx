import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useLang } from '../context/LangContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import { humanAction } from '../utils/format.js';
import '../styles.css';

/** Roles and permissions: what each role may do, and who runs the system. */
export default function AdminRoles() {
  const { t } = useLang();
  const toast = useToast();
  const confirm = useConfirm();

  const [matrix, setMatrix] = useState(null);
  const [accounts, setAccounts] = useState(null);
  const [busy, setBusy] = useState(0);

  const load = async () => {
    const [perms, members] = await Promise.all([
      api.get('/admin/permissions'),
      api.get('/admin/members'),
    ]);
    setMatrix(perms);
    setAccounts(members);
  };

  useEffect(() => { load().catch((e) => toast.error(e.message)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  if (!matrix || !accounts) return <Spinner />;

  const admins = accounts.filter((a) => a.role === 'system_admin');
  const plainMembers = accounts.filter((a) => a.role === 'member');
  const roleLabel = (r) => t(`roles.${r}`);

  return (
    <div className="adminroles">
      <PageHeader title={t('admin.rolesTitle')} subtitle={t('admin.rolesSubtitle')} />
      <p className="sysadmin__note">{t('admin.rolesNote')}</p>

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
                  <span className="tag">{roleLabel(a.role)}</span>
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

      <section className="dash__card">
        <h2 className="dash__sectionTitle">{t('admin.accountsTitle')}</h2>
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

      <section className="dash__card">
        <h2 className="dash__sectionTitle">{t('admin.permMatrix')}</h2>
        <div className="adminroles__scroll">
          <table className="sysadmin__table adminroles__table">
            <thead>
              <tr>
                <th>{t('admin.permColumn')}</th>
                {matrix.roles.map((r) => <th key={r}>{roleLabel(r)}</th>)}
              </tr>
            </thead>
            <tbody>
              {matrix.permissions.map((p) => (
                <tr key={p.key}>
                  <td>{humanAction(p.key.replace(/\./g, ' '))}</td>
                  {matrix.roles.map((r) => (
                    <td key={r} className="adminroles__cell">
                      {p.roles.includes(r) ? <span className="adminroles__yes" aria-label={t('common.yes')}>✓</span> : <span className="muted">·</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
