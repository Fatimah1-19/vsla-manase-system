import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useLang } from '../context/LangContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Ledger from '../components/Ledger.jsx';
import StatusTag from '../components/StatusTag.jsx';
import Modal from '../components/Modal.jsx';
import Spinner from '../components/Spinner.jsx';
import StatCard from '../components/StatCard.jsx';
import EmptyState from '../components/EmptyState.jsx';
import MemberAvatar from '../components/MemberAvatar.jsx';
import { money, shortDate, dateTime } from '../utils/format.js';
import '../styles.css';

const PAGE_SIZE = 50;
const EMPTY = { type: '', member_id: '', from: '', to: '', status: '', q: '' };

// How a money kind reads on the page.
const KIND_LABEL = {
  savings: 'finance.kindSavings',
  loan: 'finance.kindLoan',
  loan_repayment: 'finance.kindRepayment',
  fine: 'finance.kindFine',
  welfare: 'finance.kindWelfare',
  share_out: 'finance.kindShareout',
  correction: 'finance.kindCorrection',
};

export default function FinancialActivity() {
  const { t } = useLang();
  const { canRecordMoney } = useAuth();
  const toast = useToast();

  const [filters, setFilters] = useState(EMPTY);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);

  // The correction dialog: a NEW record that points back at a wrong one.
  const [correcting, setCorrecting] = useState(null);
  const [correction, setCorrection] = useState({ reason: '', new_value: '' });

  const query = useCallback((forPage) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) p.set(k, v);
    p.set('page', forPage);
    p.set('limit', PAGE_SIZE);
    return p;
  }, [filters]);

  const load = useCallback(async () => {
    setData(await api.get(`/transactions?${query(page)}`));
  }, [query, page]);

  useEffect(() => {
    setData(null);
    load().catch((e) => toast.error(e.message));
  }, [load, refresh, toast]);

  const set = (k, v) => { setPage(1); setFilters((f) => ({ ...f, [k]: v })); };

  async function submitCorrection(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.post('/transactions/corrections', {
        entity_type: correcting.entity_type,
        entity_id: correcting.entity_id,
        reason: correction.reason.trim(),
        new_value: correction.new_value,
      });
      toast.success(res.message);
      setCorrecting(null);
      setCorrection({ reason: '', new_value: '' });
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  // The kind of a feed row maps to the table a correction must point at.
  const CORRECTABLE = {
    savings: 'savings', loan: 'loans', loan_repayment: 'loan_repayments',
    fine: 'fines', welfare: 'welfare_fund', share_out: 'share_out',
  };

  const columns = useMemo(() => {
    if (!data) return [];
    return [
      { key: 'date', label: t('common.date'), render: (r) => shortDate(r.date) },
      { key: 'member', label: t('finance.member'),
        render: (r) => (r.member_id
          ? (
            <span className="vcell">
              <MemberAvatar memberId={r.member_id} hasAvatar={r.has_avatar} name={r.full_name} size={32} />
              <span className="vcell__name">{r.full_name}</span>
            </span>
          )
          : <span className="muted">{t('finance.group')}</span>) },
      { key: 'kind', label: t('finance.type'),
        render: (r) => (
          <StatusTag status={r.kind} tone={r.kind === 'correction' ? 'grey' : 'blue'}>
            {t(KIND_LABEL[r.kind] || r.kind)}
          </StatusTag>
        ) },
      { key: 'amount', label: t('common.amount'), align: 'right', money: true,
        render: (r) => (r.amount == null ? <span className="muted">—</span> : money(r.amount)) },
      { key: 'reference', label: t('finance.reference'), hideOnPhone: true,
        render: (r) => <span className="mono">{r.reference}</span> },
      { key: 'recorded_by_name', label: t('finance.recordedBy'), hideOnPhone: true,
        render: (r) => r.recorded_by_name || <span className="muted">{t('finance.system')}</span> },
      { key: 'status', label: t('common.status'),
        render: (r) => (r.status ? <StatusTag status={r.status} /> : <span className="muted">—</span>) },
      {
        key: 'x', label: '', align: 'right',
        render: (r) => (canRecordMoney && CORRECTABLE[r.kind]
          ? (
            <button type="button" className="btn btn--small btn--ghost"
              onClick={(e) => { e.stopPropagation(); setCorrection({ reason: '', new_value: '' }); setCorrecting(r); }}>
              {t('finance.correct')}
            </button>
          )
          : null),
      },
    ];
  }, [data, t, canRecordMoney]);

  if (!data) return <Spinner />;

  const total = data.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const anyFilter = Object.values(filters).some(Boolean);

  return (
    <div className="finance money-book">
      <PageHeader title={t('finance.title')} subtitle={t('finance.subtitle')} />

      <p className="activity__readonly">{t('finance.integrityNote')}</p>

      <div className="page-grid page-grid--stat">
        <StatCard label={t('finance.entries')} value={total} icon="audit" />
      </div>

      <div className="activity__filters filter-bar">
        <input
          className="activity__search"
          placeholder={t('common.search')}
          value={filters.q}
          onChange={(e) => set('q', e.target.value)}
        />
        <select value={filters.type} onChange={(e) => set('type', e.target.value)} aria-label={t('finance.type')}>
          <option value="">{t('finance.anyType')}</option>
          {data.types.map((k) => <option key={k} value={k}>{t(KIND_LABEL[k] || k)}</option>)}
        </select>
        <select value={filters.member_id} onChange={(e) => set('member_id', e.target.value)} aria-label={t('finance.member')}>
          <option value="">{t('nav.members')}</option>
          {data.members.map((m) => <option key={m.member_id} value={m.member_id}>{m.full_name}</option>)}
        </select>
        <select value={filters.status} onChange={(e) => set('status', e.target.value)} aria-label={t('common.status')}>
          <option value="">{t('finance.anyStatus')}</option>
          {data.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <label className="activity__date">
          <span>{t('finance.from')}</span>
          <input type="date" value={filters.from} onChange={(e) => set('from', e.target.value)} />
        </label>
        <label className="activity__date">
          <span>{t('finance.to')}</span>
          <input type="date" value={filters.to} onChange={(e) => set('to', e.target.value)} />
        </label>
        <button
          type="button"
          className="btn btn--small filter-bar__action filter-bar__apply"
          onClick={() => { setPage(1); setRefresh((n) => n + 1); }}
        >
          {t('common.filter')}
        </button>
        {anyFilter && (
          <button type="button" className="btn btn--ghost btn--small filter-bar__action" onClick={() => { setPage(1); setFilters(EMPTY); }}>
            {t('common.clear')}
          </button>
        )}
      </div>

      {data.rows.length === 0 ? (
        <EmptyState title={t('finance.empty')} />
      ) : (
        <>
          <Ledger columns={columns} rows={data.rows} />
          <div className="activity__pager">
            <button type="button" className="btn btn--ghost btn--small" disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}>{t('activity.previous')}</button>
            <span className="muted">{t('activity.pageOf', page, pages)}</span>
            <button type="button" className="btn btn--ghost btn--small" disabled={page >= pages}
              onClick={() => setPage((p) => Math.min(pages, p + 1))}>{t('activity.next')}</button>
          </div>
        </>
      )}

      <Modal
        open={!!correcting}
        title={t('finance.correctTitle')}
        onClose={() => setCorrecting(null)}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setCorrecting(null)}>{t('common.cancel')}</button>
            <button type="submit" form="correction-form" className="btn" disabled={busy || !correction.reason.trim() || !String(correction.new_value).trim()}>
              {busy ? t('common.saving') : t('common.save')}
            </button>
          </>
        }
      >
        <form id="correction-form" onSubmit={submitCorrection} noValidate>
          <p className="notice">{t('finance.correctNote')}</p>

          {correcting && (
            <dl className="finance__prev">
              <div><dt>{t('finance.type')}</dt><dd>{t(KIND_LABEL[correcting.kind] || correcting.kind)}</dd></div>
              <div><dt>{t('finance.reference')}</dt><dd className="mono">{correcting.reference}</dd></div>
              {correcting.amount != null && (
                <div><dt>{t('finance.previousValue')}</dt><dd className="money">{money(correcting.amount)}</dd></div>
              )}
              <div><dt>{t('finance.recordedBy')}</dt><dd>{correcting.recorded_by_name || t('finance.system')}</dd></div>
              <div><dt>{t('finance.recordedAt')}</dt><dd>{dateTime(correcting.created_at || correcting.date)}</dd></div>
            </dl>
          )}

          <div className="form-row">
            <div>
              <label className="field-label" htmlFor="c-new">{t('finance.newValue')}</label>
              <input id="c-new" value={correction.new_value}
                onChange={(e) => setCorrection((c) => ({ ...c, new_value: e.target.value }))} required />
            </div>
          </div>

          <div className="form-row">
            <div>
              <label className="field-label" htmlFor="c-reason">{t('finance.reason')}</label>
              <textarea id="c-reason" rows={2} value={correction.reason}
                onChange={(e) => setCorrection((c) => ({ ...c, reason: e.target.value }))} required />
              <span className="field-hint">{t('finance.reasonHint')}</span>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
