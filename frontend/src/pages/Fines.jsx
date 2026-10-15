import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useLang } from '../context/LangContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Ledger from '../components/Ledger.jsx';
import Modal from '../components/Modal.jsx';
import Spinner from '../components/Spinner.jsx';
import EmptyState from '../components/EmptyState.jsx';
import MemberAvatar from '../components/MemberAvatar.jsx';
import StatCard from '../components/StatCard.jsx';
import { money, shortDate, inputDate, plainNumber, monthLong } from '../utils/format.js';
import '../styles.css';

const blank = { member_id: '', amount: '', reason: '', date: inputDate(), paid: false };

export default function Fines() {
  const { t } = useLang();
  const { isCommittee, isRecorder, isAdmin } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();

  const [rows, setRows] = useState(null);
  const [members, setMembers] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setRows(await api.get('/fines'));
    if (isCommittee) { try { setMembers(await api.get('/members')); } catch { /* ignore */ } }
  }, [isCommittee]);

  useEffect(() => { load().catch((e) => toast.error(e.message)); }, [load, toast]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.post('/fines', {
        ...form, member_id: Number(form.member_id), amount: Number(form.amount),
      });
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

  async function remove(id) {
    if (!(await confirm({ message: t('fines.confirmRemove'), danger: true }))) return;
    try {
      toast.success((await api.del(`/fines/${id}`)).message);
      await load();
    } catch (err) {
      toast.error(err.message);
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

  if (!rows) return <Spinner />;

  const outstanding = rows.filter((r) => !r.paid).reduce((s, r) => s + r.amount, 0);
  const collected = rows.filter((r) => r.paid).reduce((s, r) => s + r.amount, 0);

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
          : isRecorder
            ? <button type="button" className="btn btn--small btn--ghost" onClick={(e) => { e.stopPropagation(); markPaid(r.id); }}>
                {t('fines.markPaid')}
              </button>
            : <span className="tag tag--red">{t('fines.unpaid')}</span>
      ) },
    ...(isAdmin ? [{ key: 'x', label: '', align: 'right',
      render: (r) => (
        <button type="button" className="btn btn--small btn--ghost"
          onClick={(e) => { e.stopPropagation(); remove(r.id); }}>{t('common.del')}</button>
      ) }] : []),
  ];

  return (
    <div className="fines">
      <PageHeader
        title={t('fines.title')}
        action={isRecorder && (
          <button type="button" className="btn" onClick={() => setOpen(true)}>{t('fines.record')}</button>
        )}
      />

      <p className="notice">{t('fines.keptNote')}</p>

      <div className="page-grid page-grid--stat">
        <StatCard label={isCommittee ? t('dashboard.finesOutstanding') : t('fines.toPay')}
          value={money(outstanding)} tone={outstanding > 0 ? 'red' : 'plain'} icon="fines" />
        <StatCard label={t('fines.collected')} value={money(collected)} tone="green" icon="fines" />
        <StatCard label={t('fines.count')} value={plainNumber(rows.length)} icon="fines" />
      </div>

      {due.length > 0 && (
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

      <Ledger columns={columns} rows={rows} empty={<EmptyState title={t('fines.empty')} />} />

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
          <div className="form-row">
            <div>
              <label className="field-label" htmlFor="f-member">{t('savings.member')}</label>
              <select id="f-member" value={form.member_id}
                onChange={(e) => setForm((f) => ({ ...f, member_id: e.target.value }))} required>
                <option value="">—</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
              </select>
            </div>
          </div>

          <div className="form-row form-row--2">
            <div>
              <label className="field-label" htmlFor="f-amount">{t('common.amount')}</label>
              <input id="f-amount" type="number" inputMode="decimal" min="1" step="any"
                value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} required />
            </div>
            <div>
              <label className="field-label" htmlFor="f-date">{t('common.date')}</label>
              <input id="f-date" type="date" value={form.date}
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
    </div>
  );
}
