import { Link } from 'react-router-dom';
import { useLang } from '../../context/LangContext.jsx';
import StatCard from '../../components/StatCard.jsx';
import { BarChart } from '../../components/Charts.jsx';
import ExpectedFines from '../../components/ExpectedFines.jsx';
import GroupedList from '../../components/GroupedList.jsx';
import Icon from '../../components/Icon.jsx';
import QuickActions from '../../components/QuickActions.jsx';
import { money, plainNumber, shortDate } from '../../utils/format.js';
import { useAuth } from '../../context/AuthContext.jsx';
import '../../styles.css';

const shortMonth = (ym) => new Date(`${ym}-01`).toLocaleDateString(undefined, { month: 'short' });

/** The treasurer watches the money: what came in, what went out, what is owed. */
export default function TreasurerDashboard({ data }) {
  const { t } = useLang();
  const { isRecorder } = useAuth();
  const m = data.money || {};
  const w = data.wrappers;
  const flow = data.monthly_flow || [];
  const today = data.today || {};
  const welfareTotal = m.welfare_in + m.welfare_out;
  const welfareInPct = welfareTotal > 0 ? Math.round((m.welfare_in / welfareTotal) * 100) : 0;

  const cycle = data.cycle;

  // The treasurer's seven day-to-day actions, in the order she does them.
  const quickActions = isRecorder ? [
    { to: '/app/savings', key: 'treas.qaRecordSavings', icon: 'savings', cls: 'btn--sky' },
    { to: '/app/loans?action=apply', key: 'treas.qaRecordLoan', icon: 'loans', cls: '' },
    { to: '/app/loans?action=record', key: 'treas.qaRecordRepayment', icon: 'loans', cls: 'btn--gold' },
    { to: '/app/fines', key: 'treas.qaRecordFine', icon: 'fines', cls: '' },
    { to: '/app/welfare', key: 'treas.qaRecordWelfare', icon: 'welfare', cls: 'btn--sky' },
    { to: '/app/loans?filter=approved', key: 'treas.qaViewActiveLoans', icon: 'eye', cls: 'btn--ghost' },
    { to: '/app/analytics?tab=reports', key: 'treas.qaFinancialReports', icon: 'reports', cls: 'btn--ghost' },
  ] : [
    { to: '/app/savings', key: 'treas.qaViewSavings', icon: 'savings', cls: 'btn--sky' },
    { to: '/app/loans', key: 'treas.qaViewLoans', icon: 'loans', cls: '' },
    { to: '/app/loans?tab=repayments', key: 'treas.qaViewRepayments', icon: 'loans', cls: 'btn--gold' },
    { to: '/app/fines', key: 'treas.qaViewFines', icon: 'fines', cls: '' },
    { to: '/app/welfare', key: 'treas.qaViewWelfare', icon: 'welfare', cls: 'btn--sky' },
    { to: '/app/loans?filter=approved', key: 'treas.qaViewActiveLoans', icon: 'eye', cls: 'btn--ghost' },
    { to: '/app/analytics?tab=reports', key: 'treas.qaFinancialReports', icon: 'reports', cls: 'btn--ghost' },
  ];

  return (
    <>
      <section className="dash__card sdash__quick">
        <h2 className="dash__sectionTitle">{t('treas.qaTitle')}</h2>
        <QuickActions actions={quickActions} />
      </section>

      {cycle && (
        <div className="savings__cycle">
          <Icon name="cycles" size={18} />
          <span className="savings__cycleLabel">{t('nav.currentCycle')}</span>
          <strong className="savings__cycleName">{cycle.cycle_name}</strong>
          <span className="savings__cycleDates">
            {shortDate(cycle.start_date)} - {shortDate(cycle.end_date)}
          </span>
        </div>
      )}

      <div className="page-grid page-grid--stat">
        <StatCard label={t('dashboard.totalSavings')}  value={money(m.total_savings)} tone="green" icon="analytics" big />
        <StatCard label={t('dashboard.activeLoans')}   value={plainNumber(data.loans?.approved)} tone="green" icon="loans" />
        <StatCard label={t('dashboard.groupOutstanding')} value={money(m.outstanding)} tone="blue" icon="loans" />
        <StatCard label={t('analytics.totalRepayments')} value={money(m.repaid)} tone="gold" icon="loans" />
        <StatCard
          label={t('dashboard.finesOutstanding')}
          value={money(m.fines_outstanding)}
          tone={m.fines_outstanding > 0 ? 'red' : 'plain'}
          icon="fines"
        />
        <StatCard label={t('dashboard.welfareBalance')} value={money(m.welfare_balance)} tone="green" icon="welfare" />
        <StatCard label={t('dashboard.cashInBox')}     value={money(m.cash_in_box)}   tone="gold" icon="savings" />
        <StatCard label={t('dashboard.loansOut')}      value={money(m.loans_out)}     tone="blue" icon="loans" />
        <StatCard label={t('dashboard.interestEarned')} value={money(m.interest_earned)} tone="gold" icon="shareout" />
        {w && (
          <StatCard
            label={t('dashboard.wrappersCollected')}
            value={money(w.collected_this_month)}
            tone={w.behind_count > 0 ? 'gold' : 'green'}
            icon="wrappers"
          />
        )}
      </div>

      <div className="dash__chips">
        <div className="dash__chip">
          <span className="dash__chipLabel">{t('dashboard.todayCollected')}</span>
          <span className="dash__chipValue money">{money(today.saved)}</span>
        </div>
        <div className="dash__chip">
          <span className="dash__chipLabel">{t('dashboard.todayRepaid')}</span>
          <span className="dash__chipValue money">{money(today.repaid)}</span>
        </div>
        <div className="dash__chip">
          <span className="dash__chipLabel">{t('dashboard.todayFines')}</span>
          <span className="dash__chipValue money">{money(today.fines_paid)}</span>
        </div>
      </div>

      {data.loans?.overdue > 0 && (
        <p className="notice notice--danger">
          {data.loans.overdue} {t('dashboard.overdueLoans').toLowerCase()}.{' '}
          <Link to="/app/loans?filter=overdue">{t('common.view')}</Link>
        </p>
      )}

      {flow.length > 0 && (
        <div className="dash__cols dash__cols--2">
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

          <section className="dash__card">
            <h2 className="dash__sectionTitle">{t('dashboard.welfareInOut')}</h2>
            {welfareTotal > 0 ? (
              <div className="dash__split">
                <div className="dash__splitRow">
                  <span>{t('dashboard.welfareIn')}</span>
                  <span className="dash__splitTrack"><span className="dash__splitIn" style={{ width: `${welfareInPct}%` }} /></span>
                  <span className="dash__splitVal money">{money(m.welfare_in)}</span>
                </div>
                <div className="dash__splitRow">
                  <span>{t('dashboard.welfareOut')}</span>
                  <span className="dash__splitTrack"><span className="dash__splitOut" style={{ width: `${100 - welfareInPct}%` }} /></span>
                  <span className="dash__splitVal money">{money(m.welfare_out)}</span>
                </div>
              </div>
            ) : (
              <p className="muted">{t('common.none')}</p>
            )}
          </section>
        </div>
      )}

      <section className="tdash__cols">
        <div className="tdash__col">
          <h2 className="dash__sectionTitle">{t('dashboard.pendingLoans')}</h2>
          {data.pending_loans?.length ? (
            <ul className="tdash__list">
              {data.pending_loans.map((l) => (
                <li key={l.id}>
                  <span className="tdash__who">{l.full_name}</span>
                  <span className="tdash__meta">
                    {l.with_interest ? '' : t('loans.noInterest')}
                  </span>
                  <span className="tdash__amount money">{money(l.amount)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">{t('dashboard.nothingPending')}</p>
          )}
          <Link to="/app/loans" className="btn btn--sky btn--small">{t('loans.title')}</Link>
        </div>

        <div className="tdash__col">
          <h2 className="dash__sectionTitle">{t('dashboard.recentSavings')}</h2>
          {data.recent_savings?.length ? (
            <GroupedList
              items={data.recent_savings}
              listClass="tdash__list is-grouped"
              renderItem={(s) => (
                <>
                  <span className="tdash__who">{s.full_name}</span>
                  <span className="tdash__amount money">{money(s.amount)}</span>
                </>
              )}
            />
          ) : (
            <p className="muted">{t('savings.empty')}</p>
          )}
          {isRecorder
            ? <Link to="/app/savings" className="btn btn--small">{t('savings.record')}</Link>
            : <Link to="/app/analytics" className="btn btn--sky btn--small">{t('nav.analytics')}</Link>}
        </div>
      </section>

      <ExpectedFines fines={data.expected_fines} />
    </>
  );
}
