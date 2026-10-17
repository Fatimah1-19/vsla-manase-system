import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useLang } from '../context/LangContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { shortDate, dateTime } from '../utils/format.js';
import '../styles.css';

/** A friendly line for one value in a group-rule change. */
function payloadValue(key, value) {
  if (key === 'join_screening_questions') {
    try {
      const list = JSON.parse(value);
      return Array.isArray(list) ? `${list.length}` : String(value);
    } catch { return String(value); }
  }
  return String(value);
}

/**
 * What is waiting to be confirmed. The chairperson confirms the account and
 * group-rule changes the administrator asked for; the treasurer confirms the
 * group-rule changes the chairperson asks for.
 */
export default function Approvals() {
  const { t } = useLang();
  const toast = useToast();
  const confirm = useConfirm();

  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => { setData(await api.get('/approvals')); }, []);
  useEffect(() => { load().catch((e) => toast.error(e.message)); }, [load, toast]);

  async function decideChange(id, decision) {
    const ask = decision === 'approve' ? t('admin.approve') : t('admin.reject');
    if (!(await confirm({ message: `${ask}?` }))) return;
    setBusy(true);
    try {
      await api.post(`/approvals/${id}/decide`, { decision });
      toast.success(decision === 'approve' ? t('admin.confirmed') : t('admin.rejectedNote'));
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <Spinner />;

  const pending = data.pending || [];
  const history = data.history || [];

  return (
    <div className="approvals">
      <PageHeader title={t('admin.approvals')} subtitle={t('admin.approvalsSubtitle')} />

      {pending.length === 0 ? (
        <EmptyState title={t('admin.nothingWaiting')} />
      ) : (
        <ul className="approvals__list">
          {pending.map((r) => (
            <li key={r.id} className="approvals__card">
              <header className="approvals__head">
                <h2 className="approvals__kind">{t(`admin.kind_${r.kind}`)}</h2>
                <span className="muted">{shortDate(r.created_at)}</span>
              </header>

              <p className="approvals__line">
                <span className="approvals__label">{t('admin.requestedBy')}</span> {r.requested_by_name || '—'}
                {r.target_name ? <> · <span className="approvals__label">{t('admin.target')}</span> {r.target_name}</> : null}
              </p>

              {r.reason && <p className="approvals__reason">{r.reason}</p>}

              {r.kind === 'group_rules' ? (
                <div className="approvals__payload">
                  <p className="approvals__payloadTitle">{t('admin.groupRulesPending')}</p>
                  <ul className="approvals__payloadList">
                    {Object.entries(r.payload || {}).map(([k, v]) => (
                      <li key={k}><span className="muted">{k}</span> <strong>{payloadValue(k, v)}</strong></li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="approvals__payload">
                  {Object.keys(r.payload || {}).length === 0 ? (
                    <p className="muted">{t('admin.noPayload')}</p>
                  ) : (
                    <ul className="approvals__payloadList">
                      {Object.entries(r.payload).map(([k, v]) => (
                        <li key={k}><span className="muted">{k}</span> <strong>{String(v)}</strong></li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className="approvals__actions">
                <button type="button" className="btn" disabled={busy} onClick={() => decideChange(r.id, 'approve')}>
                  {t('admin.approve')}
                </button>
                <button type="button" className="btn btn--danger" disabled={busy} onClick={() => decideChange(r.id, 'reject')}>
                  {t('admin.reject')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {history.length > 0 && (
        <section className="approvals__history">
          <h2 className="dash__sectionTitle">{t('admin.decidedAlready')}</h2>
          <ul className="approvals__historyList">
            {history.map((r) => (
              <li key={r.id}>
                <span>{t(`admin.kind_${r.kind}`)}{r.target_name ? ` · ${r.target_name}` : ''}</span>
                <span className={`tag ${r.status === 'approved' ? 'tag--green' : 'tag--grey'}`}>
                  {t(`admin.status${r.status.charAt(0).toUpperCase()}${r.status.slice(1)}`)}
                </span>
                <span className="muted">{r.decided_at ? dateTime(r.decided_at) : ''}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
