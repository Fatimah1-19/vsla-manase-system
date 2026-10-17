import { Link } from 'react-router-dom';
import { useLang } from '../../context/LangContext.jsx';
import StatCard from '../../components/StatCard.jsx';
import { plainNumber, dateTime, shortDate, humanAction } from '../../utils/format.js';
import { groupRuleLabel } from '../../utils/groupRuleLabels.js';
import '../../styles.css';

/** A setting value in plain words, for the change beside it. */
function shown(key, value, t) {
  if (key === 'join_screening_questions') {
    try {
      const list = JSON.parse(value);
      return Array.isArray(list) ? `${list.length}` : String(value);
    } catch { return String(value); }
  }
  if (value === 'yes' || value === 'no') return value === 'yes' ? t('common.yes') : t('common.no');
  return value === undefined || value === null || value === '' ? '—' : String(value);
}

/**
 * The system administrator looks after accounts and the system itself.
 * No money is ever shown here. VSLA settings are only proposed: the chairperson
 * confirms them, and the administrator can never confirm her own change.
 */
export default function SystemAdminDashboard({ data }) {
  const { t } = useLang();
  const u = data.users || {};
  const s = data.system_settings || {};
  const current = data.group_settings || {};
  const pending = (data.config_changes || []).filter((c) => c.status === 'pending');

  return (
    <>
      {/* The numbers */}
      <div className="page-grid page-grid--stat">
        <StatCard label={t('admin.totalUsers')} value={plainNumber(u.total)} icon="members" big />
        <StatCard label={t('admin.activeUsers')} value={plainNumber(u.active)} tone="green" icon="members" />
        <StatCard
          label={t('admin.inactiveUsers')}
          value={plainNumber(u.inactive)}
          tone={u.inactive > 0 ? 'gold' : 'plain'}
          icon="lock"
        />
        <StatCard label={t('admin.totalMembers')} value={plainNumber(u.members_total)} icon="members" />
        <StatCard
          label={t('admin.committeeMembers')}
          value={plainNumber((u.chairpersons || 0) + (u.treasurers || 0) + (u.secretaries || 0))}
          icon="leadership"
        />
        <StatCard label={t('admin.sysAdmins')} value={plainNumber(u.administrators)} icon="lock" />
        <StatCard
          label={t('admin.pendingConfigChanges')}
          value={plainNumber(data.pending_config_changes)}
          tone={data.pending_config_changes > 0 ? 'gold' : 'plain'}
          icon="requests"
        />
      </div>

      {/* Quick actions */}
      <section className="sysadmin__quick">
        <h2 className="dash__sectionTitle">{t('admin.qaTitle')}</h2>
        <div className="sysadmin__links">
          <Link to="/app/admin/users" className="btn">{t('admin.qaManageUsers')}</Link>
          <Link to="/app/admin/roles" className="btn btn--sky">{t('admin.qaManageRoles')}</Link>
          <Link to="/app/activity" className="btn btn--gold">{t('admin.qaAuditTrail')}</Link>
          <Link to="/app/admin/activity" className="btn btn--ghost">{t('admin.qaSystemActivity')}</Link>
          <Link to="/app/admin/settings" className="btn btn--ghost">{t('admin.qaPendingChanges')}</Link>
          <Link to="/app/admin/system" className="btn btn--ghost">{t('admin.qaSystemSettings')}</Link>
        </div>
      </section>

      <div className="sysadmin__grid">
        {/* Pending configuration changes */}
        <section className="dash__card">
          <h2 className="dash__sectionTitle">{t('admin.pendingConfigTitle')}</h2>
          <p className="sysadmin__note">{t('admin.pendingConfigNote')}</p>
          {pending.length === 0 ? (
            <p className="muted">{t('admin.noPendingConfig')}</p>
          ) : (
            <ul className="sysadmin__config">
              {pending.map((c) => (
                <li key={c.id} className="sysadmin__configItem">
                  <div className="sysadmin__configHead">
                    <strong>{t('admin.kind_group_rules')}</strong>
                    <span className="tag tag--gold">{t('admin.statusPending')}</span>
                  </div>
                  <ul className="sysadmin__configKeys">
                    {Object.entries(c.payload || {}).map(([k, v]) => (
                      <li key={k}>
                        <span className="muted">{t(groupRuleLabel(k))}</span>
                        <span className="sysadmin__configVal">
                          <em>{shown(k, current[k], t)}</em>
                          <span aria-hidden="true"> → </span>
                          <strong>{shown(k, v, t)}</strong>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="sysadmin__actMeta">
                    {t('admin.proposedBy')}: {c.requested_by_name || t('activity.system')}
                    {' · '}
                    {t('admin.proposedOn')}: {shortDate(c.created_at)}
                  </p>
                  <p className="sysadmin__actMeta">{t('admin.cannotConfirmOwn')}</p>
                </li>
              ))}
            </ul>
          )}
          <Link to="/app/admin/settings" className="btn btn--sky btn--small">{t('settings.title')}</Link>
        </section>

        {/* Recent system activity */}
        <section className="dash__card">
          <h2 className="dash__sectionTitle">{t('admin.recentSystemActivity')}</h2>
          {(data.recent_activity || []).length === 0 ? (
            <p className="muted">{t('common.none')}</p>
          ) : (
            <table className="sysadmin__table">
              <thead>
                <tr>
                  <th>{t('admin.actUser')}</th>
                  <th>{t('admin.actAction')}</th>
                  <th>{t('admin.actDateTime')}</th>
                  <th>{t('admin.actStatus')}</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_activity.map((a, i) => (
                  <tr key={i}>
                    <td>{a.full_name || t('activity.system')}</td>
                    <td>{humanAction(a.action)}</td>
                    <td>{dateTime(a.created_at)}</td>
                    <td>
                      <span className={`tag ${a.status === 'failed' ? 'tag--grey' : 'tag--green'}`}>
                        {a.status === 'failed' ? t('admin.statusFailed') : t('admin.statusSuccess')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Link to="/app/activity" className="btn btn--ghost btn--small">{t('admin.viewFullAudit')}</Link>
        </section>
      </div>

      {/* How the system behaves */}
      <section className="dash__card sysadmin__systemCard">
        <h2 className="dash__sectionTitle">{t('admin.systemTitle')}</h2>
        <p className="sysadmin__note">{t('admin.settingsNote')}</p>
        <ul className="sysadmin__settings">
          <li><span>{t('admin.sessionTimeoutLabel')}</span><strong>{plainNumber(s.session_timeout_minutes)}</strong></li>
          <li><span>{t('admin.maxLoginLabel')}</span><strong>{plainNumber(s.max_login_attempts)}</strong></li>
          <li><span>{t('admin.lockLabel')}</span><strong>{plainNumber(s.lock_minutes)}</strong></li>
          <li><span>{t('admin.resetTriesLabel')}</span><strong>{plainNumber(s.reset_max_tries)}</strong></li>
          <li><span>{t('admin.smsLabel')}</span><strong>{String(s.sms_enabled).toLowerCase() === 'false' ? t('admin.off') : t('admin.on')}</strong></li>
        </ul>
        <Link to="/app/admin/system" className="btn btn--sky btn--small">{t('admin.manageSettings')}</Link>
      </section>
    </>
  );
}
