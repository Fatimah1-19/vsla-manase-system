import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useLang } from '../context/LangContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
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
  const { isRecorder, isAdmin } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();

  const [rows, setRows] = useState(null);
  const [members, setMembers] = useState([]);
  const [summary, setSummary] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);   // the entry being corrected

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
    if (!form.member_id || !form.amount) return;
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
    return q ? rows.filter((r) => r.full_name.toLowerCase().includes(q)) : rows;
  }, [rows, search]);

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
    { key: 'recorded_by_name', label: t('savings.recordedBy'), hideOnPhone: true,
      render: (r) => <span className="muted">{r.recorded_by_name || '—'}</span> },
    ...(isRecorder || isAdmin ? [{ key: 'x', label: '', align: 'right',
      render: (r) => (
        <span className="row-actions">
          {isRecorder && (
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

  if (!rows) return <Spinner />;

  return (
    <div className="savings">
      <PageHeader
        title={t('savings.title')}
        subtitle={t('savings.smsNote')}
        action={isRecorder && <button type="button" className="btn" onClick={() => setOpen(true)}>{t('savings.record')}</button>}
      />

      {summary?.cycle && (
        <div className="savings__cycle">
          <Icon name="cycles" size={18} />
          <span className="savings__cycleLabel">{t('savings.cycle')}</span>
          <strong className="savings__cycleName">{summary.cycle.cycle_name}</strong>
          <span className="savings__cycleDates">
            {shortDate(summary.cycle.start_date)} - {shortDate(summary.cycle.end_date)}
          </span>
        </div>
      )}

      {summary && (
        <div className="page-grid page-grid--stat">
          <StatCard label={t('savings.thisCycle')} value={money(summary.total_savings)} tone="gold" big />
          <StatCard label={t('common.total')} value={`${summary.entries} entries`} />
          <StatCard label={t('nav.members')} value={`${summary.savers} saving`} />
        </div>
      )}

      <div className="toolbar">
        <input
          className="toolbar__grow"
          type="search"
          placeholder={t('common.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label={t('common.search')}
        />
      </div>

      {groups.length === 0 ? (
        <EmptyState
          title={t('savings.empty')}
          action={isRecorder && <button type="button" className="btn" onClick={() => setOpen(true)}>{t('savings.record')}</button>}
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
                <input id="se-date" type="date" value={editing.date}
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
              <input id="s-date" type="date" value={form.date} onChange={change('date')} />
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
