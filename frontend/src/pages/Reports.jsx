import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useLang } from '../context/LangContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Ledger from '../components/Ledger.jsx';
import Spinner from '../components/Spinner.jsx';
import EmptyState from '../components/EmptyState.jsx';
import StatCard from '../components/StatCard.jsx';
import { MultiLineChart, LineChart, BarChart } from '../components/Charts.jsx';
import { money, plainNumber, shortDate, monthLong } from '../utils/format.js';
import '../styles.css';

const STATUSES = ['absent', 'excused'];

const LOAN_TONE = { pending: 'maize', approved: 'sky', repaid: 'leaf', rejected: 'flame', defaulted: 'flame' };
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i);
const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: new Date(2000, i, 1).toLocaleDateString('en-GB', { month: 'long' }),
}));

// The report categories (chips) under the member picker.
const CATEGORIES = [
  { key: 'attendance', label: 'reportAttendance' },
  { key: 'overview', label: 'reportOverview' },
  { key: 'contributions', label: 'reportContributions' },
  { key: 'loans', label: 'reportLoans' },
  { key: 'fines', label: 'reportFines' },
  { key: 'members', label: 'reportMembers' },
];

const loanStatusKey = (status) => (status === 'repaid' ? 'repaidStatus' : status);

const dayBefore = (iso) =>
  new Date(new Date(`${iso}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10);

/** A register of who has been missing meetings, by meeting or by member. */
export default function Reports({ embedded = false, scope: scopeProp, onScopeChange } = {}) {
  const { t } = useLang();
  const toast = useToast();

  const [view, setView] = useState('list');
  const [status, setStatus] = useState('absent');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rows, setRows] = useState(null);

  // Whose report: the whole group, or one member.
  const [scopeState, setScopeState] = useState('group');
  const scope = scopeProp ?? scopeState;
  const setScope = onScopeChange ?? setScopeState;
  const [members, setMembers] = useState([]);
  const [memberId, setMemberId] = useState('');
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [category, setCategory] = useState('attendance');
  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [totals, setTotals] = useState(null);
  const [granularity, setGranularity] = useState('month');
  const [group, setGroup] = useState(null);

  const load = useCallback(async () => {
    const q = new URLSearchParams({ status });
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    const path = view === 'register' ? '/reports/absentee-register' : '/reports/absentees';
    setRows(await api.get(`${path}?${q.toString()}`));
  }, [view, status, from, to]);

  useEffect(() => { load().catch((e) => toast.error(e.message)); }, [load, toast]);
  useEffect(() => { api.get('/members').then(setMembers).catch(() => {}); }, []);
  useEffect(() => { api.get('/analytics').then(setTotals).catch(() => {}); }, []);

  const chartYear = year || CURRENT_YEAR;
  useEffect(() => {
    setGroup(null);
    const q = new URLSearchParams({ granularity, year: String(chartYear) });
    if (month) q.set('month', month);
    api.get(`/reports/group?${q.toString()}`).then(setGroup).catch(() => {});
  }, [granularity, chartYear, month]);

  const loadReport = useCallback(() => {
    if (!memberId) { setReport(null); setReportLoading(false); return; }
    const q = new URLSearchParams();
    const y = year || (month ? String(CURRENT_YEAR) : '');
    if (y) q.set('year', y);
    if (month) q.set('month', month);
    setReportLoading(true);
    api.get(`/reports/member/${memberId}?${q.toString()}`)
      .then(setReport)
      .catch((e) => { toast.error(e.message); setReport(null); })
      .finally(() => setReportLoading(false));
  }, [memberId, year, month, toast]);

  useEffect(() => { loadReport(); }, [loadReport]);

  const listColumns = [
    { key: 'full_name', label: t('common.name') },
    { key: 'membership_number', label: t('members.number'), hideOnPhone: true },
    { key: 'meeting_date', label: t('common.date'), render: (r) => shortDate(r.meeting_date) },
    { key: 'agenda', label: t('meetings.agenda'), hideOnPhone: true,
      render: (r) => r.agenda || <span className="muted">—</span> },
    { key: 'status', label: t('common.status'),
      render: (r) => <span className={`tag tag--${r.status === 'excused' ? 'blue' : 'red'}`}>{t(`meetings.${r.status}`)}</span> },
    { key: 'unpaid_fines_on_date', label: t('reports.unpaidFine'), align: 'right',
      render: (r) => (r.unpaid_fines_on_date > 0
        ? <span className="tag tag--gold">{r.unpaid_fines_on_date}</span>
        : <span className="muted">—</span>) },
  ];

  const registerColumns = [
    { key: 'full_name', label: t('common.name') },
    { key: 'membership_number', label: t('members.number'), hideOnPhone: true },
    { key: 'total_absences', label: t('reports.total'), align: 'right' },
    { key: 'absences_last_30', label: t('reports.last30'), align: 'right' },
    { key: 'last_absence_date', label: t('reports.last'),
      render: (r) => (r.last_absence_date ? shortDate(r.last_absence_date) : <span className="muted">—</span>) },
  ];

  const periodLabel = month
    ? monthLong(`${year || CURRENT_YEAR}-${String(month).padStart(2, '0')}`)
    : year ? String(year) : t('reports.reportAllTime');

  const memberHead = report && (
    <div className="reports__repHead">
      <div className="reports__repHeadText">
        <h2 className="panel__title">{t('reports.reportForM', report.member.full_name)}</h2>
        <p className="reports__repNote">{periodLabel}</p>
      </div>
      <dl className="reports__repMeta">
        <div><dt>{t('reports.reportNumber')}</dt><dd>{report.member.membership_number}</dd></div>
        <div><dt>{t('reports.reportVillage')}</dt><dd>{report.member.village || '—'}</dd></div>
        <div><dt>{t('reports.reportPhone')}</dt><dd>{report.member.phone || '—'}</dd></div>
        <div><dt>{t('reports.reportJoined')}</dt><dd>{shortDate(report.member.date_joined)}</dd></div>
      </dl>
    </div>
  );

  const membersTable = (
    <section className="panel reports__panel">
      <h2 className="panel__title">{t('reports.reportMembers')}</h2>
      <p className="reports__repNote">{t('reports.reportMembersNote')}</p>
      <div className="reports__tableWrap">
        <table className="reports__table">
          <thead>
            <tr>
              <th>{t('common.name')}</th>
              <th className="is-num">{t('reports.reportSaved')}</th>
              <th className="is-num">{t('reports.reportShares')}</th>
              <th className="is-num">{t('reports.reportFinesUnpaid')}</th>
              <th className="is-num">{t('dashboard.activeLoans')}</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td>{m.full_name}</td>
                <td className="is-num money">{money(m.total_savings)}</td>
                <td className="is-num">{plainNumber(m.total_shares)}</td>
                <td className="is-num money money--neg">{m.unpaid_fines > 0 ? money(m.unpaid_fines) : '—'}</td>
                <td className="is-num">{m.active_loans || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );

  const gb = group?.buckets || [];
  const periodNote = group ? `${shortDate(group.from)} – ${shortDate(dayBefore(group.to))}` : '';
  const finSeries = [
    { key: 'contributions', label: t('reports.serContributions'), tone: 'leaf' },
    { key: 'loans', label: t('reports.serLoans'), tone: 'sky' },
    { key: 'fines', label: t('reports.serFines'), tone: 'flame' },
    { key: 'welfare', label: t('reports.serWelfare'), tone: 'maize' },
    { key: 'savings', label: t('reports.serSavings'), tone: 'purple' },
    { key: 'repayments', label: t('reports.serRepayments'), tone: 'teal' },
  ];

  const memberFacts = report && (
    <section className="panel reports__panel">
      {memberHead}
      <dl className="reports__facts">
        <div><dt>{t('reports.reportSaved')}</dt><dd className="money">{money(report.totals.savings)}</dd></div>
        <div><dt>{t('reports.reportShares')}</dt><dd>{plainNumber(report.totals.shares)}</dd></div>
        <div><dt>{t('reports.reportWrappers')}</dt><dd className="money">{money(report.totals.contributions)}</dd></div>
        <div><dt>{t('reports.reportLoansGiven')}</dt><dd className="money">{money(report.totals.loans_given)}</dd></div>
        <div><dt>{t('reports.reportOwing')}</dt><dd className="money money--neg">{money(report.totals.loans_outstanding)}</dd></div>
        <div><dt>{t('reports.reportFinesUnpaid')}</dt><dd className="money money--neg">{money(report.totals.fines_unpaid)}</dd></div>
        <div className="is-strong"><dt>{t('reports.reportNet')}</dt><dd className="money">{money(report.totals.net)}</dd></div>
      </dl>
    </section>
  );

  const groupContributions = group && (
    <section className="panel reports__panel">
      <h2 className="panel__title">{t('reports.groupContribTitle')}</h2>
      <p className="reports__repNote">{t('reports.groupNote')} · {periodNote}</p>
      <LineChart tone="leaf" data={gb.map((b) => ({ label: b.label, value: b.contributions }))} />
      <div className="reports__tableWrap">
        <table className="reports__table">
          <thead><tr><th>{t('common.name')}</th><th className="is-num">{t('common.amount')}</th></tr></thead>
          <tbody>
            {group.contributionsByMember.map((r) => (
              <tr key={r.full_name}><td>{r.full_name}</td><td className="is-num money">{money(r.total)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );

  const groupLoans = group && (
    <section className="panel reports__panel">
      <h2 className="panel__title">{t('reports.groupLoansTitle')}</h2>
      <p className="reports__repNote">{t('reports.groupNote')} · {periodNote}</p>
      <LineChart tone="sky" data={gb.map((b) => ({ label: b.label, value: b.loans }))} />
      {group.loans.length ? (
        <div className="reports__tableWrap">
          <table className="reports__table">
            <thead>
              <tr>
                <th>{t('common.date')}</th>
                <th>{t('common.name')}</th>
                <th className="is-num">{t('common.amount')}</th>
                <th>{t('common.status')}</th>
                <th className="is-num">{t('loans.outstanding')}</th>
              </tr>
            </thead>
            <tbody>
              {group.loans.map((l) => {
                const tone = l.status === 'repaid' ? 'green'
                  : (l.status === 'rejected' || l.status === 'defaulted') ? 'red'
                  : l.status === 'approved' ? 'blue' : 'gold';
                return (
                  <tr key={l.id}>
                    <td>{shortDate(l.applied_at)}</td>
                    <td>{l.full_name}</td>
                    <td className="is-num money">{money(l.amount)}</td>
                    <td><span className={`tag tag--${tone}`}>{t(`loans.${loanStatusKey(l.status)}`)}</span></td>
                    <td className="is-num money money--neg">{l.outstanding > 0 ? money(l.outstanding) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <p className="muted">{t('reports.reportEmpty')}</p>}
    </section>
  );

  const groupFines = group && (
    <section className="panel reports__panel">
      <h2 className="panel__title">{t('reports.groupFinesTitle')}</h2>
      <p className="reports__repNote">{t('reports.groupNote')} · {periodNote}</p>
      <LineChart tone="flame" data={gb.map((b) => ({ label: b.label, value: b.fines }))} />
      {group.fines.length ? (
        <div className="reports__tableWrap">
          <table className="reports__table">
            <thead>
              <tr>
                <th>{t('common.date')}</th>
                <th>{t('common.name')}</th>
                <th className="is-num">{t('common.amount')}</th>
                <th>{t('common.status')}</th>
              </tr>
            </thead>
            <tbody>
              {group.fines.map((f) => (
                <tr key={f.id}>
                  <td>{shortDate(f.date)}</td>
                  <td>{f.full_name}</td>
                  <td className="is-num money">{money(f.amount)}</td>
                  <td>{f.paid
                    ? <span className="tag tag--green">{t('reports.reportPaid')}</span>
                    : <span className="tag tag--red">{t('reports.reportUnpaid')}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="muted">{t('reports.reportEmpty')}</p>}
    </section>
  );

  const attendanceSeen = group
    ? group.totals.present + group.totals.absences + group.totals.excused : 0;
  const attendanceRate = attendanceSeen > 0
    ? Math.round((group.totals.present / attendanceSeen) * 100) : null;

  const groupAttendancePanel = group && (
    <section className="panel reports__panel">
      <h2 className="panel__title">{t('reports.groupAttendanceTitle')}</h2>
      <p className="reports__repNote">{t('reports.groupNote')} · {periodNote}</p>
      <div className="page-grid page-grid--stat reports__totals">
        <StatCard label={t('reports.meetingsHeld')} value={plainNumber(group.totals.meetings)} tone="gold" icon="meetings" />
        <StatCard label={t('reports.totalAbsences')} value={plainNumber(group.totals.absences)} tone="red" icon="fines" />
        <StatCard label={t('reports.attendanceRate')} value={attendanceRate === null ? '—' : `${attendanceRate}%`} tone="green" icon="analytics" />
      </div>
      <BarChart
        data={gb.map((b) => ({ label: b.label, present: b.present, absences: b.absences }))}
        series={[
          { key: 'present', label: t('reports.serPresent') },
          { key: 'absences', label: t('reports.serAbsences') },
        ]} />
    </section>
  );

  const groupMembersPanel = group && (
    <>
      <section className="panel reports__panel">
        <h2 className="panel__title">{t('reports.groupMembersTitle')}</h2>
        <p className="reports__repNote">{t('reports.groupNote')} · {periodNote}</p>
        <div className="page-grid page-grid--stat reports__totals">
          <StatCard label={t('reports.memberTotal')} value={plainNumber(members.length)} tone="green" icon="members" />
          <StatCard label={t('reports.memberNew')} value={plainNumber(group.totals.new_members)} tone="blue" icon="members" />
        </div>
        <LineChart tone="leaf" data={gb.map((b) => ({ label: b.label, value: b.new_members }))} />
      </section>
      {membersTable}
    </>
  );

  const renderMemberReport = () => {
    if (category === 'members') return scope === 'group' ? groupMembersPanel : membersTable;

    const isMember = scope === 'member';

    if (category === 'overview') {
      if (isMember) {
        if (!memberId) return <p className="notice">{t('reports.reportHint')}</p>;
        if (reportLoading) return <Spinner />;
        return memberFacts;
      }
      return (
        <section className="panel reports__panel">
          <h2 className="panel__title">{t('reports.finTitle', t(`reports.gran_${granularity}`))}</h2>
          <p className="reports__repNote">{t('reports.finNote')}{periodNote ? ` · ${periodNote}` : ''}</p>
          {group ? <MultiLineChart data={gb} series={finSeries} /> : <Spinner />}
        </section>
      );
    }

    if (!isMember) {
      if (!group) return <Spinner />;
      if (category === 'contributions') return groupContributions;
      if (category === 'loans') return groupLoans;
      if (category === 'fines') return groupFines;
      return null;
    }

    if (!memberId) return <p className="notice">{t('reports.reportHint')}</p>;
    if (reportLoading) return <Spinner />;
    if (!report) return <p className="notice">{t('reports.reportHint')}</p>;

    if (category === 'contributions') {
      return (
        <section className="panel reports__panel">
          {memberHead}
          {report.contributions.length ? (
            <div className="reports__tableWrap">
              <table className="reports__table">
                <thead>
                  <tr>
                    <th>{t('reports.reportMonth')}</th>
                    <th>{t('common.date')}</th>
                    <th className="is-num">{t('common.amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.contributions.map((r) => (
                    <tr key={r.id}>
                      <td>{monthLong(r.period)}</td>
                      <td>{shortDate(r.paid_on)}</td>
                      <td className="is-num money">{money(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="muted">{t('reports.reportEmpty')}</p>}
        </section>
      );
    }

    if (category === 'loans') {
      return (
        <section className="panel reports__panel">
          {memberHead}
          {report.loans.length ? (
            <div className="reports__tableWrap">
              <table className="reports__table">
                <thead>
                  <tr>
                    <th>{t('common.date')}</th>
                    <th className="is-num">{t('common.amount')}</th>
                    <th>{t('common.status')}</th>
                    <th>{t('loans.dueDate')}</th>
                    <th className="is-num">{t('loans.outstanding')}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.loans.map((l) => {
                    const tone = l.status === 'repaid' ? 'green'
                      : (l.status === 'rejected' || l.status === 'defaulted') ? 'red'
                      : l.status === 'approved' ? 'blue' : 'gold';
                    return (
                      <tr key={l.id}>
                        <td>{shortDate(l.applied_at)}</td>
                        <td className="is-num money">{money(l.amount)}</td>
                        <td><span className={`tag tag--${tone}`}>{t(`loans.${loanStatusKey(l.status)}`)}</span></td>
                        <td>{l.due_date ? shortDate(l.due_date) : '—'}</td>
                        <td className="is-num money money--neg">{l.outstanding > 0 ? money(l.outstanding) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <p className="muted">{t('reports.reportEmpty')}</p>}
        </section>
      );
    }

    // fines
    return (
      <section className="panel reports__panel">
        {memberHead}
        {report.fines.length ? (
          <div className="reports__tableWrap">
            <table className="reports__table">
              <thead>
                <tr>
                  <th>{t('common.date')}</th>
                  <th>{t('common.reason')}</th>
                  <th className="is-num">{t('common.amount')}</th>
                  <th>{t('common.status')}</th>
                </tr>
              </thead>
              <tbody>
                {report.fines.map((f) => (
                  <tr key={f.id}>
                    <td>{shortDate(f.date)}</td>
                    <td>{f.reason || <span className="muted">—</span>}</td>
                    <td className="is-num money">{money(f.amount)}</td>
                    <td>{f.paid
                      ? <span className="tag tag--green">{t('reports.reportPaid')}</span>
                      : <span className="tag tag--red">{t('reports.reportUnpaid')}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="muted">{t('reports.reportEmpty')}</p>}
      </section>
    );
  };

  return (
    <div className="reports">
      {!embedded && (
        <PageHeader
          title={t('reports.title')}
          subtitle={t('reports.subtitle')}
          action={
            <button type="button" className="btn btn--gold no-print" onClick={() => window.print()}>
              {t('reports.print')}
            </button>
          }
        />
      )}
      <div className="reports__rep no-print">
        <div className="reports__controls">
          {scope === 'member' && (
            <label className="reports__field reports__field--member">
              <span className="field-label">{t('reports.reportMember')}</span>
              <select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
                <option value="">{t('reports.reportChoose')}</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
              </select>
            </label>
          )}

          <label className="reports__field reports__field--year">
            <span className="field-label">{t('reports.reportYear')}</span>
            <select value={year} onChange={(e) => setYear(e.target.value)}>
              <option value="">{t('reports.reportAllYears')}</option>
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>

          <label className="reports__field reports__field--month">
            <span className="field-label">{t('reports.reportMonth')}</span>
            <select value={month} onChange={(e) => setMonth(e.target.value)}>
              <option value="">{t('reports.reportAllMonths')}</option>
              {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </label>

          {scope === 'group' && (
            <label className="reports__field reports__field--period">
              <span className="field-label">{t('reports.groupBy')}</span>
              <div className="reports__seg" role="group" aria-label={t('reports.groupBy')}>
                {['week', 'month', 'year'].map((g) => (
                  <button key={g} type="button"
                    className={granularity === g ? 'reports__segBtn is-on' : 'reports__segBtn'}
                    onClick={() => setGranularity(g)}>
                    {t(`reports.gran_${g}`)}
                  </button>
                ))}
              </div>
            </label>
          )}

          {scope === 'member' && (
            <button type="button" className="btn btn--gold btn--small reports__filterBtn" onClick={loadReport}>
              {t('reports.reportFilter')}
            </button>
          )}
          <button type="button" className="btn btn--danger btn--small reports__exportBtn" onClick={() => window.print()}>
            {t('reports.reportExport')}
          </button>
        </div>

        <div className="reports__chips" role="tablist">
          {CATEGORIES.map((c) => (
            <button key={c.key} type="button" role="tab" aria-selected={category === c.key}
              className={category === c.key ? 'reports__chip is-on' : 'reports__chip'}
              onClick={() => setCategory(c.key)}>
              {t(`reports.${c.label}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="print-area">
        {totals && scope === 'group' && (
          <div className="page-grid page-grid--stat reports__totals">
            <StatCard label={t('reports.totalContribution')} value={money(totals.wrappers.cycle_total)} tone="gold" icon="wrappers" />
            <StatCard label={t('reports.totalLoans')} value={money(totals.loans.lent_principal)} tone="blue" icon="loans" />
            <StatCard label={t('reports.totalFines')} value={money(totals.fines.collected + totals.fines.outstanding)} tone="red" icon="fines" />
            <StatCard label={t('reports.totalWelfare')} value={money(totals.welfare.balance)} tone="green" icon="welfare" />
          </div>
        )}

        {category === 'attendance' ? (
          <>
            {scope === 'group' && groupAttendancePanel}

            <div className="reports__tabs no-print" role="tablist">
              {['list', 'register'].map((k) => (
                <button key={k} type="button" role="tab" aria-selected={view === k}
                  className={view === k ? 'reports__tab is-on' : 'reports__tab'} onClick={() => setView(k)}>
                  {t(`reports.tab_${k}`)}
                </button>
              ))}
            </div>

            <div className="toolbar no-print">
              <div className="reports__status" role="group" aria-label={t('common.status')}>
                {STATUSES.map((s) => (
                  <button key={s} type="button"
                    className={status === s ? 'reports__filter is-on' : 'reports__filter'}
                    onClick={() => setStatus(s)}>
                    {t(`meetings.${s}`)}
                  </button>
                ))}
              </div>

              <label className="reports__date">
                <span className="field-label" htmlFor="rp-from">{t('reports.from')}</span>
                <input id="rp-from" type="date" value={from} max={to || undefined}
                  onChange={(e) => setFrom(e.target.value)} />
              </label>
              <label className="reports__date">
                <span className="field-label" htmlFor="rp-to">{t('reports.to')}</span>
                <input id="rp-to" type="date" value={to} min={from || undefined}
                  onChange={(e) => setTo(e.target.value)} />
              </label>

              {(from || to) && (
                <button type="button" className="btn btn--ghost btn--small"
                  onClick={() => { setFrom(''); setTo(''); }}>
                  {t('reports.clear')}
                </button>
              )}
            </div>

            <p className="notice">{t('reports.note')}</p>

            {rows === null ? <Spinner /> : (
              <Ledger
                columns={view === 'register' ? registerColumns : listColumns}
                rows={rows}
                keyField={view === 'register' ? 'member_id' : 'id'}
                empty={<EmptyState title={view === 'register' ? t('reports.emptyRegister') : t('reports.empty')} />}
              />
            )}
          </>
        ) : (
          <div className="reports__member">{renderMemberReport()}</div>
        )}
      </div>
    </div>
  );
}
