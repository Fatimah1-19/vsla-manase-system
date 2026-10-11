import { Link } from 'react-router-dom';
import { useLang } from '../../context/LangContext.jsx';
import StatCard from '../../components/StatCard.jsx';
import Icon from '../../components/Icon.jsx';
import GroupedList from '../../components/GroupedList.jsx';
import { LineChart, HBars, Ring } from '../../components/Charts.jsx';
import { money, shortDate } from '../../utils/format.js';
import './MemberDashboard.css';

const shortMonth = (ym) => new Date(`${ym}-01`).toLocaleDateString(undefined, { month: 'short' });

/** What one woman needs to know: what she saved, what she owes, what is coming. */
export default function MemberDashboard({ data }) {
  const { t } = useLang();
  const { savings, active_loan: loan, unpaid_fines: fines, my_share: share, next_meeting: meeting } = data;
  const box = data.money || {};
  const contrib = data.recent_contributions || [];
  const limit = data.loan_limit;
  const wr = data.wrappers;
  const trend = data.savings_trend || [];
  const entries = data.recent_savings || [];
  const hasTrend = trend.some((d) => d.amount > 0);

  const shares = Number(savings?.shares || 0);
  const shareValue = data.cycle ? Number(data.cycle.share_value) : 0;
  const worth = +(shares * shareValue).toFixed(2);
  const repaidPct = loan && loan.total_due > 0
    ? Math.round((loan.total_repaid / loan.total_due) * 100)
    : 0;

  const where = [
    { label: t('dashboard.mySavings'), value: Number(savings?.total || 0), text: money(savings?.total), tone: 'leaf' },
    { label: t('loans.outstanding'), value: loan?.outstanding || 0, text: money(loan?.outstanding || 0), tone: 'sky' },
    { label: t('dashboard.unpaidFines'), value: Number(fines || 0), text: money(fines), tone: 'flame' },
    { label: t('wrappers.title'), value: wr?.owed || 0, text: money(wr?.owed || 0), tone: 'maize' },
  ];

  return (
    <>
      {share && share.status === 'distributed' && (
        <section className="mdash__share">
          <p className="mdash__shareLabel">{t('dashboard.shareReady')}</p>
          <p className="mdash__shareAmount money">{money(share.share_amount)}</p>
          <Link to="/app/shareout" className="btn btn--gold btn--small">{t('common.view')}</Link>
        </section>
      )}

      <div className="page-grid page-grid--stat">
        <StatCard
          label={t('dashboard.mySavings')}
          value={money(savings?.total)}
          hint={`${savings?.shares || 0} ${t('savings.shares').toLowerCase()}`}
          tone="gold"
          icon="savings"
          big
        />
        {limit && (
          <StatCard
            label={t('dashboard.canBorrow')}
            value={money(limit.max_loan)}
            hint={t('dashboard.canBorrowHint', limit.multiplier)}
            tone="green"
            icon="loans"
          />
        )}
        {wr && (
          <StatCard
            label={t('dashboard.wrappersMonth', money(wr.monthly))}
            value={wr.owed > 0 ? money(wr.owed) : t('wrappers.paidUp')}
            hint={wr.owed > 0 ? t('wrappers.stillOwed') : undefined}
            tone={wr.owed > 0 ? 'red' : 'plain'}
            icon="wrappers"
          />
        )}
        <StatCard
          label={t('dashboard.unpaidFines')}
          value={money(fines)}
          tone={fines > 0 ? 'red' : 'plain'}
          icon="fines"
        />
      </div>

      {data.money && (
        <section className="dash__card">
          <h2 className="dash__sectionTitle">{t('dashboard.moneyInBox')}</h2>
          <dl className="mdash__holdRows">
            <div>
              <dt>{t('dashboard.totalSavings')}</dt>
              <dd className="money">{money(box.total_savings)}</dd>
            </div>
            <div>
              <dt>{t('dashboard.interestEarned')}</dt>
              <dd className="money">{money(box.interest_earned)}</dd>
            </div>
            <div>
              <dt>{t('dashboard.loansOut')}</dt>
              <dd className="money">{money(box.outstanding)}</dd>
            </div>
            <div className="is-strong">
              <dt>{t('dashboard.amountInBank')}</dt>
              <dd className="money">{money(box.cash_in_box)}</dd>
            </div>
          </dl>
        </section>
      )}

      <div className="dash__cols dash__cols--2">
        <section className="mdash__holdings">
          <h2 className="mdash__cardTitle">
            <span className="mdash__cardIcon" aria-hidden="true"><Icon name="shareout" size={18} /></span>
            {t('profile.shareholdingTitle')}
          </h2>

          <div className="mdash__holdHero">
            <span className="mdash__holdShares money">{shares}</span>
            <span className="mdash__holdSharesLabel">{t('savings.shares').toLowerCase()}</span>
          </div>

          <dl className="mdash__holdRows">
            <div><dt>{t('profile.shareValue')}</dt><dd className="money">{money(shareValue)}</dd></div>
            <div><dt>{t('profile.totalSavings')}</dt><dd className="money">{money(savings?.total)}</dd></div>
            <div className="is-strong">
              <dt>{t('profile.estPayout')}</dt>
              <dd className="money">{money(worth)}</dd>
            </div>
          </dl>
        </section>

        <section className="dash__card">
          <h2 className="dash__sectionTitle">{t('dashboard.analytics')}</h2>
          <p className="mdash__subTitle">{t('dashboard.savingsTrend')}</p>
          {hasTrend
            ? <LineChart
                data={trend.map((d) => ({ label: shortMonth(d.month), value: d.amount }))}
                format={(v) => money(v, { compact: true })}
              />
            : <p className="muted">{t('dashboard.noSavingsYet')}</p>}
        </section>
      </div>

      <div className="dash__cols dash__cols--2">
        <section className="dash__card">
          <h2 className="dash__sectionTitle">{t('dashboard.whereMoney')}</h2>
          <HBars items={where} />
          {loan && (
            <div className="mdash__ringWrap">
              <Ring value={Math.min(100, repaidPct)} label={t('dashboard.repaymentProgress')} tone="auto" />
            </div>
          )}
        </section>

        {entries.length > 0 && (
          <section className="dash__card">
            <h2 className="dash__sectionTitle">{t('dashboard.recentEntries')}</h2>
            <GroupedList
              items={entries}
              nameKey={null}
              renderItem={(e) => (
                <>
                  <span className="dash__who">
                    {e.shares > 0 && <span className="dash__tag">{e.shares} {t('savings.shares').toLowerCase()}</span>}
                    {e.note && <span className="muted">{e.note}</span>}
                  </span>
                  <span className="dash__amount money">{money(e.amount)}</span>
                </>
              )}
            />
          </section>
        )}
      </div>

      {contrib.length > 0 && (
        <section className="dash__card">
          <h2 className="dash__sectionTitle">{t('dashboard.recentContributions')}</h2>
          <GroupedList
            items={contrib}
            renderItem={(c) => (
              <>
                <span className="dash__who">{c.full_name}</span>
                <span className="dash__amount money">{money(c.amount)}</span>
              </>
            )}
          />
        </section>
      )}

      <section className="mdash__loan">
        <h2 className="dash__sectionTitle">{t('dashboard.myLoan')}</h2>
        {loan ? (
          <div className="mdash__loanCard">
            <div className="mdash__loanTop">
              <span className={`tag tag--${loan.status === 'pending' ? 'gold' : 'green'}`}>
                {t(`loans.${loan.status === 'pending' ? 'pending' : 'approved'}`)}
              </span>
              {!loan.with_interest && <span className="tag tag--blue">{t('loans.noInterest')}</span>}
            </div>

            <dl className="mdash__loanRows">
              <div><dt>{t('loans.principal')}</dt><dd className="money">{money(loan.amount)}</dd></div>
              <div><dt>{t('loans.interest')}</dt><dd className="money">{money(loan.interest_amount)}</dd></div>
              <div><dt>{t('loans.totalDue')}</dt><dd className="money">{money(loan.total_due)}</dd></div>
              <div className="is-strong">
                <dt>{t('dashboard.outstanding')}</dt>
                <dd className="money">{money(loan.outstanding)}</dd>
              </div>
              <div><dt>{t('dashboard.dueBy')}</dt><dd>{shortDate(loan.due_date)}</dd></div>
            </dl>

            <Link to="/app/loans" className="btn btn--sky btn--small btn--full">{t('common.view')}</Link>
          </div>
        ) : (
          <div className="mdash__noLoan">
            <p>{t('dashboard.noLoan')}</p>
            <Link to="/app/loans" className="btn btn--small">{t('loans.request')}</Link>
          </div>
        )}
      </section>

      <section className="mdash__meeting">
        <h2 className="dash__sectionTitle">{t('dashboard.nextMeeting')}</h2>
        {meeting ? (
          <p className="mdash__meetingLine">
            <strong>{shortDate(meeting.meeting_date)}</strong>
            {meeting.meeting_time ? ` — ${meeting.meeting_time}` : ''}
            {meeting.location ? <span className="muted"> · {meeting.location}</span> : null}
          </p>
        ) : (
          <p className="muted">{t('dashboard.noMeeting')}</p>
        )}
      </section>
    </>
  );
}