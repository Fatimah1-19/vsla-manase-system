import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useLang } from '../context/LangContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import SectionTabs from '../components/SectionTabs.jsx';
import BackButton from '../components/BackButton.jsx';
import Ledger from '../components/Ledger.jsx';
import Modal from '../components/Modal.jsx';
import Spinner from '../components/Spinner.jsx';
import StatCard from '../components/StatCard.jsx';
import EmptyState from '../components/EmptyState.jsx';
import MemberAvatar from '../components/MemberAvatar.jsx';
import Icon from '../components/Icon.jsx';
import { money, shortDate, inputDate, monthLong } from '../utils/format.js';
import '../styles.css';

const blank = { member_id: '', amount: '', shares: '1', date: inputDate(), note: '' };

export default function Savings() {
  const { t } = useLang();
  const { canRecordMoney, isAdmin } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();

  const [rows, setRows] = useState(null);
  const [members, setMembers] = useState([]);
  const [summary, setSummary] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [memberId, setMemberId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [editing, setEditing] = useState(null);   // the entry being corrected

  // The treasurer's menu can open this page on its summary or on its history.
  const [params] = useSearchParams();
  const view = params.get('view');
  const showSummary = view !== 'history';
  const showHistory = view !== 'summary';

  const load = useCallback(async () => {
    const [list, sum, mem] = await Promise.all([
      api.get('/savings'),
      api.get('/savings/summary'),
      api.get('/members'),
    ]);
    setRows(list);
    setSummary(sum);
    setMembers(mem);
  }, []);

  useEffect(() => { load().catch((e) => toast.error(e.message)); }, [load, toast]);

  const change = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    // The savings rules are checked here before the request goes out: a member
    // must be chosen, the amount must be a real figure above zero, and the
    // transaction date must be a real day that has already happened.
    if (!form.member_id) { toast.error(t('savings.pickMember')); return; }
    const amount = Number(form.amount);
    if (form.amount === '' || Number.isNaN(amount)) { toast.error(t('savings.enterAmount')); return; }
    if (amount <= 0) { toast.error(t('savings.amountPositive')); return; }
    if (Number(form.shares) < 1) { toast.error(t('savings.sharesMin')); return; }
    if (!form.date || form.date > inputDate()) { toast.error(t('savings.badDate')); return; }
    const who = members.find((m) => String(m.id) === String(form.member_id));
    // Step four: confirm the transaction before it is written to the book.
    if (!(await confirm({
      message: t('savings.confirmRecord', who ? who.full_name : '', money(amount), shortDate(form.date)),
    }))) return;
    setBusy(true);
    try {
      const res = await api.post('/savings', {
        member_id: Number(form.member_id),
        amount: Number(form.amount),
        shares: Number(form.shares) || 1,
        date: form.date,
        note: form.note || null,
      });
      toast.success(res.sms_sent ? `${res.message} They have been texted.` : res.message);
      setOpen(false);
      setForm(blank);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.patch(`/savings/${editing.id}`, {
        amount: Number(editing.amount), shares: Number(editing.shares) || 1,
        date: editing.date, note: editing.note || null,
      });
      toast.success(res.message);
      setEditing(null);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(row) {
    if (!(await confirm({ message: t('savings.confirmRemove', row.full_name, money(row.amount)), danger: true }))) return;
    try {
      toast.success((await api.del(`/savings/${row.id}`)).message);
      await load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    const picked = memberId ? Number(memberId) : null;
    const day = (r) => String(r.date).slice(0, 10);
    return rows.filter((r) => {
      if (picked && r.member_id !== picked) return false;
      if (from && day(r) < from) return false;
      if (to && day(r) > to) return false;
      return !q || r.full_name.toLowerCase().includes(q);
    });
  }, [rows, search, memberId, from, to]);

  const filteredTotal = useMemo(
    () => filtered.reduce((sum, r) => sum + (Number(r.amount) || 0), 0),
    [filtered]
  );

  const anyFilter = !!(search.trim() || memberId || from || to);

  const clearFilters = () => {
    setSearch('');
    setMemberId('');
    setFrom('');
    setTo('');
  };

  const groups = useMemo(() => {
    const months = new Map();
    for (const r of filtered) {
      const mKey = String(r.date).slice(0, 7);
      if (!months.has(mKey)) months.set(mKey, { key: mKey, total: 0, dates: new Map() });
      const m = months.get(mKey);
      m.total += Number(r.amount) || 0;
      const dKey = String(r.date).slice(0, 10);
      if (!m.dates.has(dKey)) m.dates.set(dKey, { key: dKey, rows: [] });
      m.dates.get(dKey).rows.push(r);
    }
    return [...months.values()]
      .sort((a, b) => b.key.localeCompare(a.key))
      .map((m) => ({
        key: m.key,
        total: m.total,
        dates: [...m.dates.values()]
          .sort((a, b) => b.key.localeCompare(a.key))
          .map((d) => ({ ...d, rows: [...d.rows].sort((x, y) => x.full_name.localeCompare(y.full_name)) })),
      }));
  }, [filtered]);

  const columns = [
    { key: 'full_name', label: t('savings.member'),
      render: (r) => (
        <span className="vcell">
          <MemberAvatar memberId={r.member_id} hasAvatar={r.has_avatar} name={r.full_name} size={32} />
          <span className="vcell__name">{r.full_name}</span>
        </span>
      ) },
    { key: 'amount', label: t('common.amount'), align: 'right', money: true, render: (r) => money(r.amount) },
    { key: 'shares', label: t('savings.shares'), align: 'right', hideOnPhone: true },
    { key: 'date', label: t('common.date'), render: (r) => shortDate(r.date) },
    { key: 'note', label: t('savings.note'), hideOnPhone: true,
      render: (r) => <span className="muted">{r.note || '—'}</span> },
    { key: 'recorded_by_name', label: t('savings.recordedBy'), hideOnPhone: true,
      render: (r) => <span className="muted">{r.recorded_by_name || '—'}</span> },
    ...(canRecordMoney || isAdmin ? [{ key: 'x', label: '', align: 'right',
      render: (r) => (
        <span className="row-actions">
          {canRecordMoney && (
            <button type="button" className="btn btn--small btn--ghost"
              onClick={() => setEditing({ id: r.id, amount: r.amount, shares: r.shares, date: String(r.date).slice(0, 10), note: r.note || '', full_name: r.full_name })}>
              {t('common.edit')}
            </button>
          )}
          {isAdmin && (
            <button type="button" className="btn btn--small btn--ghost" onClick={() => remove(r)}>{t('common.del')}</button>
          )}
        </span>
      ) }] : []),
  ];

  const groupColumns = columns.filter((c) => c.key !== 'date');

  // What each member has put into the box this cycle — the treasurer's cross-check.
  const perMemberColumns = [
    { key: 'full_name', label: t('savings.member'),
      render: (r) => (
        <span className="vcell">
          <MemberAvatar memberId={r.member_id} hasAvatar={r.has_avatar} name={r.full_name} size={32} />
          <span className="vcell__name">{r.full_name}</span>
        </span>
      ) },
    { key: 'total_savings', label: t('savings.thisCycle'), align: 'right', render: (r) => money(r.total_savings) },
    { key: 'total_shares', label: t('savings.shares'), align: 'right', hideOnPhone: true },
  ];

  const savers = (summary?.per_member || []).filter((r) => Number(r.total_savings) > 0);

  if (!rows) return <Spinner />;

  return (
    <div className="savings">
      <PageHeader
        title={t('savings.title')}
        subtitle={t('savings.smsNote')}
        action={canRecordMoney && <button type="button" className="btn" onClick={() => setOpen(true)}>{t('savings.record')}</button>}
      />
      <SectionTabs hideBack />

      {summary?.cycle ? (
        <div className="savings__cycle">
          <BackButton />
          <Icon name="cycles" size={18} />
          <span className="savings__cycleLabel">{t('savings.cycle')}</span>
          <strong className="savings__cycleName">{summary.cycle.cycle_name}</strong>
          <span className="savings__cycleDates">
            {shortDate(summary.cycle.start_date)} - {shortDate(summary.cycle.end_date)}
          </span>
        </div>
      ) : (
        <BackButton />
      )}

      {summary && showSummary && (
        <div className="page-grid page-grid--stat">
          <StatCard label={t('savings.thisCycle')} value={money(summary.total_savings)} tone="gold" big />
          <StatCard label={t('common.total')} value={`${summary.entries} ${t('savings.entries')}`} />
          <StatCard label={t('nav.members')} value={`${summary.savers} ${t('savings.savers')}`} />
        </div>
      )}

      {showSummary && savers.length > 0 && (
        <section className="savings__month">
          <div className="savings__monthHead">
            <h2 className="savings__monthTitle">{t('savings.memberTotals')}</h2>
            <span className="savings__monthTotal money">{money(summary.total_savings)}</span>
          </div>
          <Ledger columns={perMemberColumns} rows={savers} />
        </section>
      )}

      {showHistory && (
        <>
          <div className="toolbar toolbar--align-end">
            <input
              className="toolbar__grow toolbar__grow--fit"
              type="search"
              placeholder={t('common.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label={t('common.search')}
            />
            <select
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              aria-label={t('savings.member')}
            >
              <option value="">{t('nav.members')}</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.full_name}</option>
              ))}
            </select>
            <label className="toolbar__field">
              <span>{t('common.from')}</span>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                aria-label={t('common.from')}
              />
            </label>
            <label className="toolbar__field">
              <span>{t('common.to')}</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                aria-label={t('common.to')}
              />
            </label>
            {anyFilter && (
              <button type="button" className="btn btn--ghost" onClick={clearFilters}>
                {t('common.clear')}
              </button>
            )}
          </div>

          {anyFilter && (
            <p className="muted">
              {filtered.length} {filtered.length === 1 ? t('savings.entry') : t('savings.entries')}
              {' — '}
              <span className="money">{money(filteredTotal)}</span>
            </p>
          )}

          {groups.length === 0 ? (
            <EmptyState
              title={t('savings.empty')}
              action={canRecordMoney && <button type="button" className="btn" onClick={() => setOpen(true)}>{t('savings.record')}</button>}
            />
          ) : (
            groups.map((g) => (
              <section key={g.key} className="savings__month">
                <div className="savings__monthHead">
                  <h2 className="savings__monthTitle">{monthLong(g.key)}</h2>
                  <span className="savings__monthTotal money">{money(g.total)}</span>
                </div>
                {g.dates.map((d) => (
                  <div key={d.key} className="savings__day">
                    <h3 className="savings__dayTitle">{shortDate(d.key)}</h3>
                    <Ledger columns={groupColumns} rows={d.rows} />
                  </div>
                ))}
              </section>
            ))
          )}
        </>
      )}

      <Modal
        open={!!editing}
        title={editing ? `${t('common.edit')} — ${editing.full_name}` : ''}
        onClose={() => setEditing(null)}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setEditing(null)}>{t('common.cancel')}</button>
            <button type="submit" form="saving-edit-form" className="btn" disabled={busy}>
              {busy ? t('common.saving') : t('common.save')}
            </button>
          </>
        }
      >
        {editing && (
          <form id="saving-edit-form" onSubmit={saveEdit} noValidate>
            <div className="form-row form-row--2">
              <div>
                <label className="field-label" htmlFor="se-amount">{t('common.amount')}</label>
                <input id="se-amount" type="number" inputMode="decimal" min="1" step="any" value={editing.amount}
                  onChange={(e) => setEditing((x) => ({ ...x, amount: e.target.value }))} required />
              </div>
              <div>
                <label className="field-label" htmlFor="se-shares">{t('savings.shares')}</label>
                <input id="se-shares" type="number" inputMode="numeric" min="1" step="1" value={editing.shares}
                  onChange={(e) => setEditing((x) => ({ ...x, shares: e.target.value }))} />
              </div>
            </div>
            <div className="form-row">
              <div>
                <label className="field-label" htmlFor="se-date">{t('common.date')}</label>
                <input id="se-date" type="date" value={editing.date} max={inputDate()}
                  onChange={(e) => setEditing((x) => ({ ...x, date: e.target.value }))} />
              </div>
            </div>
            <div className="form-row">
              <div>
                <label className="field-label" htmlFor="se-note">{t('savings.note')}</label>
                <input id="se-note" value={editing.note} onChange={(e) => setEditing((x) => ({ ...x, note: e.target.value }))} />
              </div>
            </div>
            <p className="savings__smsHint">{t('savings.editNote')}</p>
          </form>
        )}
      </Modal>

      <Modal
        open={open}
        title={t('savings.record')}
        onClose={() => setOpen(false)}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</button>
            <button type="submit" form="saving-form" className="btn" disabled={busy}>
              {busy ? t('common.saving') : t('common.save')}
            </button>
          </>
        }
      >
        <form id="saving-form" onSubmit={submit} noValidate>
          <div className="form-row">
            <div>
              <label className="field-label" htmlFor="s-member">{t('savings.member')}</label>
              <select id="s-member" value={form.member_id} onChange={change('member_id')} required>
                <option value="">—</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.full_name} ({m.membership_number})</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row form-row--2">
            <div>
              <label className="field-label" htmlFor="s-amount">{t('common.amount')}</label>
              <input id="s-amount" type="number" inputMode="decimal" min="1" step="any"
                value={form.amount} onChange={change('amount')} required />
            </div>
            <div>
              <label className="field-label" htmlFor="s-shares">{t('savings.shares')}</label>
              <input id="s-shares" type="number" inputMode="numeric" min="1"
                value={form.shares} onChange={change('shares')} />
            </div>
          </div>

          <div className="form-row">
            <div>
              <label className="field-label" htmlFor="s-date">{t('common.date')}</label>
              <input id="s-date" type="date" value={form.date} max={inputDate()} onChange={change('date')} />
            </div>
          </div>

          <div className="form-row">
            <div>
              <label className="field-label" htmlFor="s-note">
                {t('savings.note')} <span className="muted">({t('common.optional')})</span>
              </label>
              <input id="s-note" value={form.note} onChange={change('note')} />
            </div>
          </div>

          <p className="savings__smsHint">{t('savings.smsNote')}</p>
        </form>
      </Modal>
    </div>
  );
}
