import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useLang } from '../context/LangContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import StatCard from '../components/StatCard.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { BarChart, LineChart, HBars, Ring } from '../components/Charts.jsx';
import { money, plainNumber, shortDate, monthLabel } from '../utils/format.js';
import Reports from './Reports.jsx';
import './Analytics.css';

const LOAN_TONE = { pending: 'maize', approved: 'sky', repaid: 'leaf', rejected: 'flame', defaulted: 'flame' };

/** A panel with a title and an optional one-line explanation. */
function Panel({ title, note, children }) {
  return (
    <section className="panel analytics__panel">
      <h2 className="panel__title">{title}</h2>
      {note && <p className="analytics__note">{note}</p>}
      {children}
    </section>
  );
}

function AnalyticsView() {
  const { t } = useLang();
  const toast = useToast();
  const [d, setD] = useState(null);

  useEffect(() => { api.get('/analytics').then(setD).catch((e) => toast.error(e.message)); }, [toast]);

  if (!d) return <Spinner />;
  if (!d.cycle) return <EmptyState title={t('shareout.noCycle')} />;

  const months = d.monthly.map((m) => ({ ...m, label: monthLabel(m.month) }));
  const status = d.loans.status;
  const loanItems = ['pending', 'approved', 'repaid', 'rejected', 'defaulted']
    .filter((k) => status[k] > 0)
    .map((k) => ({ label: t(`loans.${k === 'repaid' ? 'repaidStatus' : k}`), value: status[k], text: status[k], tone: LOAN_TONE[k] }));
  const meetingPoints = d.meetings.recent.filter((m) => m.rate !== null).map((m) => ({ label: shortDate(m.date).replace(/ \d{4}$/, ''), value: m.rate }));
  const p = d.projection;

  return (
    <div className="print-area">
      <p className="analytics__viewNote muted">
        {d.cycle.cycle_name} · {t('analytics.updated')} {shortDate(d.generated_at)}
      </p>
      <div className="page-grid page-grid--stat">
        <StatCard label={t('dashboard.cashInBox')} value={money(d.cash_in_box)} tone="gold" big />
          <StatCard label={t('dashboard.totalSavings')} value={money(d.savings.total)} tone="green" />
          <StatCard label={t('analytics.lentOut')} value={money(d.loans.outstanding)} hint={t('analytics.ofBox', d.loans.box_in_use)} tone="blue" />
          <StatCard label={t('dashboard.interestEarned')} value={money(d.loans.interest_earned)} hint={t('analytics.interestNote')} />
          <StatCard label={t('analytics.avgSavings')} value={money(d.members.avg_savings)} hint={t('analytics.median', money(d.members.median_savings))} />
          <StatCard label={t('dashboard.activeMembers')} value={plainNumber(d.members.active)} />
        </div>

        <Panel title={t('analytics.flowTitle')} note={t('analytics.flowNote')}>
          <BarChart
            data={months}
            series={[
              { key: 'savings', label: t('nav.savings') },
              { key: 'repayments', label: t('analytics.repayments') },
              { key: 'loans_given', label: t('analytics.loansGiven') },
            ]}
          />
        </Panel>

        <div className="analytics__cols">
          <Panel title={t('analytics.health')} note={t('analytics.healthNote')}>
            <div className="analytics__rings">
              <Ring value={d.loans.collection_rate} label={t('analytics.collection')} tone="auto" />
              <Ring value={d.loans.portfolio_at_risk} label={t('analytics.atRisk')} tone="auto" invert />
              <Ring value={d.meetings.attendance_rate} label={t('dashboard.attendanceRate')} tone="sky" />
            </div>
          </Panel>

          <Panel title={t('analytics.loanStatus')}>
            {loanItems.length ? <HBars items={loanItems} /> : <p className="muted">{t('loans.empty')}</p>}
            <p className="analytics__foot">
              {t('analytics.overdue')}: <strong className="money money--neg">{money(d.loans.overdue_outstanding)}</strong>
            </p>
          </Panel>
        </div>

        <div className="analytics__cols">
          <Panel title={t('analytics.topSavers')}>
            {d.members.top_savers.length ? (
              <HBars items={d.members.top_savers.map((s) => ({ label: s.full_name, value: s.total, text: money(s.total, { compact: true }) }))} />
            ) : <p className="muted">{t('savings.empty')}</p>}
          </Panel>

          <Panel title={t('analytics.growth')}>
            <LineChart data={d.members.growth.map((g) => ({ label: monthLabel(g.month), value: g.members }))} />
          </Panel>
        </div>

        <Panel title={t('analytics.borrowers')}>
          {d.loans.borrowers.length ? (
            <ul className="analytics__list">
              {d.loans.borrowers.map((b) => (
                <li key={b.loan_id}>
                  <span>{b.full_name}</span>
                  <span className="muted">{shortDate(b.due_date)}</span>
                  {b.overdue ? <span className="tag tag--red">{t('loans.overdue')}</span> : <span className="tag tag--green">{t('loans.approved')}</span>}
                  <span className="money">{money(b.outstanding)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="muted">{t('analytics.noOpenLoans')}</p>}
        </Panel>

        <div className="analytics__cols">
          <Panel title={t('wrappers.title')} note={t('analytics.wrappersNote', money(d.wrappers.monthly))}>
            <div className="analytics__wrapTop">
              <Ring
                value={d.wrappers.expected_this_month > 0 ? Math.round((d.wrappers.collected_this_month / d.wrappers.expected_this_month) * 100) : 0}
                label={t('analytics.thisMonth')} tone="auto"
              />
              <dl className="analytics__facts">
                <div><dt>{t('wrappers.collected')}</dt><dd className="money">{money(d.wrappers.collected_this_month)}</dd></div>
                <div><dt>{t('analytics.cycleTotal')}</dt><dd className="money">{money(d.wrappers.cycle_total)}</dd></div>
                <div><dt>{t('analytics.totalBehind')}</dt><dd className="money money--neg">{money(d.wrappers.total_owed)}</dd></div>
              </dl>
            </div>
            <BarChart data={months} series={[{ key: 'wrappers', label: t('wrappers.title') }]} height={140} />
            {d.wrappers.behind.length > 0 && (
              <ul className="analytics__list analytics__list--tight">
                {d.wrappers.behind.slice(0, 5).map((r) => (
                  <li key={r.member_id}><span>{r.full_name}</span><span className="muted">{t('wrappers.monthsDue', r.months_due)}</span><span className="money money--neg">{money(r.owed)}</span></li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title={t('analytics.meetings')}>
            {meetingPoints.length >= 2
              ? <LineChart data={meetingPoints} suffix="%" format={(n) => String(Math.round(n))} />
              : <p className="muted">{t('analytics.needMeetings')}</p>}
          </Panel>
        </div>

        <div className="analytics__cols">
          <Panel title={t('analytics.finesWelfare')} note={t('analytics.keptNote')}>
            <dl className="analytics__facts">
              <div><dt>{t('fines.collected')}</dt><dd className="money">{money(d.fines.collected)}</dd></div>
              <div><dt>{t('dashboard.finesOutstanding')}</dt><dd className="money money--neg">{money(d.fines.outstanding)}</dd></div>
              <div><dt>{t('analytics.welfareIn')}</dt><dd className="money">{money(d.welfare.contributions)}</dd></div>
              <div><dt>{t('analytics.welfareOut')}</dt><dd className="money">{money(d.welfare.payouts)}</dd></div>
              <div className="is-strong"><dt>{t('dashboard.welfareBalance')}</dt><dd className="money">{money(d.welfare.balance)}</dd></div>
            </dl>
            {d.welfare.by_category.length > 0 && (
              <HBars items={d.welfare.by_category.map((c) => ({ label: t(`welfare.${c.category}`), value: c.total, text: money(c.total, { compact: true }), tone: 'maize' }))} />
            )}
          </Panel>

          <Panel title={t('analytics.welfareFlow')}>
            <BarChart data={months} series={[{ key: 'welfare_in', label: t('analytics.welfareIn') }, { key: 'welfare_out', label: t('analytics.welfareOut') }]} height={170} />
          </Panel>
        </div>

        {p && (
          <Panel title={t('analytics.ifEnded')} note={t('shareout.rulesBox')}>
            <dl className="analytics__facts">
              <div><dt>{t('shareout.savedByMembers')}</dt><dd className="money">{money(p.total_savings)}</dd></div>
              <div><dt>{t('shareout.interestReturned')}</dt><dd className="money">{money(p.interest_returned)}</dd></div>
              <div><dt>{t('shareout.deductionsTotal')}</dt><dd className="money money--neg">-{money(p.deductions)}</dd></div>
              <div className="is-strong"><dt>{t('shareout.totalPayout')}</dt><dd className="money">{money(p.total_payout)}</dd></div>
              <div className="is-kept"><dt>{t('shareout.finesKept')}</dt><dd className="money">{money(p.fines_kept)}</dd></div>
              <div className="is-kept"><dt>{t('shareout.welfareKept')}</dt><dd className="money">{money(p.welfare_kept)}</dd></div>
              <div className="is-kept"><dt>{t('shareout.wrappersKept')}</dt><dd className="money">{money(p.wrappers_kept)}</dd></div>
            </dl>
          </Panel>
        )}
      </div>
  );
}

export default function Analytics() {
  const { t } = useLang();
  const [tab, setTab] = useState(() =>
    new URLSearchParams(window.location.search).get('tab') === 'reports' ? 'reports' : 'analytics');

  return (
    <div className="analytics">
      <PageHeader
        title={t('nav.analyticsReports')}
        subtitle={tab === 'reports' ? t('reports.subtitle') : undefined}
        action={
          <button type="button" className="btn btn--gold no-print" onClick={() => window.print()}>
            {t('loans.print')}
          </button>
        }
      />

      <div className="analytics__tabs no-print" role="tablist" aria-label={t('nav.analyticsReports')}>
        <button type="button" role="tab" aria-selected={tab === 'analytics'}
          className={tab === 'analytics' ? 'analytics__tab is-on' : 'analytics__tab'}
          onClick={() => setTab('analytics')}>{t('analytics.title')}</button>
        <button type="button" role="tab" aria-selected={tab === 'reports'}
          className={tab === 'reports' ? 'analytics__tab is-on' : 'analytics__tab'}
          onClick={() => setTab('reports')}>{t('reports.title')}</button>
      </div>

      {tab === 'analytics' ? <AnalyticsView /> : <Reports embedded />}
    </div>
  );
}
