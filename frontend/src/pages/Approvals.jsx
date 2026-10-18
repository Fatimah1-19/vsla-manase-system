import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useLang } from '../context/LangContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { shortDate, dateTime, money } from '../utils/format.js';
import { GROUP_LABELS, SECTION_KEYS, CATEGORY_ORDER } from '../utils/groupRuleLabels.js';
import '../styles.css';

const MONEY_KEYS = new Set(['weekly_share_value', 'monthly_levy', 'welfare_contribution', 'registration_fee', 'absence_fine']);
const PERCENT_KEYS = new Set(['default_interest_rate', 'case_quorum_percent', 'case_dismiss_percent', 'office_quorum_percent']);
const isSet = (v) => v !== undefined && v !== null && String(v).trim() !== '';

// Which category each setting belongs to, built from the settings page map.
const KEY_CAT = {};
for (const [cat, keys] of Object.entries(SECTION_KEYS)) {
  for (const k of keys) KEY_CAT[k] = cat;
}

/** A friendly line for one value that is not a group rule. */
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
 * VSLA SETTINGS APPROVAL: what the administrator has proposed and the
 * chairperson must confirm or reject — one row per setting with the value
 * now, the value asked for, who asked, when, and what is still pending.
 */
export default function Approvals() {
  const { t } = useLang();
  const toast = useToast();
  const confirm = useConfirm();

  const [data, setData] = useState(null);
  const [current, setCurrent] = useState({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [d, rules] = await Promise.all([
      api.get('/approvals'),
      api.get('/settings/group-rules').catch(() => []),
    ]);
    setData(d);
    setCurrent(Object.fromEntries((rules || []).map((r) => [r.setting_key, r.setting_value])));
  }, []);
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

  // A rule value, shown the way the group reads it.
  const fmtVal = (key, val) => {
    if (!isSet(val)) return '—';
    if (key === 'join_screening_questions') {
      let n = 0;
      try { const a = JSON.parse(val); n = Array.isArray(a) ? a.length : 0; } catch { n = 0; }
      return t('settings.questionCount', n);
    }
    if (key.startsWith('include_')) return val === 'yes' ? t('common.yes') : t('common.no');
    if (key === 'loan_multiplier') return `${val} × ${t('settings.savingsWord')}`;
    if (MONEY_KEYS.has(key)) return money(Number(val || 0));
    if (PERCENT_KEYS.has(key)) return `${val}%`;
    return String(val);
  };

  // The proposed settings, grouped under their category heading.
  const groupedPayload = (payload) => {
    const cats = new Map();
    for (const [k, v] of Object.entries(payload || {})) {
      const cat = KEY_CAT[k] || 'other';
      if (!cats.has(cat)) cats.set(cat, []);
      cats.get(cat).push([k, v]);
    }
    const ordered = [
      ...CATEGORY_ORDER.filter((c) => cats.has(c)),
      ...[...cats.keys()].filter((c) => !CATEGORY_ORDER.includes(c)),
    ];
    return ordered.map((c) => [c, cats.get(c)]);
  };

  const catTitle = (id) => (id === 'other'
    ? t('admin.otherSettings')
    : t(`settings.cat${id.charAt(0).toUpperCase()}${id.slice(1)}`));

  if (!data) return <Spinner />;

  const pending = data.pending || [];
  const history = data.history || [];

  return (
    <div className="approvals">
      <PageHeader title={t('nav.settingsApproval')} subtitle={t('admin.approvalsSubtitle')} />

      {pending.length === 0 ? (
        <EmptyState title={t('admin.nothingWaiting')} />
      ) : (
        <ul className="approvals__list">
          {pending.map((r) => (
            <li key={r.id} className="approvals__card">
              <header className="approvals__head">
                <h2 className="approvals__kind">{t(`admin.kind_${r.kind}`)}</h2>
                <span className="tag tag--gold">
                  {r.approver_role === 'admin' ? t('admin.pendingChair') : t('admin.pendingTreasurer')}
                </span>
                <span className="muted">{t('admin.requestedOn')}: {shortDate(r.created_at)}</span>
              </header>

              <p className="approvals__line">
                <span className="approvals__label">{t('admin.requestedBy')}</span> {r.requested_by_name || '—'}
                {r.target_name ? <> · <span className="approvals__label">{t('admin.target')}</span> {r.target_name}</> : null}
              </p>

              {r.reason && <p className="approvals__reason">{r.reason}</p>}

              {r.kind === 'group_rules' ? (
                <div className="approvals__payload">
                  {groupedPayload(r.payload).map(([cat, entries]) => (
                    <div key={cat} className="approvals__cat">
                      <h3 className="approvals__catTitle">{catTitle(cat)}</h3>
                      <ul className="approvals__payloadList">
                        {entries.map(([k, v]) => (
                          <li key={k} className="approvals__rule">
                            <span className="approvals__setting">{t(GROUP_LABELS[k] || k)}</span>
                            <span className="approvals__values">
                              <span className="muted">{t('admin.currentValue')}: {fmtVal(k, current[k])}</span>
                              <span>{t('admin.proposedValue')}: <strong>{fmtVal(k, v)}</strong></span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
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
