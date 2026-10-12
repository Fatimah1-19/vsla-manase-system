import { Link } from 'react-router-dom';
import { useLang } from '../../context/LangContext.jsx';
import StatCard from '../../components/StatCard.jsx';
import { BarChart, Pie } from '../../components/Charts.jsx';
import { money, plainNumber, shortDate, dateTime, humanAction } from '../../utils/format.js';
import './AdminDashboard.css';

const shortMonth = (ym) => new Date(`${ym}-01`).toLocaleDateString(undefined, { month: 'short' });

/**
 * The chairperson sees the whole group: the money, the people and the
 * system itself (locked accounts, texts going out).
 */
export default function AdminDashboard({ data }) {
  const { t } = useLang();
  const m = data.money || {};
  const sys = data.system || {};
  const flow = data.monthly_flow || [];

  const monthContribs = data.contributions_by_month || [];
  const contributions = monthContribs.map((c) => ({
    label: `${shortMonth(c.month)} ${c.month.slice(0, 4)}`,
    value: c.amount,
    text: money(c.amount),
  }));
  const contributed = monthContribs.reduce((s, c) => s + c.amount, 0);

  return (
    <>
      <div className="page-grid page-grid--stat">
        <StatCard label={t('dashboard.cashInBox')}      value={money(m.cash_in_box)}     tone="gold" icon="savings" big />
        <StatCard label={t('dashboard.totalSavings')}   value={money(m.total_savings)}   tone="green" icon="analytics" />
        <StatCard label={t('dashboard.activeLoans')}    value={plainNumber(data.loans?.approved)} tone="red" icon="loans" />
        <StatCard label={t('dashboard.groupOutstanding')} value={money(m.outstanding)}   tone="red" icon="loans" />
        <StatCard label={t('dashboard.interestEarned')} value={money(m.interest_earned)} tone="gold" icon="shareout" />
        <StatCard label={t('dashboard.welfareBalance')} value={money(m.welfare_balance)} tone="green" icon="welfare" />
        <StatCard
          label={t('dashboard.finesOutstanding')}
          value={money(m.fines_outstanding)}
          tone="red"
          icon="fines"
        />
        {data.wrappers && (
          <StatCard
            label={t('dashboard.wrappersCollected')}
            value={money(data.wrappers.collected_this_month)}
            tone={data.wrappers.behind_count > 0 ? 'gold' : 'green'}
            icon="wrappers"
          />
        )}
      </div>

      <div className="adash__overview">
        <section className="dash__card adash__pieCard">
          <div className="adash__activityHead">
            <h2 className="dash__sectionTitle">{t('dashboard.contributionOverview')}</h2>
            <Link to="/app/analytics?tab=reports" className="adash__viewAll">{t('dashboard.viewAllReports')}</Link>
          </div>
          {contributed > 0 ? (
            <Pie items={contributions} showValues={false} />
          ) : (
            <p className="muted">{t('common.none')}</p>
          )}
        </section>

        <section className="dash__card adash__activityCard">
          <div className="adash__activityHead">
            <h2 className="dash__sectionTitle">{t('dashboard.recentActivity')}</h2>
            <Link to="/app/activity" className="adash__viewAll">{t('dashboard.viewAllActivities')}</Link>
          </div>
          {data.recent_activity?.length ? (
            <ul className="adash__activity">
              {data.recent_activity.slice(0, 6).map((a, i) => (
                <li key={i}>
                  <span className="adash__action">{humanAction(a.action)}</span>
                  {a.details && <span className="adash__details">{a.details}</span>}
                  <span className="adash__when">{a.full_name || '—'} · {dateTime(a.created_at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">{t('common.none')}</p>
          )}
        </section>
      </div>

      <section className="adash__group">
        <h2 className="dash__sectionTitle">{t('nav.people')}</h2>
        <div className="page-grid adash__people">
          <StatCard label={t('dashboard.activeMembers')} value={plainNumber(data.members?.active)} icon="members" />
          <StatCard label={t('dashboard.pendingRequests')} value={plainNumber(data.pending_join_requests)}
            tone={data.pending_join_requests > 0 ? 'gold' : 'plain'} icon="requests" />
          <StatCard label={t('dashboard.pendingLoans')} value={plainNumber(data.loans?.pending)} icon="loans" />
          <StatCard label={t('dashboard.overdueLoans')} value={plainNumber(data.loans?.overdue)}
            tone={data.loans?.overdue > 0 ? 'red' : 'plain'} icon="fines" />
        </div>
      </section>

      {flow.length > 0 && (
        <section className="dash__card">
          <h2 className="dash__sectionTitle">{t('dashboard.moneyFlow')}</h2>
          <BarChart
            data={flow.map((f) => ({ label: shortMonth(f.month), savings: f.savings, repayments: f.repayments }))}
            series={[
              { key: 'savings', label: t('dashboard.received') },
              { key: 'repayments', label: t('dashboard.repaid') },
            ]}
            format={(v) => money(v, { compact: true })}
          />
        </section>
      )}

      <section className="adash__system">
        <h2 className="dash__sectionTitle">{t('dashboard.system')}</h2>
        <div className="adash__sysGrid">
          <div className="adash__sysItem">
            <span className="adash__sysNum">{plainNumber(sys.active_users)}</span>
            <span className="adash__sysLabel">{t('dashboard.accountsInUse')}</span>
          </div>
          <div className={sys.locked_users > 0 ? 'adash__sysItem is-alert' : 'adash__sysItem'}>
            <span className="adash__sysNum">{plainNumber(sys.locked_users)}</span>
            <span className="adash__sysLabel">{t('dashboard.lockedAccounts').toLowerCase()}</span>
          </div>
          <div className="adash__sysItem">
            <span className="adash__sysNum">{plainNumber(sys.sms_today)}</span>
            <span className="adash__sysLabel">{t('dashboard.smsToday').toLowerCase()}</span>
          </div>
          <div className={sys.sms_failed > 0 ? 'adash__sysItem is-alert' : 'adash__sysItem'}>
            <span className="adash__sysNum">{plainNumber(sys.sms_failed)}</span>
            <span className="adash__sysLabel">{t('dashboard.smsFailed')}</span>
          </div>
        </div>

        {sys.locked_users > 0 && (
          <p className="notice notice--warn">
            {t('dashboard.lockedNote', sys.locked_users)}{' '}
            <Link to="/app/members">{t('nav.members')}</Link>
          </p>
        )}
      </section>

      <section className="adash__quick">
        <h2 className="dash__sectionTitle">{t('dashboard.commonJobs')}</h2>
        <div className="adash__links">
          <Link to="/app/members" className="btn">{t('members.addPerson')}</Link>
          <Link to="/app/analytics" className="btn btn--sky">{t('nav.analytics')}</Link>
          <Link to="/app/messages" className="btn btn--gold">{t('messages.send')}</Link>
          <Link to="/app/shareout" className="btn btn--ghost">{t('shareout.title')}</Link>
        </div>
      </section>

      {data.next_meeting && (
        <p className="adash__meeting">
          {t('dashboard.nextMeeting')}: <strong>{shortDate(data.next_meeting.meeting_date)}</strong>
          {data.next_meeting.location ? ` · ${data.next_meeting.location}` : ''}
        </p>
      )}
    </>
  );
}
