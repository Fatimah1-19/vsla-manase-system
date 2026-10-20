import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useLang } from '../context/LangContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import BackButton from '../components/BackButton.jsx';
import Ledger from '../components/Ledger.jsx';
import StatusTag from '../components/StatusTag.jsx';
import Modal from '../components/Modal.jsx';
import Spinner from '../components/Spinner.jsx';
import EmptyState from '../components/EmptyState.jsx';
import MemberAvatar from '../components/MemberAvatar.jsx';
import StatCard from '../components/StatCard.jsx';
import { money, shortDate, monthLong, plainNumber } from '../utils/format.js';
import '../styles.css';

const DAY = 24 * 60 * 60 * 1000;

/** Whole days a loan is past its due date (0 if it is not). */
function daysOverdue(loan) {
  if (!loan.due_date) return 0;
  const diff = Math.floor((Date.now() - new Date(loan.due_date).getTime()) / DAY);
  return diff > 0 ? diff : 0;
}

/** The standing of a loan: fully paid, overdue, due soon, or running. */
function standing(loan) {
  if (loan.status === 'repaid' || loan.outstanding <= 0) return 'fullyPaid';
  if (loan.status === 'approved') {
    const days = daysOverdue(loan);
    if (days > 0) return 'overdue';
    if (loan.due_date && new Date(loan.due_date).getTime() - Date.now() <= 7 * DAY) return 'dueSoon';
    return 'active';
  }
  return 'active';
}

const blankApply = { member_id: '', amount: '', with_interest: true, purpose: '' };

/**
 * A flat list of repayments (newest first) becomes Cycle/Year -> Month -> Date
 * groups. A repayment inside a saving cycle is filed under that cycle; one
 * without a cycle falls back to its calendar year. Totals are summed per group.
 */
function groupRepayments(rows) {
  const groups = new Map();
  for (const r of rows) {
    const year = String(r.date).slice(0, 4);
    const gKey = r.cycle_id ? `c${r.cycle_id}` : `y${year}`;
    let g = groups.get(gKey);
    if (!g) {
      g = {
        key: gKey,
        label: r.cycle_id ? (r.cycle_name || year) : year,
        dates: r.cycle_id && r.cycle_start && r.cycle_end
          ? `${shortDate(r.cycle_start)} – ${shortDate(r.cycle_end)}`
          : '',
        total: 0,
        months: new Map(),
      };
      groups.set(gKey, g);
    }
    g.total += Number(r.amount || 0);
    const mKey = String(r.date).slice(0, 7);
    if (!g.months.has(mKey)) g.months.set(mKey, { key: mKey, label: monthLong(mKey), total: 0, days: new Map() });
    const month = g.months.get(mKey);
    month.total += Number(r.amount || 0);
    const dKey = String(r.date).slice(0, 10);
    if (!month.days.has(dKey)) month.days.set(dKey, { key: dKey, label: shortDate(dKey), items: [] });
    month.days.get(dKey).items.push(r);
  }
  return [...groups.values()];
}

export default function Loans() {
  const { t } = useLang();
  const { user, isCommittee, canRecordMoney, isDecider } = useAuth();
  const toast = useToast();
  const location = useLocation();

  const [loans, setLoans] = useState(null);
  const [members, setMembers] = useState([]);
  const [filter, setFilter] = useState('all');
  const [applyOpen, setApplyOpen] = useState(false);
  const [form, setForm] = useState(blankApply);
  const [busy, setBusy] = useState(false);

  const [detail, setDetail] = useState(null);       // { loan, repayments }
  const [decisionNote, setDecisionNote] = useState('');
  const [repayAmount, setRepayAmount] = useState('');

  // The repayment-history view: search a member, see their payments grouped.
  const [rpSearch, setRpSearch] = useState('');
  const [rpMember, setRpMember] = useState('');
  const [rpLoanId, setRpLoanId] = useState('');
  const [rpData, setRpData] = useState(null);
  const [rpLoading, setRpLoading] = useState(false);

  // The record-repayment panel: find a member, pick their running loan, save it.
  const [recOpen, setRecOpen] = useState(false);
  const [recSearch, setRecSearch] = useState('');
  const [recMember, setRecMember] = useState(null);
  const [recLoanId, setRecLoanId] = useState('');
  const [recAmount, setRecAmount] = useState('');
  const [recDate, setRecDate] = useState('');

  // A search over the loan list, so one member's history can be found quickly.
  const [listSearch, setListSearch] = useState('');

  // Lending the group's money is the chairperson's decision. The treasurer
  // records the loan once it has been authorised; she never approves it herself.
  const canDecide = isDecider;
  const canRecordRepayment = canRecordMoney;

  // How much she may borrow: her savings times the group's multiplier.
  const [limit, setLimit] = useState(null);
  useEffect(() => {
    if (!applyOpen) return;
    if (isCommittee && !form.member_id) { setLimit(null); return; }
    const q = isCommittee ? `?member_id=${form.member_id}` : '';
    api.get(`/loans/limit${q}`).then(setLimit).catch(() => setLimit(null));
  }, [applyOpen, isCommittee, form.member_id]);

  const load = useCallback(async () => {
    const list = await api.get('/loans');
    setLoans(list);
    if (isCommittee) {
      try { setMembers(await api.get('/members')); } catch { /* not fatal */ }
    }
  }, [isCommittee]);

  useEffect(() => { load().catch((e) => toast.error(e.message)); }, [load, toast]);

  // Her menu opens the loans on a particular list: ?tab=repayments shows the
  // repayment history, ?filter=... picks a status, ?action=record opens the
  // record-repayment panel. The chairperson links here too.
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (q.get('tab') === 'repayments') openRepayments();
    else if (q.get('filter')) setFilter(q.get('filter'));
    if (q.get('action') === 'record') openRecord();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  const change = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  async function apply(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const body = {
        amount: Number(form.amount),
        with_interest: form.with_interest,
        purpose: form.purpose || null,
      };
      if (isCommittee && form.member_id) body.member_id = Number(form.member_id);
      const res = await api.post('/loans', body);
      toast.success(res.message);
      setApplyOpen(false);
      setForm(blankApply);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function openDetail(row) {
    try {
      setDetail(await api.get(`/loans/${row.id}`));
      setDecisionNote('');
      setRepayAmount('');
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function decide(status) {
    if (!detail) return;
    if (status === 'rejected' && !decisionNote.trim()) {
      toast.error(t('loans.reasonNeeded'));
      return;
    }
    setBusy(true);
    try {
      const res = await api.patch(`/loans/${detail.loan.id}/decision`, { status, note: decisionNote || null });
      toast.success(res.message);
      setDetail(null);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function recordRepayment(e) {
    e.preventDefault();
    if (!repayAmount) return;
    setBusy(true);
    try {
      const res = await api.post(`/loans/${detail.loan.id}/repayments`, { amount: Number(repayAmount) });
      toast.success(res.message);
      setRepayAmount('');
      setDetail(await api.get(`/loans/${detail.loan.id}`));
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function sendReminders() {
    setBusy(true);
    try {
      const res = await api.post('/loans/remind', { within_days: 7 });
      toast.success(res.message);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function loadRepayments(memberId, loanId) {
    setRpLoading(true);
    try {
      const qs = new URLSearchParams();
      if (memberId) qs.set('member_id', memberId);
      if (loanId) qs.set('loan_id', loanId);
      const q = qs.toString() ? `?${qs.toString()}` : '';
      setRpData(await api.get(`/loans/repayments${q}`));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRpLoading(false);
    }
  }

  function openRepayments() {
    const own = isCommittee ? '' : (user.member_id || '');
    setRpSearch('');
    setRpMember(own ? String(own) : '');
    setRpLoanId('');
    setFilter('repayments');
    setRpData(null);
    loadRepayments(own, '');
  }

  function showEveryone() {
    setRpSearch('');
    setRpMember('');
    setRpLoanId('');
    loadRepayments('', '');
  }

  function pickMember(m) {
    setRpSearch(m.full_name);
    setRpMember(String(m.id));
    setRpLoanId('');
    loadRepayments(m.id, '');
  }

  // Narrow the repayment history to one loan, so a single loan's payments can
  // be read on their own.
  function pickRepayLoan(loanId) {
    setRpLoanId(loanId);
    loadRepayments(rpMember, loanId);
  }

  function openRecord() {
    setRecSearch('');
    setRecMember(null);
    setRecLoanId('');
    setRecAmount('');
    setRecDate('');
    setRecOpen(true);
  }

  function pickRecMember(m) {
    setRecMember(m);
    setRecSearch(m.full_name);
    const open = loans.filter((l) => l.member_id === m.id && l.status === 'approved');
    setRecLoanId(open.length === 1 ? String(open[0].id) : '');
    setRecAmount('');
  }

  async function recordFromPanel(e) {
    e.preventDefault();
    const loan = loans.find((l) => String(l.id) === recLoanId && l.status === 'approved');
    if (!loan) { toast.error(t('loans.pickLoan')); return; }
    setBusy(true);
    try {
      const res = await api.post(`/loans/${loan.id}/repayments`, {
        amount: Number(recAmount),
        date: recDate || null,
      });
      toast.success(res.message);
      setRecSearch('');
      setRecMember(null);
      setRecLoanId('');
      setRecAmount('');
      setRecDate('');
      await load();
      if (filter === 'repayments') loadRepayments(rpMember, rpLoanId);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!loans) return <Spinner />;

  const listQuery = listSearch.trim().toLowerCase();
  // The overdue board lists every loan that is still running or late, worst
  // first, so the treasurer reads what needs chasing at the top.
  const running = loans.filter((l) => l.status === 'approved' || (l.status === 'repaid' && l.outstanding > 0));
  const overdueRows = running.filter((l) => standing(l) === 'overdue');
  const overdueCount = overdueRows.length;
  const overdueOwed = overdueRows.reduce((sum, l) => sum + (Number(l.outstanding) || 0), 0);
  const shown = (filter === 'all' ? loans
    : filter === 'overdue' ? [...running].sort((a, b) => daysOverdue(b) - daysOverdue(a))
    : loans.filter((l) => l.status === filter))
    .filter((l) => !listQuery || l.full_name.toLowerCase().includes(listQuery));
  const myOpenLoan = loans.some((l) => ['pending', 'approved'].includes(l.status));

  const rpGroups = rpData ? groupRepayments(rpData.repayments) : [];
  const rpQuery = rpSearch.trim().toLowerCase();
  const rpMatches = rpQuery
    ? members.filter((m) => m.full_name.toLowerCase().includes(rpQuery)
        || String(m.membership_number || '').includes(rpQuery)).slice(0, 8)
    : [];
  // When one member is picked, her loans become the filter for the history.
  const rpLoanOptions = rpMember ? loans.filter((l) => String(l.member_id) === String(rpMember)) : [];

  const recQuery = recSearch.trim().toLowerCase();
  const recMatches = (recQuery && !recMember)
    ? members.filter((m) => m.full_name.toLowerCase().includes(recQuery)
        || String(m.membership_number || '').includes(recQuery)).slice(0, 8)
    : [];
  const recLoans = recMember ? loans.filter((l) => l.member_id === recMember.id && l.status === 'approved') : [];
  const recLoan = recLoans.find((l) => String(l.id) === recLoanId) || null;

  const columns = [
    { key: 'full_name', label: t('loans.borrower'),
      render: (l) => (
        <span className="vcell">
          <MemberAvatar memberId={l.member_id} hasAvatar={l.has_avatar} name={l.full_name} size={32} />
          <span className="vcell__name">{l.full_name}</span>
        </span>
      ) },
    { key: 'amount', label: t('loans.principal'), align: 'right', money: true, render: (l) => money(l.amount) },
    { key: 'interest', label: t('loans.interest'), align: 'right', money: true, hideOnPhone: true,
      render: (l) => (l.with_interest ? money(l.interest_amount) : <span className="muted">—</span>) },
    { key: 'total_due', label: t('loans.totalDue'), align: 'right', money: true, hideOnPhone: true,
      render: (l) => money(l.total_due) },
    { key: 'total_repaid', label: t('loans.repaid'), align: 'right', money: true, hideOnPhone: true,
      render: (l) => money(l.total_repaid) },
    { key: 'outstanding', label: t('loans.outstanding'), align: 'right', money: true,
      render: (l) => <span className={l.outstanding > 0 ? 'money money--neg' : 'money'}>{money(l.outstanding)}</span> },
    { key: 'applied_at', label: t('loans.loanDate'), hideOnPhone: true,
      render: (l) => shortDate(l.applied_at) },
    { key: 'due_date', label: t('loans.dueDate'), hideOnPhone: true,
      render: (l) => {
        const late = l.status === 'approved' && l.due_date && new Date(l.due_date) < new Date();
        return <span className={late ? 'loans__late' : ''}>{shortDate(l.due_date)}</span>;
      } },
    { key: 'status', label: t('common.status'),
      render: (l) => <StatusTag status={l.status}>{t(`loans.${l.status === 'repaid' ? 'repaidStatus' : l.status}`)}</StatusTag> },
  ];

  // The overdue board: member, what was lent, what has come back, what is owed,
  // when it was due, how late it is, and how it stands.
  const STANDING_LABEL = {
    overdue: 'loans.standingOverdue',
    dueSoon: 'loans.standingDueSoon',
    active: 'loans.standingActive',
    fullyPaid: 'loans.standingFullyPaid',
  };
  const overdueColumns = [
    { key: 'full_name', label: t('loans.borrower'),
      render: (l) => (
        <span className="vcell">
          <MemberAvatar memberId={l.member_id} hasAvatar={l.has_avatar} name={l.full_name} size={32} />
          <span className="vcell__name">{l.full_name}</span>
        </span>
      ) },
    { key: 'amount', label: t('loans.principal'), align: 'right', money: true, render: (l) => money(l.amount) },
    { key: 'total_repaid', label: t('loans.amountPaid'), align: 'right', money: true, hideOnPhone: true,
      render: (l) => money(l.total_repaid) },
    { key: 'outstanding', label: t('loans.outstanding'), align: 'right', money: true,
      render: (l) => <span className={l.outstanding > 0 ? 'money money--neg' : 'money'}>{money(l.outstanding)}</span> },
    { key: 'due_date', label: t('loans.dueDate'), hideOnPhone: true,
      render: (l) => <span className={standing(l) === 'overdue' ? 'loans__late' : ''}>{shortDate(l.due_date)}</span> },
    { key: 'days_overdue', label: t('loans.daysOverdue'), align: 'right', hideOnPhone: true,
      render: (l) => {
        const d = daysOverdue(l);
        return d > 0 ? <span className="loans__late">{plainNumber(d)}</span> : <span className="muted">—</span>;
      } },
    { key: 'standing', label: t('common.status'),
      render: (l) => {
        const s = standing(l);
        return <StatusTag status={s}>{t(STANDING_LABEL[s])}</StatusTag>;
      } },
  ];

  return (
    <div className="loans money-book">
      <PageHeader
        title={t('loans.title')}
        action={
          <>
            <BackButton />
            {canRecordRepayment && (
              <button type="button" className="btn btn--ghost" onClick={openRecord}>
                {t('loans.recordRepayments')}
              </button>
            )}
            {isCommittee && (
              <button type="button" className="btn btn--sky" onClick={sendReminders} disabled={busy}>
                {t('loans.remind')}
              </button>
            )}
            {(isCommittee || !myOpenLoan) && (
              <button type="button" className="btn" onClick={() => setApplyOpen(true)}>
                {isCommittee ? t('loans.apply') : t('loans.request')}
              </button>
            )}
          </>
        }
      />

      <div className="loans__filters" role="group" aria-label={t('common.status')}>
        {['all', 'pending', 'approved', 'overdue', 'repaid', 'rejected', 'repayments'].map((f) => (
          <button
            key={f}
            type="button"
            className={filter === f ? 'loans__filter is-on' : 'loans__filter'}
            onClick={() => (f === 'repayments' ? openRepayments() : setFilter(f))}
          >
            {f === 'all' ? t('common.all')
              : f === 'repayments' ? t('loans.viewRepayments')
              : t(`loans.${f === 'repaid' ? 'repaidStatus' : f}`)}
          </button>
        ))}
      </div>

      {filter === 'repayments' ? (
        <section className="rp rp--inline">
          {isCommittee && (
            <>
              <div className="toolbar">
                <input
                  className="toolbar__grow"
                  type="search"
                  placeholder={t('loans.searchPlaceholder')}
                  aria-label={t('loans.searchMember')}
                  value={rpSearch}
                  onChange={(e) => setRpSearch(e.target.value)}
                />
                <button type="button" className="btn btn--ghost btn--small" onClick={showEveryone}>
                  {t('loans.everyone')}
                </button>
              </div>

              {rpLoanOptions.length > 0 && (
                <div className="toolbar">
                  <label className="field-label" htmlFor="rp-loan">{t('loans.filterByLoan')}</label>
                  <select
                    id="rp-loan"
                    className="toolbar__grow"
                    value={rpLoanId}
                    onChange={(e) => pickRepayLoan(e.target.value)}
                  >
                    <option value="">{t('loans.allLoans')}</option>
                    {rpLoanOptions.map((l) => (
                      <option key={l.id} value={l.id}>
                        {t('loans.loanRef', l.id)} · {money(l.amount)} · {t(`loans.${l.status === 'repaid' ? 'repaidStatus' : l.status}`)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {rpQuery && (
                <ul className="rp__results">
                  {rpMatches.map((m) => (
                    <li key={m.id}>
                      <button type="button" className="rp__result" onClick={() => pickMember(m)}>
                        <MemberAvatar memberId={m.id} hasAvatar={m.has_avatar} name={m.full_name} size={28} />
                        <span className="rp__resultName">{m.full_name}</span>
                        <span className="rp__resultNum muted">{m.membership_number}</span>
                      </button>
                    </li>
                  ))}
                  {!rpMatches.length && <li className="muted rp__none">{t('loans.noRepayments')}</li>}
                </ul>
              )}
            </>
          )}

          {rpLoading && <Spinner />}

          {!rpLoading && rpData && (
            <>
              {rpData.member && (
                <div className="rp__who">
                  <MemberAvatar memberId={rpData.member.id} hasAvatar={rpData.member.has_avatar} name={rpData.member.full_name} size={40} />
                  <div>
                    <strong>{rpData.member.full_name}</strong>
                    <span className="muted">{rpData.member.membership_number}</span>
                  </div>
                </div>
              )}

              <div className="rp__stats">
                <StatCard tone="gold" label={t('loans.totalRepaid')} value={money(rpData.summary.total)} />
                <StatCard label={t('loans.principalPaid')} value={money(rpData.summary.principal)} />
                <StatCard label={t('loans.interestPaid')} value={money(rpData.summary.interest)} />
                <StatCard label={t('loans.paymentCount')} value={plainNumber(rpData.summary.count)} />
              </div>

              {rpData.summary.count > 0 && (
                <p className="muted rp__period">
                  {shortDate(rpData.summary.first_date)} – {shortDate(rpData.summary.last_date)}
                </p>
              )}

              {rpGroups.length ? (
                rpGroups.map((g) => (
                  <section className="rp__group" key={g.key}>
                    <div className="rp__groupHead">
                      <h3 className="rp__groupTitle">{g.label}</h3>
                      <span className="rp__groupTotal money">{money(g.total)}</span>
                    </div>
                    {g.dates && <p className="rp__groupDates muted">{g.dates}</p>}

                    {[...g.months.values()].map((m) => (
                      <div className="rp__month" key={m.key}>
                        <h4 className="rp__monthTitle">{m.label}</h4>
                        {[...m.days.values()].map((d) => (
                          <div className="rp__day" key={d.key}>
                            <h5 className="rp__dayTitle">{d.label}</h5>
                            <ul className="rp__list">
                              {d.items.map((r) => (
                                <li key={r.id} className="rp__item">
                                  <span className="rp__itemAmount money">{money(r.amount)}</span>
                                  <span className="rp__itemSplit">
                                    {r.interest_part > 0
                                      ? `${money(r.principal_part)} + ${money(r.interest_part)} ${t('loans.interestWord')}`
                                      : t('loans.principalOnly')}
                                  </span>
                                  <span className="rp__itemMeta">
                                    {!rpMember && <span className="rp__itemWho">{r.full_name}</span>}
                                    <span>{t('loans.loanRef', r.loan_id)}</span>
                                    {r.recorded_by_name && <span className="muted">{r.recorded_by_name}</span>}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    ))}
                  </section>
                ))
              ) : (
                <EmptyState title={t('loans.noRepayments')} />
              )}
            </>
          )}
        </section>
      ) : (
        <>
          {isCommittee && (
            <div className="toolbar">
              <input
                className="toolbar__grow"
                type="search"
                value={listSearch}
                placeholder={t('loans.searchPlaceholder')}
                aria-label={t('loans.searchMember')}
                onChange={(e) => setListSearch(e.target.value)}
              />
            </div>
          )}

          {filter === 'overdue' && (
            <p className={overdueCount > 0 ? 'notice notice--danger' : 'notice notice--good'}>
              {overdueCount > 0
                ? t('loans.overdueSummary', overdueCount, money(overdueOwed))
                : t('loans.noOverdue')}
            </p>
          )}

          <Ledger
            columns={filter === 'overdue' ? overdueColumns : columns}
            rows={shown}
            onRowClick={openDetail}
            empty={<EmptyState title={filter === 'overdue' ? t('loans.noOverdue') : t('loans.empty')} />}
          />
        </>
      )}

      {/* ---- apply ---- */}
      <Modal
        open={applyOpen}
        title={isCommittee ? t('loans.apply') : t('loans.request')}
        onClose={() => setApplyOpen(false)}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setApplyOpen(false)}>{t('common.cancel')}</button>
            <button type="submit" form="loan-form" className="btn" disabled={busy}>
              {busy ? t('common.saving') : t('loans.request')}
            </button>
          </>
        }
      >
        <form id="loan-form" onSubmit={apply} noValidate>
          {isCommittee && (
            <div className="form-row">
              <div>
                <label className="field-label" htmlFor="l-member">{t('loans.borrower')}</label>
                <select id="l-member" value={form.member_id} onChange={change('member_id')} required>
                  <option value="">—</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.full_name} — saved {money(m.total_savings)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {limit && (
            <p className={Number(form.amount) > limit.max_loan ? 'notice notice--danger' : 'notice'}>
              {t('loans.limitLine', limit.multiplier, money(limit.savings), money(limit.max_loan))}
              {' '}{t('loans.rateLine', limit.interest_rate)}
            </p>
          )}

          <div className="form-row">
            <div>
              <label className="field-label" htmlFor="l-amount">{t('common.amount')}</label>
              <input id="l-amount" type="number" inputMode="decimal" min="1" step="any"
                max={limit ? limit.max_loan : undefined} value={form.amount} onChange={change('amount')} required />
            </div>
          </div>

          <p className="notice">{t('loans.termNote')}</p>

          {/* The borrower's own choice about interest. */}
          <label className="loans__interest">
            <input type="checkbox" checked={form.with_interest} onChange={change('with_interest')} />
            <span>
              <strong>{t('loans.withInterest')}</strong>
              <span className="loans__interestHelp">{t('loans.withInterestHelp')}</span>
            </span>
          </label>

          <div className="form-row">
            <div>
              <label className="field-label" htmlFor="l-purpose">{t('loans.purpose')}</label>
              <textarea id="l-purpose" rows={2} value={form.purpose} onChange={change('purpose')} />
            </div>
          </div>
        </form>
      </Modal>

      {/* ---- one loan ---- */}
      <Modal
        open={!!detail}
        title={detail ? `${t('loans.statementFor')} — ${detail.loan.full_name}` : ''}
        onClose={() => setDetail(null)}
        wide
      >
        {detail && (
          <div className="loans__detail print-area">
            <p className="print-only loans__printHead">{t('app.name')} — {t('loans.statementFor')} · {shortDate(new Date())}</p>
            <dl className="loans__rows">
              <div><dt>{t('loans.principal')}</dt><dd className="money">{money(detail.loan.amount)}</dd></div>
              <div>
                <dt>{t('loans.interest')}</dt>
                <dd className="money">
                  {detail.loan.with_interest
                    ? `${money(detail.loan.interest_amount)} (${detail.loan.interest_rate}%)`
                    : t('loans.noInterest')}
                </dd>
              </div>
              <div><dt>{t('loans.totalDue')}</dt><dd className="money">{money(detail.loan.total_due)}</dd></div>
              <div><dt>{t('loans.repaid')}</dt><dd className="money">{money(detail.loan.total_repaid)}</dd></div>
              <div className="is-strong">
                <dt>{t('loans.outstanding')}</dt>
                <dd className="money">{money(detail.loan.outstanding)}</dd>
              </div>
              <div><dt>{t('loans.dueDate')}</dt><dd>{shortDate(detail.loan.due_date)}</dd></div>
              {detail.loan.purpose && <div><dt>{t('loans.purpose')}</dt><dd>{detail.loan.purpose}</dd></div>}
              {detail.loan.decision_note && (
                <div><dt>{t('common.reason')}</dt><dd>{detail.loan.decision_note}</dd></div>
              )}
            </dl>

            {detail.loan.status === 'pending' && canDecide && (
              <div className="loans__decide">
                <label className="field-label" htmlFor="l-note">{t('loans.decisionNote')}</label>
                <textarea id="l-note" rows={2} value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} />
                <div className="loans__decideBtns">
                  <button type="button" className="btn" disabled={busy} onClick={() => decide('approved')}>
                    {t('loans.approve')}
                  </button>
                  <button type="button" className="btn btn--danger" disabled={busy} onClick={() => decide('rejected')}>
                    {t('loans.reject')}
                  </button>
                </div>
              </div>
            )}

            {detail.loan.status === 'approved' && canRecordRepayment && (
              <form className="loans__repay" onSubmit={recordRepayment}>
                <label className="field-label" htmlFor="l-repay">{t('loans.recordRepayment')}</label>
                <div className="loans__repayRow">
                  <input id="l-repay" type="number" inputMode="decimal" min="1" step="any"
                    max={detail.loan.outstanding} value={repayAmount}
                    onChange={(e) => setRepayAmount(e.target.value)} required />
                  <button type="submit" className="btn" disabled={busy}>{t('common.save')}</button>
                </div>
              </form>
            )}

            <h3 className="loans__subhead">{t('loans.repayments')}</h3>
            {detail.repayments.length ? (
              <ul className="loans__repayList">
                {detail.repayments.map((r) => (
                  <li key={r.id}>
                    <span>{shortDate(r.date)}</span>
                    <span className="muted">
                      {r.interest_part > 0 ? `${money(r.principal_part)} + ${money(r.interest_part)} ${t('loans.interestWord')}` : ''}
                    </span>
                    <span className="money">{money(r.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">{t('loans.nothingRepaid')}</p>
            )}

            <div className="no-print loans__printRow">
              <button type="button" className="btn btn--gold" onClick={() => window.print()}>
                {t('loans.print')}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ---- record a repayment ---- */}
      <Modal
        open={recOpen}
        title={t('loans.recordRepayments')}
        onClose={() => setRecOpen(false)}
        footer={
          <button type="button" className="btn btn--ghost" onClick={() => setRecOpen(false)}>
            {t('common.close')}
          </button>
        }
      >
        {!recMember ? (
          <>
            <div className="toolbar">
              <input
                className="toolbar__grow"
                type="search"
                value={recSearch}
                placeholder={t('loans.searchPlaceholder')}
                aria-label={t('loans.searchMember')}
                onChange={(e) => setRecSearch(e.target.value)}
                autoFocus
              />
            </div>
            {recQuery && (
              <ul className="rp__results">
                {recMatches.map((m) => (
                  <li key={m.id}>
                    <button type="button" className="rp__result" onClick={() => pickRecMember(m)}>
                      <MemberAvatar memberId={m.id} hasAvatar={m.has_avatar} name={m.full_name} size={28} />
                      <span className="rp__resultName">{m.full_name}</span>
                      <span className="rp__resultNum muted">{m.membership_number}</span>
                    </button>
                  </li>
                ))}
                {!recMatches.length && <li className="muted rp__none">{t('loans.noMemberFound')}</li>}
              </ul>
            )}
          </>
        ) : (
          <form onSubmit={recordFromPanel}>
            <div className="rp__who">
              <MemberAvatar memberId={recMember.id} hasAvatar={recMember.has_avatar} name={recMember.full_name} size={40} />
              <div>
                <strong>{recMember.full_name}</strong>
                <span className="muted">{recMember.membership_number}</span>
              </div>
              <button
                type="button"
                className="btn btn--ghost btn--small rp__whoChange"
                onClick={() => { setRecMember(null); setRecLoanId(''); setRecAmount(''); }}
              >
                {t('loans.changeMember')}
              </button>
            </div>

            {recLoans.length === 0 ? (
              <p className="muted">{t('loans.noRunningLoan')}</p>
            ) : (
              <>
                {recLoans.length > 1 && (
                  <div className="form-row">
                    <div>
                      <label className="field-label" htmlFor="rec-loan">{t('loans.pickLoan')}</label>
                      <select id="rec-loan" value={recLoanId} onChange={(e) => setRecLoanId(e.target.value)} required>
                        <option value="">—</option>
                        {recLoans.map((l) => (
                          <option key={l.id} value={l.id}>
                            {t('loans.loanRef', l.id)} · {money(l.outstanding)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {recLoan && (
                  <p className="notice">
                    {t('loans.outstanding')}: <strong>{money(recLoan.outstanding)}</strong>
                  </p>
                )}

                <div className="form-row">
                  <div>
                    <label className="field-label" htmlFor="rec-amount">{t('common.amount')}</label>
                    <input id="rec-amount" type="number" inputMode="decimal" min="1" step="any"
                      max={recLoan ? recLoan.outstanding : undefined}
                      value={recAmount} onChange={(e) => setRecAmount(e.target.value)} required />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="rec-date">{t('loans.date')}</label>
                    <input id="rec-date" type="date" value={recDate} onChange={(e) => setRecDate(e.target.value)} />
                  </div>
                </div>

                <p className="notice notice--good">{t('loans.interestFirstNote')}</p>

                <div className="no-print loans__printRow">
                  <button type="submit" className="btn" disabled={busy}>
                    {busy ? t('common.saving') : t('common.save')}
                  </button>
                  <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => setRecOpen(false)}>
                    {t('common.cancel')}
                  </button>
                </div>
              </>
            )}
          </form>
        )}
      </Modal>
    </div>
  );
}
