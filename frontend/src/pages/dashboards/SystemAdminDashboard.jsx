import { Link } from 'react-router-dom';
import { useLang } from '../../context/LangContext.jsx';
import StatCard from '../../components/StatCard.jsx';
import { plainNumber, dateTime, humanAction } from '../../utils/format.js';
import '../../styles.css';

/**
 * The system administrator looks after accounts and the system itself.
 * No money is ever shown here.
 */
export default function SystemAdminDashboard({ data }) {
  const { t } = useLang();
  const u = data.users || {};
  const s = data.system_settings || {};
  const sms = data.sms || {};

  return (
    <>
      <div className="page-grid page-grid--stat">
        <StatCard label={t('admin.activeAccounts')} value={plainNumber(u.active)} tone="green" icon="members" big />
        <StatCard label={t('admin.chairpersons')} value={plainNumber(u.chairpersons)} icon="leadership" />
        <StatCard label={t('admin.treasurers')} value={plainNumber(u.treasurers)} icon="savings" />
        <StatCard label={t('admin.secretaries')} value={plainNumber(u.secretaries)} icon="reports" />
        <StatCard label={t('admin.administrators')} value={plainNumber(u.administrators)} icon="lock" />
        <StatCard
          label={t('admin.lockedAccounts')}
          value={plainNumber(u.locked)}
          tone={u.locked > 0 ? 'red' : 'plain'}
          icon="lock"
        />
        <StatCard
          label={t('admin.pendingChanges')}
          value={plainNumber(data.pending_change_requests)}
          tone={data.pending_change_requests > 0 ? 'gold' : 'plain'}
          icon="requests"
        />
        <StatCard
          label={t('admin.pendingJoins')}
          value={plainNumber(data.pending_join_requests)}
          tone={data.pending_join_requests > 0 ? 'gold' : 'plain'}
          icon="requests"
        />
        <StatCard
          label={t('admin.failedLogins7d')}
          value={plainNumber(data.failed_logins_7d)}
          tone={data.failed_logins_7d > 0 ? 'gold' : 'plain'}
          icon="lock"
        />
        <StatCard label={t('admin.smsToday')} value={plainNumber(data.sms_today)} icon="messages" />
        <StatCard
          label={t('admin.smsStatus')}
          value={sms.enabled && sms.configured ? t('admin.on') : t('admin.off')}
          tone={sms.enabled && sms.configured ? 'green' : 'red'}
          icon="messages"
        />
      </div>

      <div className="sysadmin__grid">
        <section className="dash__card">
          <h2 className="dash__sectionTitle">{t('admin.systemTitle')}</h2>
          <p className="sysadmin__note">{t('admin.settingsNote')}</p>
          <ul className="sysadmin__settings">
            <li><span>{t('admin.sessionTimeoutLabel')}</span><strong>{plainNumber(s.session_timeout_minutes)}</strong></li>
            <li><span>{t('admin.maxLoginLabel')}</span><strong>{plainNumber(s.max_login_attempts)}</strong></li>
            <li><span>{t('admin.lockLabel')}</span><strong>{plainNumber(s.lock_minutes)}</strong></li>
            <li><span>{t('admin.resetTriesLabel')}</span><strong>{plainNumber(s.reset_max_tries)}</strong></li>
            <li><span>{t('admin.smsLabel')}</span><strong>{String(s.sms_enabled).toLowerCase() === 'false' ? t('admin.off') : t('admin.on')}</strong></li>
          </ul>
          <Link to="/app/admin/settings" className="btn btn--sky btn--small">{t('admin.manageSettings')}</Link>
        </section>

        <section className="dash__card">
          <h2 className="dash__sectionTitle">{t('admin.recentSignins')}</h2>
          {(data.recent_activity || []).length === 0 ? (
            <p className="muted">{t('common.none')}</p>
          ) : (
            <ul className="sysadmin__activity">
              {data.recent_activity.map((a, i) => (
                <li key={i}>
                  <span className="sysadmin__actAction">{humanAction(a.action)}</span>
                  <span className="sysadmin__actMeta">
                    {(a.full_name || t('activity.system'))} · {dateTime(a.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link to="/app/activity" className="btn btn--ghost btn--small">{t('admin.viewActivity')}</Link>
        </section>
      </div>

      <section className="sysadmin__quick">
        <h2 className="dash__sectionTitle">{t('admin.quickAdmin')}</h2>
        <div className="sysadmin__links">
          <Link to="/app/admin/users" className="btn">{t('admin.manageAccounts')}</Link>
          <Link to="/app/admin/settings" className="btn btn--sky">{t('admin.manageSettings')}</Link>
          <Link to="/app/activity" className="btn btn--gold">{t('admin.viewActivity')}</Link>
          <Link to="/app/requests" className="btn btn--ghost">{t('nav.requests')}</Link>
        </div>
      </section>
    </>
  );
}
