import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useLang } from '../context/LangContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Ledger from '../components/Ledger.jsx';
import Spinner from '../components/Spinner.jsx';
import EmptyState from '../components/EmptyState.jsx';
import MemberAvatar from '../components/MemberAvatar.jsx';
import { money, shortDate } from '../utils/format.js';
import '../styles.css';

/**
 * The end of the year: work out what everyone is owed, check it, then
 * hand it out — which texts each person their own figure.
 */
export default function ShareOut() {
  const { t } = useLang();
  const { isCommittee, canRecordMoney } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();

  const [preview, setPreview] = useState(null);
  const [history, setHistory] = useState([]);
  const [mine, setMine] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const canRun = canRecordMoney;

  // Her menu can open the share-out on its records or on its history.
  const [params] = useSearchParams();
  const view = params.get('view');
  const showRecords = view !== 'history';
  const showHistory = view !== 'records';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (isCommittee) {
        const [p, h] = await Promise.all([
          api.get('/shareout/preview').catch(() => null),
          api.get('/shareout').catch(() => []),
        ]);
        setPreview(p);
        setHistory(h);
      }
      setMine(await api.get('/shareout/mine').catch(() => null));
    } finally {
      setLoading(false);
    }
  }, [isCommittee]);

  useEffect(() => { load(); }, [load]);

  async function calculate() {
    setBusy(true);
    try {
      const res = await api.post('/shareout');
      toast.success(t('shareout.draftSaved'));
      setHistory(await api.get('/shareout'));
      setPreview({ ...preview, ...res });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function distribute(id) {
    if (!(await confirm({ message: t('shareout.confirmDistribute') }))) return;
    setBusy(true);
    try {
      const res = await api.post(`/shareout/${id}/distribute`);
      toast.success(res.message);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmFigures(id) {
    if (!(await confirm({ message: t('shareout.confirmAsk') }))) return;
    setBusy(true);
    try {
      const res = await api.post(`/shareout/${id}/confirm`);
      toast.success(res.message);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner />;

  // ---- what a plain member sees ----
  if (!isCommittee) {
    return (
      <div className="shareout">
        <PageHeader title={t('shareout.title')} />
        {mine ? (
          <div className="shareout__mine">
            <p className="shareout__mineLabel">
              {mine.status === 'distributed' ? t('dashboard.shareReady') : t('dashboard.myShare')}
            </p>
            <p className="shareout__mineAmount money">{money(mine.share_amount)}</p>
            <dl className="shareout__mineRows">
              <div><dt>{t('shareout.savedByMembers')}</dt><dd className="money">{money(mine.member_savings)}</dd></div>
              <div><dt>{t('shareout.interestBack')}</dt><dd className="money">{money(mine.profit_share)}</dd></div>
              {mine.deductions > 0 && (
                <div><dt>{t('shareout.deductions')}</dt><dd className="money money--neg">-{money(mine.deductions)}</dd></div>
              )}
              {mine.unrecovered > 0 && (
                <div><dt>{t('shareout.unrecovered')}</dt><dd className="money money--neg">{money(mine.unrecovered)}</dd></div>
              )}
            </dl>
            <p className="muted">{t('shareout.rulesShort')}</p>
            {mine.date_distributed && (
              <p className="muted">{shortDate(mine.date_distributed)} — {mine.cycle_name}</p>
            )}
          </div>
        ) : (
          <EmptyState title={t('shareout.empty')} body={t('shareout.memberWait')} />
        )}
      </div>
    );
  }

  // ---- committee view ----
  const b = preview?.breakdown;
  const draft = history.find((h) => h.status === 'draft');
  const confirmed = history.find((h) => h.status === 'confirmed');

  const columns = [
    { key: 'full_name', label: t('common.name'),
      render: (r) => (
        <span className="vcell">
          <MemberAvatar memberId={r.member_id} hasAvatar={r.has_avatar} name={r.full_name} size={32} />
          <span className="vcell__name">{r.full_name}</span>
        </span>
      ) },
    { key: 'member_savings', label: t('shareout.savedByMembers'), align: 'right', money: true,
      render: (r) => money(r.member_savings) },
    { key: 'profit_share', label: t('shareout.interestBack'), align: 'right', money: true, hideOnPhone: true,
      render: (r) => money(r.profit_share) },
    { key: 'deductions', label: t('shareout.deductions'), align: 'right', money: true, hideOnPhone: true,
      render: (r) => (r.deductions > 0 ? <span className="money money--neg">-{money(r.deductions)}</span> : '—') },
    { key: 'unrecovered', label: t('shareout.unrecovered'), align: 'right', money: true, hideOnPhone: true,
      render: (r) => (r.unrecovered > 0 ? <span className="money money--neg">{money(r.unrecovered)}</span> : '—') },
    { key: 'share_amount', label: t('shareout.share'), align: 'right', money: true,
      render: (r) => <strong className="money">{money(r.share_amount)}</strong> },
  ];

  return (
    <div className="shareout">
      <PageHeader
        title={t('shareout.title')}
        subtitle={preview?.cycle?.cycle_name}
        action={canRun && !draft && preview && (
          <button type="button" className="btn" onClick={calculate} disabled={busy}>
            {t('shareout.calculate')}
          </button>
        )}
      />

      {!preview && <EmptyState title={t('shareout.noCycle')} />}

      {preview?.open_loans > 0 && (
        <p className="notice notice--warn">{t('shareout.openLoans', preview.open_loans)}</p>
      )}

      <p className="notice">{t('shareout.rulesBox')}</p>

      {b && (
        <section className="shareout__breakdown">
          <h2 className="shareout__h2">{t('shareout.breakdown')}</h2>
          <dl className="shareout__rows">
            <div>
              <dt>{t('shareout.savedByMembers')}</dt>
              <dd className="money">{money(b.total_savings)}</dd>
            </div>
            <div>
              <dt>{t('shareout.interestReturned')}</dt>
              <dd className="money">{money(b.interest_returned)}</dd>
            </div>
            <div>
              <dt>{t('shareout.deductionsTotal')}</dt>
              <dd className="money money--neg">-{money(b.deductions)}</dd>
            </div>
            <div className="is-total">
              <dt>{t('shareout.totalPayout')}</dt>
              <dd className="money">{money(b.total_payout)}</dd>
            </div>
          </dl>

          <h3 className="shareout__h3">{t('shareout.keptTitle')}</h3>
          <dl className="shareout__rows">
            {[['finesKept', b.fines_kept], ['welfareKept', b.welfare_kept], ['wrappersKept', b.wrappers_kept]].map(([k, v]) => (
              <div key={k} className="is-excluded">
                <dt>{t(`shareout.${k}`)}<span className="shareout__excluded">{t('shareout.notShared')}</span></dt>
                <dd className="money">{money(v)}</dd>
              </div>
            ))}
          </dl>
          {b.unrecovered > 0 && (
            <p className="notice notice--warn">{t('shareout.unrecoveredNote', money(b.unrecovered))}</p>
          )}
        </section>
      )}

      {canRun && draft && (
        <div className="shareout__draft">
          <p>{t('shareout.awaitConfirm')}</p>
          <button type="button" className="btn btn--gold" onClick={() => confirmFigures(draft.id)} disabled={busy}>
            {busy ? t('common.saving') : t('shareout.confirmFigures')}
          </button>
        </div>
      )}

      {confirmed && (
        <div className="shareout__draft shareout__draft--ok">
          <p>{confirmed.confirmed_by_name
            ? t('shareout.confirmedBy', confirmed.confirmed_by_name)
            : t('shareout.confirmedTag')}</p>
          {canRun && (
            <button type="button" className="btn btn--gold" onClick={() => distribute(confirmed.id)} disabled={busy}>
              {busy ? t('common.sending') : t('shareout.distribute')}
            </button>
          )}
        </div>
      )}

      {showRecords && preview?.shares?.length > 0 && (
        <>
          <h2 className="shareout__h2">{t('shareout.perMember')}</h2>
          <Ledger columns={columns} rows={preview.shares} keyField="member_id" />
        </>
      )}

      {showHistory && history.length > 0 && (
        <section className="shareout__history">
          <h2 className="shareout__h2">{t('common.total')}</h2>
          <ul className="shareout__historyList">
            {history.map((h) => (
              <li key={h.id}>
                <span>{h.cycle_name || `#${h.id}`}</span>
                <span className={
                  h.status === 'distributed' ? 'tag tag--green'
                    : h.status === 'confirmed' ? 'tag tag--blue' : 'tag tag--gold'
                }>
                  {h.status === 'distributed' ? shortDate(h.date_distributed)
                    : h.status === 'confirmed' ? t('shareout.confirmedTag') : 'draft'}
                </span>
                <span className="money">{money(h.total_fund)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
