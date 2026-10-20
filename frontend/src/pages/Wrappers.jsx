import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useLang } from '../context/LangContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import BackButton from '../components/BackButton.jsx';
import Ledger from '../components/Ledger.jsx';
import StatusTag from '../components/StatusTag.jsx';
import Modal from '../components/Modal.jsx';
import Spinner from '../components/Spinner.jsx';
import StatCard from '../components/StatCard.jsx';
import EmptyState from '../components/EmptyState.jsx';
import MemberAvatar from '../components/MemberAvatar.jsx';
import { Ring } from '../components/Charts.jsx';
import { money, shortDate, inputDate, monthLong, thisMonth } from '../utils/format.js';
import '../styles.css';

/**
 * The fixed monthly contribution every member pays for the group's wrappers.
 * It is not savings and it is never shared out. The treasurer and the
 * secretary record it; everyone can see her own record.
 */
export default function Wrappers() {
  const { t } = useLang();
  const { isCommittee, canRecordMoney, isAdmin } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [month, setMonth] = useState(thisMonth());
  const [view, setView] = useState(null);       // committee: one month
  const [mine, setMine] = useState(null);       // member: her own history
  const [arrears, setArrears] = useState(null);
  const [payments, setPayments] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ member_id: '', amount: '', month, paid_on: inputDate(), note: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (isCommittee) {
      const [v, a, p] = await Promise.all([
        api.get(`/contributions?month=${month}`),
        api.get('/contributions/arrears'),
        api.get(`/contributions/payments?month=${month}`),
      ]);
      setView(v); setArrears(a); setPayments(p);
    }
    setMine(await api.get('/contributions/mine'));
  }, [isCommittee, month]);

  useEffect(() => { load().catch((e) => toast.error(e.message)); }, [load, toast]);

  function startRecord(row) {
    setForm({
      member_id: row ? String(row.member_id) : '',
      amount: row ? String(row.balance || '') : '',
      month, paid_on: inputDate(), note: '',
    });
    setOpen(true);
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.post('/contributions', {
        member_id: Number(form.member_id), amount: Number(form.amount),
        month: form.month, paid_on: form.paid_on, note: form.note || null,
      });
      toast.success(res.sms_sent ? `${res.message} ${t('wrappers.texted')}` : res.message);
      setOpen(false);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(p) {
    if (!(await confirm({ message: t('wrappers.confirmRemove'), danger: true }))) return;
    try {
      toast.success((await api.del(`/contributions/${p.id}`)).message);
      await load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  if (!mine || (isCommittee && !view)) return <Spinner />;

  // ------------------------------------------------ member's own view
  if (!isCommittee) {
    return (
      <div className="wrappers">
        <PageHeader title={t('wrappers.title')} subtitle={t('wrappers.explain', money(mine.levy))} />
        <BackButton />
        <div className="page-grid page-grid--stat">
          <StatCard label={t('wrappers.monthly')} value={money(mine.levy)} tone="gold" />
          <StatCard label={t('wrappers.totalPaid')} value={money(mine.total_paid)} tone="green" />
          <StatCard label={t('wrappers.stillOwed')} value={money(mine.owed)} tone={mine.owed > 0 ? 'gold' : 'plain'} />
        </div>
        <section className="panel">
          <h2 className="panel__title">{t('wrappers.myMonths')}</h2>
          {mine.months.length === 0 ? <p className="muted">{t('common.none')}</p> : (
            <ul className="wrappers__months">
              {mine.months.map((m) => (
                <li key={m.month}>
                  <span>{monthLong(m.month)}</span>
                  <span className="money">{money(m.paid)}</span>
                  <StatusTag status={m.status}>{t(`wrappers.${m.status}`)}</StatusTag>
                </li>
              ))}
            </ul>
          )}
        </section>
        <p className="notice">{t('wrappers.notShared')}</p>
      </div>
    );
  }

  // ------------------------------------------------ committee view
  const tot = view.totals;
  const rate = tot.expected > 0 ? Math.round((tot.collected / tot.expected) * 100) : 0;

  const columns = [
    { key: 'full_name', label: t('common.name'),
      render: (r) => (
        <span className="vcell">
          <MemberAvatar memberId={r.member_id} hasAvatar={r.has_avatar} name={r.full_name} size={32} />
          <span className="vcell__name">{r.full_name}</span>
        </span>
      ) },
    { key: 'paid', label: t('wrappers.paid'), align: 'right', money: true, render: (r) => money(r.paid) },
    { key: 'balance', label: t('wrappers.balance'), align: 'right', money: true, hideOnPhone: true,
      render: (r) => (r.balance > 0 ? <span className="money money--neg">{money(r.balance)}</span> : '—') },
    { key: 'status', label: t('common.status'),
      render: (r) => <StatusTag status={r.status}>{t(`wrappers.${r.status}`)}</StatusTag> },
    ...(canRecordMoney ? [{ key: 'x', label: '', align: 'right',
      render: (r) => r.balance > 0 && (
        <button type="button" className="btn btn--small" onClick={() => startRecord(r)}>{t('wrappers.record')}</button>
      ) }] : []),
  ];

  return (
    <div className="wrappers">
      <PageHeader
        title={t('wrappers.title')}
        subtitle={t('wrappers.explain', money(view.levy))}
        action={canRecordMoney && <button type="button" className="btn" onClick={() => startRecord(null)}>{t('wrappers.record')}</button>}
      />

      <div className="toolbar">
        <BackButton />
        <label className="field-label wrappers__monthLabel" htmlFor="w-month">{t('wrappers.month')}</label>
        <input id="w-month" type="month" value={month} max={thisMonth()} onChange={(e) => setMonth(e.target.value || thisMonth())} />
      </div>

      <div className="wrappers__top">
        <div className="page-grid page-grid--stat wrappers__stats">
          <StatCard label={t('wrappers.collected')} value={money(tot.collected)} tone="green" big />
          <StatCard label={t('wrappers.expected')} value={money(tot.expected)} />
          <StatCard label={t('wrappers.outstanding')} value={money(tot.outstanding)} tone={tot.outstanding > 0 ? 'gold' : 'plain'} />
        </div>
        <Ring value={rate} label={t('wrappers.paidCount', tot.paid_count, tot.member_count)} tone="auto" />
      </div>

      <Ledger columns={columns} rows={view.members} keyField="member_id" empty={<EmptyState title={t('common.none')} />} />

      {arrears && arrears.rows.length > 0 && (
        <section className="panel wrappers__arrears">
          <h2 className="panel__title">{t('wrappers.behindTitle', money(arrears.total_owed))}</h2>
          <ul className="wrappers__months">
            {arrears.rows.map((r) => (
              <li key={r.member_id}>
                <span>{r.full_name}</span>
                <span className="muted">{t('wrappers.monthsDue', r.months_due)}</span>
                <span className="money money--neg">{money(r.owed)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel">
        <h2 className="panel__title">{t('wrappers.paymentsTitle', monthLong(month))}</h2>
        <Ledger
          rows={payments}
          empty={<p className="muted">{t('common.none')}</p>}
          columns={[
            { key: 'full_name', label: t('common.name'),
            render: (r) => (
              <span className="vcell">
                <MemberAvatar memberId={r.member_id} hasAvatar={r.has_avatar} name={r.full_name} size={28} />
                <span className="vcell__name">{r.full_name}</span>
              </span>
            ) },
            { key: 'amount', label: t('common.amount'), align: 'right', money: true, render: (r) => money(r.amount) },
            { key: 'paid_on', label: t('common.date'), render: (r) => shortDate(r.paid_on) },
            { key: 'recorded_by_name', label: t('savings.recordedBy'), hideOnPhone: true, render: (r) => <span className="muted">{r.recorded_by_name || '—'}</span> },
            ...(isAdmin ? [{ key: 'x', label: '', align: 'right',
              render: (r) => <button type="button" className="btn btn--small btn--ghost" onClick={() => remove(r)}>{t('common.del')}</button> }] : []),
          ]}
        />
      </section>

      <p className="notice">{t('wrappers.notShared')}</p>

      <Modal
        open={open}
        title={t('wrappers.record')}
        onClose={() => setOpen(false)}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</button>
            <button type="submit" form="wrap-form" className="btn" disabled={busy}>{busy ? t('common.saving') : t('common.save')}</button>
          </>
        }
      >
        <form id="wrap-form" onSubmit={submit} noValidate>
          <div className="form-row">
            <div>
              <label className="field-label" htmlFor="w-member">{t('savings.member')}</label>
              <select id="w-member" value={form.member_id} onChange={(e) => setForm((f) => ({ ...f, member_id: e.target.value }))} required>
                <option value="">—</option>
                {view.members.map((m) => <option key={m.member_id} value={m.member_id}>{m.full_name} ({m.membership_number})</option>)}
              </select>
            </div>
          </div>
          <div className="form-row form-row--2">
            <div>
              <label className="field-label" htmlFor="w-amount">{t('common.amount')}</label>
              <input id="w-amount" type="number" inputMode="decimal" min="1" max={view.levy} step="any"
                value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} required />
              <span className="field-hint">{t('wrappers.monthlyIs', money(view.levy))}</span>
            </div>
            <div>
              <label className="field-label" htmlFor="w-for">{t('wrappers.forMonth')}</label>
              <input id="w-for" type="month" max={thisMonth()} value={form.month}
                onChange={(e) => setForm((f) => ({ ...f, month: e.target.value }))} />
            </div>
          </div>
          <div className="form-row form-row--2">
            <div>
              <label className="field-label" htmlFor="w-date">{t('common.date')}</label>
              <input id="w-date" type="date" value={form.paid_on} onChange={(e) => setForm((f) => ({ ...f, paid_on: e.target.value }))} />
            </div>
            <div>
              <label className="field-label" htmlFor="w-note">{t('savings.note')}</label>
              <input id="w-note" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
