import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useLang } from '../context/LangContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import SectionTabs from '../components/SectionTabs.jsx';
import Ledger from '../components/Ledger.jsx';
import Modal from '../components/Modal.jsx';
import Spinner from '../components/Spinner.jsx';
import EmptyState from '../components/EmptyState.jsx';
import MemberAvatar from '../components/MemberAvatar.jsx';
import StatCard from '../components/StatCard.jsx';
import { money, shortDate, inputDate, plainNumber, monthLong } from '../utils/format.js';
import '../styles.css';

const blank = { member_id: '', fine_type: 'other', amount: '', reason: '', date: inputDate(), paid: false };

const TYPE_LABEL = {
  absence: 'fines.typeAbsence',
  late: 'fines.typeLate',
  misconduct: 'fines.typeMisconduct',
  other: 'fines.typeOther',
};

export default function Fines() {
  const { t } = useLang();
  const { isCommittee, canRecordMoney, isAdmin } = useAuth();
  const toast = useToast();

  const [rows, setRows] = useState(null);
  const [members, setMembers] = useState([]);
  const [types, setTypes] = useState([]);
  const [summary, setSummary] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [removeReason, setRemoveReason] = useState('');

  // The treasurer filters the book: by member, kind, and date window, or a
  // plain search of the name and the reason.
  const [search, setSearch] = useState('');
  const [memberId, setMemberId] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  // Her menu can open the fines on the unpaid list or on the whole history.
  const [params] = useSearchParams();
  const view = params.get('view');
  const showOutstanding = view !== 'history';
  const showHistory = view !== 'outstanding';

  const load = useCallback(async () => {
    const jobs = [api.get('/fines')];
    jobs.push(isCommittee ? api.get('/members').catch(() => []) : Promise.resolve([]));
    jobs.push(api.get('/fines/types').catch(() => []));
    jobs.push(api.get('/fines/summary').catch(() => null));
    const [r, m, ty, sum] = await Promise.all(jobs);
    setRows(r); setMembers(m); setTypes(ty); setSummary(sum);
  }, [isCommittee]);

  useEffect(() => { load().catch((e) => toast.error(e.message)); }, [load, toast]);

  const activeType = types.find((x) => x.key === form.fine_type);
  const fixedAmount = activeType && activeType.fixed ? activeType.amount : null;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const body = {
        member_id: Number(form.member_id),
        fine_type: form.fine_type,
        reason: form.reason.trim(),
        date: form.date,
        paid: form.paid,
      };
      // The amount of a named kind comes from the group's settings; only the
      // "other" kind is typed in here.
      if (fixedAmount == null) body.amount = Number(form.amount);
      const res = await api.post('/fines', body);
      toast.success(res.message);
      setOpen(false);
      setForm(blank);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(e) {
    e.preventDefault();
    setBusy(true);
    try {
      toast.success((await api.del(`/fines/${removing.id}`, { reason: removeReason.trim() })).message);
      setRemoving(null);
      setRemoveReason('');
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function markPaid(id) {
    try {
      toast.success((await api.patch(`/fines/${id}/pay`)).message);
      await load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  const typeName = (r) => t(TYPE_LABEL[r.fine_type] || 'fines.typeOther');

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (memberId && String(r.member_id) !== String(memberId)) return false;
      if (typeFilter && r.fine_type !== typeFilter) return false;
      if (from && r.date < from) return false;
      if (to && r.date > to) return false;
      if (q && !(`${r.full_name} ${r.reason || ''}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [rows, search, memberId, typeFilter, from, to]);

  const anyFilter = !!(search.trim() || memberId || typeFilter || from || to);
  const clearFilters = () => {
    setSearch(''); setMemberId(''); setTypeFilter(''); setFrom(''); setTo('');
  };

  if (!rows) return <Spinner />;

  const outstanding = rows.filter((r) => !r.paid).reduce((s, r) => s + r.amount, 0);
  const collected = rows.filter((r) => r.paid).reduce((s, r) => s + r.amount, 0);
  const filteredOutstanding = filtered.filter((r) => !r.paid).reduce((s, r) => s + r.amount, 0);

  const byMember = new Map();
  for (const r of rows) {
    if (r.paid) continue;
    if (!byMember.has(r.member_id)) {
      byMember.set(r.member_id, { member_id: r.member_id, full_name: r.full_name, has_avatar: r.has_avatar, total: 0, items: [] });
    }
    const g = byMember.get(r.member_id);
    g.total += r.amount;
    g.items.push(r);
  }
  const due = [...byMember.values()].sort((a, b) => b.total - a.total);

  const columns = [
    { key: 'full_name', label: t('common.name'),
      render: (r) => (
        <span className="vcell">
          <MemberAvatar memberId={r.member_id} hasAvatar={r.has_avatar} name={r.full_name} size={32} />
          <span className="vcell__name">{r.full_name}</span>
        </span>
      ) },
    { key: 'fine_type', label: t('fines.type'),
      render: (r) => <span className="tag">{typeName(r)}</span> },
    { key: 'reason', label: t('common.reason'), hideOnPhone: true,
      render: (r) => r.reason || <span className="muted">—</span> },
    { key: 'meeting', label: t('fines.meeting'), hideOnPhone: true,
      render: (r) => (r.meeting_id
        ? t('fines.meetingRef', r.meeting_id)
        : <span className="muted">{t('fines.noMeeting')}</span>) },
    { key: 'cycle', label: t('fines.cycle'), hideOnPhone: true,
      render: (r) => r.cycle_name || <span className="muted">—</span> },
    { key: 'month', label: t('fines.month'), hideOnPhone: true,
      render: (r) => (r.month ? monthLong(r.month) : <span className="muted">—</span>) },
    { key: 'amount', label: t('common.amount'), align: 'right', money: true, render: (r) => money(r.amount) },
    { key: 'date', label: t('common.date'), render: (r) => shortDate(r.meeting_date || r.date) },
    { key: 'paid', label: t('common.status'),
      render: (r) => (
        r.paid
          ? <span className="tag tag--green">{t('fines.paid')}</span>
          : canRecordMoney
            ? <button type="button" className="btn btn--small btn--ghost" onClick={(e) => { e.stopPropagation(); markPaid(r.id); }}>
                {t('fines.markPaid')}
              </button>
            : <span className="tag tag--red">{t('fines.unpaid')}</span>
      ) },
    ...(isAdmin ? [{ key: 'x', label: '', align: 'right',
      render: (r) => (
        <button type="button" className="btn btn--small btn--ghost"
          onClick={(e) => { e.stopPropagation(); setRemoveReason(''); setRemoving(r); }}>{t('common.del')}</button>
      ) }] : []),
  ];

  const typeColumns = [
    { key: 'fine_type', label: t('fines.type'), render: (r) => t(TYPE_LABEL[r.fine_type] || 'fines.typeOther') },
    { key: 'count', label: t('fines.count'), align: 'right', render: (r) => plainNumber(r.count) },
    { key: 'collected', label: t('fines.collected'), align: 'right', money: true, render: (r) => money(r.collected) },
    { key: 'outstanding', label: t('fines.outstanding'), align: 'right', money: true, render: (r) => money(r.outstanding) },
    { key: 'total', label: t('common.total'), align: 'right', money: true, render: (r) => money(r.total) },
  ];

  return (
    <div className="fines">
      <PageHeader
        title={t('fines.title')}
        action={canRecordMoney && (
          <button type="button" className="btn" onClick={() => setOpen(true)}>{t('fines.record')}</button>
        )}
      />
      <SectionTabs />

      <p className="notice">{t('fines.keptNote')}</p>

      <div className="page-grid page-grid--stat">
        <StatCard label={isCommittee ? t('dashboard.finesOutstanding') : t('fines.toPay')}
          value={money(outstanding)} tone={outstanding > 0 ? 'red' : 'plain'} icon="fines" />
        <StatCard label={t('fines.collected')} value={money(collected)} tone="green" icon="fines" />
        <StatCard label={t('fines.count')} value={plainNumber(rows.length)} icon="fines" />
      </div>

      {showOutstanding && due.length > 0 && (
        <section className="fines__due">
          <h2 className="fines__dueTitle">{t('fines.toCollectTitle')}</h2>
          <p className="fines__dueNote muted">{t('fines.toCollectNote')}</p>
          <ul className="fines__dueList">
            {due.map((g) => (
              <li key={g.member_id} className="fines__dueItem">
                <span className="fines__dueWho">
                  <MemberAvatar memberId={g.member_id} hasAvatar={g.has_avatar} name={g.full_name} size={32} />
                  <span className="fines__dueName">{g.full_name}</span>
                </span>
                <span className="fines__dueMeta">
                  {g.items.map((it) => (
                    <span key={it.id} className="fines__dueTag">
                      {it.meeting_id ? t('fines.meetingRef', it.meeting_id) : t('fines.noMeeting')}
                      {' · '}
                      {it.month ? monthLong(it.month) : shortDate(it.date)}
                      {' · '}
                      {money(it.amount)}
                    </span>
                  ))}
                </span>
                <span className="fines__dueAmount money">{money(g.total)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {showHistory && summary?.by_type?.length > 0 && (
        <section className="savings__month">
          <div className="savings__monthHead">
            <h2 className="savings__monthTitle">{t('fines.byType')}</h2>
          </div>
          <Ledger columns={typeColumns} rows={summary.by_type} />
        </section>
      )}

      {showHistory && (
        <>
          <div className="toolbar">
            <input
              className="toolbar__grow"
              type="search"
              placeholder={t('common.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label={t('common.search')}
            />
            <select value={memberId} onChange={(e) => setMemberId(e.target.value)} aria-label={t('savings.member')}>
              <option value="">{t('nav.members')}</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label={t('fines.type')}>
              <option value="">{t('fines.allTypes')}</option>
              {types.map((x) => <option key={x.key} value={x.key}>{t(TYPE_LABEL[x.key] || 'fines.typeOther')}</option>)}
            </select>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label={t('common.date')} />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label={t('common.date')} />
            {anyFilter && (
              <button type="button" className="btn btn--ghost" onClick={clearFilters}>{t('common.clear')}</button>
            )}
          </div>

          {anyFilter && (
            <p className="muted">
              {filtered.length} {filtered.length === 1 ? t('fines.entry') : t('fines.count')}
              {' — '}
              <span className="money">{money(filteredOutstanding)}</span> {t('fines.outstanding').toLowerCase()}
            </p>
          )}

          <Ledger columns={columns} rows={filtered} empty={<EmptyState title={t('fines.empty')} />} />
        </>
      )}

      <Modal
        open={open}
        title={t('fines.record')}
        onClose={() => setOpen(false)}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</button>
            <button type="submit" form="fine-form" className="btn" disabled={busy}>
              {busy ? t('common.saving') : t('common.save')}
            </button>
          </>
        }
      >
        <form id="fine-form" onSubmit={submit} noValidate>
          <p className="notice">{t('fines.amountNote')}</p>

          <div className="form-row form-row--2">
            <div>
              <label className="field-label" htmlFor="f-member">{t('savings.member')}</label>
              <select id="f-member" value={form.member_id}
                onChange={(e) => setForm((f) => ({ ...f, member_id: e.target.value }))} required>
                <option value="">—</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="f-type">{t('fines.type')}</label>
              <select id="f-type" value={form.fine_type}
                onChange={(e) => setForm((f) => ({ ...f, fine_type: e.target.value }))} required>
                {types.map((x) => <option key={x.key} value={x.key}>{t(TYPE_LABEL[x.key] || 'fines.typeOther')}</option>)}
              </select>
            </div>
          </div>

          <div className="form-row form-row--2">
            <div>
              <label className="field-label" htmlFor="f-amount">{t('common.amount')}</label>
              {fixedAmount != null ? (
                <>
                  <input id="f-amount" value={money(fixedAmount)} readOnly disabled />
                  <span className="field-hint">{t('fines.fixedAmount')}</span>
                </>
              ) : (
                <input id="f-amount" type="number" inputMode="decimal" min="1" step="any"
                  value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} required />
              )}
            </div>
            <div>
              <label className="field-label" htmlFor="f-date">{t('common.date')}</label>
              <input id="f-date" type="date" max={inputDate()} value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
            </div>
          </div>

          <div className="form-row">
            <div>
              <label className="field-label" htmlFor="f-reason">{t('common.reason')}</label>
              <input id="f-reason" value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder={t('fines.reasonExample')} />
              <span className="field-hint">{t('fines.reasonHint')}</span>
            </div>
          </div>

          <label className="fines__paid">
            <input type="checkbox" checked={form.paid}
              onChange={(e) => setForm((f) => ({ ...f, paid: e.target.checked }))} />
            <span>{t('fines.alreadyPaid')}</span>
          </label>
        </form>
      </Modal>

      <Modal
        open={!!removing}
        title={t('fines.removeTitle')}
        onClose={() => setRemoving(null)}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setRemoving(null)}>{t('common.cancel')}</button>
            <button type="submit" form="fine-remove-form" className="btn btn--danger"
              disabled={busy || !removeReason.trim()}>
              {busy ? t('common.saving') : t('common.del')}
            </button>
          </>
        }
      >
        <form id="fine-remove-form" onSubmit={remove} noValidate>
          <p className="notice">
            {removing ? t('fines.removeNote', removing.full_name, money(removing.amount)) : ''}
          </p>
          <div className="form-row">
            <div>
              <label className="field-label" htmlFor="f-del-reason">{t('fines.removeReason')}</label>
              <input id="f-del-reason" value={removeReason}
                onChange={(e) => setRemoveReason(e.target.value)}
                placeholder={t('fines.removeReasonExample')} required />
              <span className="field-hint">{t('fines.removeReasonHint')}</span>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
