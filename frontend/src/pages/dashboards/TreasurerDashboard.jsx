import { Link } from 'react-router-dom';
import { useLang } from '../../context/LangContext.jsx';
import StatCard from '../../components/StatCard.jsx';
import { money, shortDate } from '../../utils/format.js';
import { useAuth } from '../../context/AuthContext.jsx';
import './TreasurerDashboard.css';

/** The treasurer watches the money: what came in, what went out, what is owed. */
export default function TreasurerDashboard({ data }) {
  const { t } = useLang();
  const { isRecorder } = useAuth();
  const m = data.money || {};
  const w = data.wrappers;

  return (
    <>
      <div className="page-grid">
        <StatCard label={t('dashboard.cashInBox')}     value={money(m.cash_in_box)}   tone="gold" big />
        <StatCard label={t('dashboard.totalSavings')}  value={money(m.total_savings)} tone="green" />
        <StatCard label={t('dashboard.loansOut')}      value={money(m.outstanding)}   tone="blue" />
        <StatCard label={t('dashboard.interestEarned')} value={money(m.interest_earned)} />
        <StatCard label={t('dashboard.welfareBalance')} value={money(m.welfare_balance)} />
        <StatCard
          label={t('dashboard.finesOutstanding')}
          value={money(m.fines_outstanding)}
          tone={m.fines_outstanding > 0 ? 'red' : 'plain'}
        />
        {w && (
          <StatCard
            label={t('dashboard.wrappersCollected')}
            value={money(w.collected_this_month)}
            hint={t('dashboard.wrappersOf', money(w.expected_this_month), w.behind_count)}
            tone={w.behind_count > 0 ? 'gold' : 'green'}
          />
        )}
      </div>

      {data.loans?.overdue > 0 && (
        <p className="notice notice--danger">
          {data.loans.overdue} {t('dashboard.overdueLoans').toLowerCase()}.{' '}
          <Link to="/app/loans">{t('common.view')}</Link>
        </p>
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
          <Link to="/app/loans" className="btn btn--ghost btn--small">{t('loans.title')}</Link>
        </div>

        <div className="tdash__col">
          <h2 className="dash__sectionTitle">{t('dashboard.recentSavings')}</h2>
          {data.recent_savings?.length ? (
            <ul className="tdash__list">
              {data.recent_savings.map((s) => (
                <li key={s.id}>
                  <span className="tdash__who">{s.full_name}</span>
                  <span className="tdash__meta">{shortDate(s.date)}</span>
                  <span className="tdash__amount money">{money(s.amount)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">{t('savings.empty')}</p>
          )}
          {isRecorder
            ? <Link to="/app/savings" className="btn btn--small">{t('savings.record')}</Link>
            : <Link to="/app/analytics" className="btn btn--small">{t('nav.analytics')}</Link>}
        </div>
      </section>
    </>
  );
}
