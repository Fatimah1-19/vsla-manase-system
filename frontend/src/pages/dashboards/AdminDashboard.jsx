import { Link } from 'react-router-dom';
import { useLang } from '../../context/LangContext.jsx';
import StatCard from '../../components/StatCard.jsx';
import { BarChart, Pie } from '../../components/Charts.jsx';
import ExpectedFines from '../../components/ExpectedFines.jsx';
import { money, plainNumber, shortDate, dateTime, humanAction } from '../../utils/format.js';
import { groupRuleLabel } from '../../utils/groupRuleLabels.js';
import '../../styles.css';

const shortMonth = (ym) => new Date(`${ym}-01`).toLocaleDateString(undefined, { month: 'short' });

/** A proposed rule value in plain words, for the queue table. */
function shown(value, t) {
  if (value === 'yes' || value === 'no') return value === 'yes' ? t('common.yes') : t('common.no');
  if (value === true || value === false) return value ? t('common.yes') : t('common.no');
  return value === undefined || value === null || String(value).trim() === '' ? '—' : String(value);
}

/**
 * The chairperson's board. She leads the group: she watches the money and the
 * people, and at the top sits the queue of things that are hers to settle —
 * join requests after the members have voted, VSLA rule changes the
 * administrator proposed, and votes that have passed and await carrying out.
 * She is not the system administrator: accounts and technical settings are
 * never shown here.
 */
export default function AdminDashboard({ data }) {
  const { t } = useLang();
  const m = data.money || {};
  const sys = data.system || {};
  const flow = data.monthly_flow || [];
  const chair = data.chair || {};

  const joinQueue = chair.pending_joins || [];
  const ruleQueue = chair.pending_rule_changes || [];
  const carryQueue = [
    { n: chair.cases_to_carry, label: t('chair.casesToCarry'), to: '/app/cases' },
    { n: chair.elections_to_carry, label: t('chair.electionsToCarry'), to: '/app/leadership' },
  ].filter((c) => c.n > 0);
  const somethingWaiting = joinQueue.length > 0 || ruleQueue.length > 0 || carryQueue.length > 0;

  const monthContribs = data.contributions_by_month || [];
  const contributions = monthContribs.map((c) => ({
    label: `${shortMonth(c.month)} ${c.month.slice(0, 4)}`,
    value: c.amount,
    text: money(c.amount),
  }));
  const contributed = monthContribs.reduce((s, c) => s + c.amount, 0);

  return (
    <>
      {/* ---- THE HIGH-LEVEL PICTURE: seven summary cards ----------------- */}
      <div className="page-grid page-grid--stat">
        <StatCard label={t('admin.totalMembers')} value={plainNumber(data.members?.total)} icon="members" big />
        <StatCard label={t('dashboard.activeMembers')} value={plainNumber(data.members?.active)} tone="green" icon="members" />
        <StatCard
          label={t('dashboard.pendingRequests')}
          value={plainNumber(data.pending_join_requests)}
          tone={data.pending_join_requests > 0 ? 'gold' : 'plain'}
          icon="requests"
        />
        <StatCard label={t('dashboard.totalSavings')} value={money(m.total_savings)} tone="green" icon="savings" />
        <StatCard label={t('dashboard.activeLoans')} value={plainNumber(data.loans?.approved)} tone="gold" icon="loans" />
        <StatCard label={t('dashboard.groupOutstanding')} value={money(m.outstanding)} tone="red" icon="loans" />
        <StatCard
          label={t('admin.pendingConfigChanges')}
          value={plainNumber(chair.rule_changes_waiting)}
          tone={chair.rule_changes_waiting > 0 ? 'gold' : 'plain'}
          icon="requests"
        />
      </div>

      {/* ---- WHAT IS HERS TO SETTLE -------------------------------------- */}
      {somethingWaiting && (
        <section className="dash__card chair__queue">
          <h2 className="dash__sectionTitle">{t('chair.queueTitle')}</h2>
          <div className="chair__queueGrid">
            {joinQueue.length > 0 && (
              <div>
                <h3 className="chair__sub">{t('chair.joinsTitle')}</h3>
                <div className="settings__tableWrap">
                  <table className="sysadmin__table">
                    <thead>
                      <tr>
                        <th>{t('common.name')}</th>
                        <th>{t('common.phone')}</th>
                        <th>{t('chair.memberVotes')}</th>
                        <th>{t('chair.open')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {joinQueue.map((j) => (
                        <tr key={j.id}>
                          <td>{j.full_name || '—'}</td>
                          <td>{j.phone || '—'}</td>
                          <td>{t('cases.voteTally', j.yes_votes, j.no_votes)}</td>
                          <td><Link to="/app/requests" className="adash__viewAll">{t('chair.open')}</Link></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {ruleQueue.length > 0 && (
              <div>
                <h3 className="chair__sub">{t('chair.rulesTitle')}</h3>
                <div className="settings__tableWrap">
                  <table className="sysadmin__table">
                    <thead>
                      <tr>
                        <th>{t('chair.rulesChanged')}</th>
                        <th>{t('chair.proposedBy')}</th>
                        <th>{t('chair.open')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ruleQueue.map((c) => (
                        <tr key={c.id}>
                          <td>
                            {Object.entries(c.payload || {}).map(([k, v]) => (
                              <span key={k} className="chair__rule">
                                {t(groupRuleLabel(k))}: <strong>{shown(v, t)}</strong>
                              </span>
                            ))}
                          </td>
                          <td>{c.requested_by_name || '—'}</td>
                          <td><Link to="/app/approvals" className="adash__viewAll">{t('chair.open')}</Link></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {carryQueue.length > 0 && (
              <div>
                <h3 className="chair__sub">{t('chair.carryTitle')}</h3>
                <ul className="chair__carry">
                  {carryQueue.map((c) => (
                    <li key={c.to}>
                      <span className="chair__carryNum">{plainNumber(c.n)}</span>
                      <span>{c.label}</span>
                      <Link to={c.to} className="btn btn--small">{t('chair.carryOut')}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

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
        <h2 className="dash__sectionTitle">{t('chair.moneyTitle')}</h2>
        <div className="page-grid adash__people">
          <StatCard label={t('dashboard.cashInBox')} value={money(m.cash_in_box)} tone="gold" icon="savings" />
          <StatCard label={t('dashboard.interestEarned')} value={money(m.interest_earned)} tone="gold" icon="shareout" />
          <StatCard label={t('dashboard.welfareBalance')} value={money(m.welfare_balance)} tone="green" icon="welfare" />
          <StatCard label={t('dashboard.finesOutstanding')} value={money(m.fines_outstanding)} tone="red" icon="fines" />
          {data.wrappers && (
            <StatCard
              label={t('dashboard.wrappersCollected')}
              value={money(data.wrappers.collected_this_month)}
              tone={data.wrappers.behind_count > 0 ? 'gold' : 'green'}
              icon="wrappers"
            />
          )}
        </div>
      </section>

      <section className="adash__group">
        <h2 className="dash__sectionTitle">{t('nav.loans')}</h2>
        <div className="page-grid adash__people">
          <StatCard label={t('dashboard.pendingLoans')} value={plainNumber(data.loans?.pending)} icon="loans" />
          <StatCard label={t('dashboard.overdueLoans')} value={plainNumber(data.loans?.overdue)}
            tone={data.loans?.overdue > 0 ? 'red' : 'plain'} icon="fines" />
        </div>
      </section>

      {/* ---- SUPERVISING THE COMMITTEE: meetings and attendance ---------- */}
      {(data.recent_meetings?.length > 0 || data.attendance_rate != null) && (
        <section className="adash__group">
          <h2 className="dash__sectionTitle">{t('chair.committeeTitle')}</h2>
          <div className="page-grid adash__people">
            {data.attendance_rate != null && (
              <StatCard label={t('dashboard.attendanceRate')} value={`${plainNumber(data.attendance_rate)}%`} icon="members" />
            )}
            {data.recent_meetings?.slice(0, 4).map((mt) => (
              <StatCard
                key={mt.id}
                label={shortDate(mt.meeting_date)}
                value={t('chair.presentCount', mt.present_count, mt.marked)}
                icon="meetings"
              />
            ))}
          </div>
        </section>
      )}

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

      <ExpectedFines fines={data.expected_fines} />

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
          <Link to="/app/approvals" className="btn">{t('chair.confirmChanges')}</Link>
          <Link to="/app/members" className="btn btn--sky">{t('members.addPerson')}</Link>
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
