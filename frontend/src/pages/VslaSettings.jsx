import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { useLang } from '../context/LangContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import { GROUP_LABELS } from '../utils/groupRuleLabels.js';
import '../styles.css';

// The VSLA settings, in the order the group reads them.
const CATEGORIES = [
  ['group', 'settings.catGroupInfo'], ['savings', 'settings.catSavings'], ['loans', 'settings.catLoans'],
  ['fines', 'settings.catFines'], ['welfare', 'settings.catWelfare'], ['shareout', 'settings.catShareout'],
  ['membership', 'settings.catMembership'], ['voting', 'settings.catVoting'], ['meetings', 'settings.catMeetings'],
  ['sms', 'settings.catSms'],
];

/**
 * The rules the group lives by. The administrator proposes a change; the
 * chairperson confirms it. Text messages are the administrator's own switch and
 * take effect at once.
 */
export default function VslaSettings() {
  const { t } = useLang();
  const toast = useToast();
  const [params] = useSearchParams();
  const [cat, setCat] = useState(params.get('cat') || 'group');

  const [group, setGroup] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [system, setSystem] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [rows, sys] = await Promise.all([api.get('/settings/group-rules'), api.get('/settings/system')]);
    const map = Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value]));
    setGroup(map);
    let parsed = [];
    try {
      const p = JSON.parse(map.join_screening_questions || '[]');
      if (Array.isArray(p)) parsed = p;
    } catch { parsed = []; }
    setQuestions(parsed.map((q) => ({ id: q.id || '', good: q.good === 'no' ? 'no' : 'yes', en: q.en || '', ny: q.ny || '' })));
    setSystem(Object.fromEntries(sys.map((r) => [r.setting_key, r.setting_value])));
  }, []);

  useEffect(() => { load().catch((e) => toast.error(e.message)); }, [load, toast]);

  async function propose(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.put('/settings/group-rules', { ...group, join_screening_questions: JSON.stringify(questions) });
      toast.success(res.message || t('settings.proposedToChair'));
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveSms(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.put('/settings/system', { sms_enabled: system.sms_enabled });
      toast.success(t('admin.saved'));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  function addQuestion() { setQuestions((qs) => [...qs, { id: '', good: 'yes', en: '', ny: '' }]); }
  function updateQuestion(i, patch) { setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q))); }
  function removeQuestion(i) { setQuestions((qs) => qs.filter((_, j) => j !== i)); }

  if (!group || !system) return <Spinner />;

  const setGroupVal = (k, v) => setGroup((g) => ({ ...g, [k]: v }));
  const num = (k) => (
    <div className="settings__row" key={k}>
      <label className="field-label" htmlFor={`set-${k}`}>{t(GROUP_LABELS[k] || k)}</label>
      <input id={`set-${k}`} type="number" min="0" step="any" value={group[k] ?? ''} onChange={(e) => setGroupVal(k, e.target.value)} />
    </div>
  );

  return (
    <div className="settings">
      <PageHeader title={t('nav.vslaSettings')} subtitle={t('settings.vslaSubtitle')} />

      <nav className="settings__cats" aria-label={t('nav.vslaSettings')}>
        {CATEGORIES.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={cat === id ? 'settings__cat is-on' : 'settings__cat'}
            onClick={() => setCat(id)}
          >
            {t(label)}
          </button>
        ))}
      </nav>

      {cat !== 'sms' && (
        <form onSubmit={propose} className="settings__form">
          <p className="settings__note">{t('settings.proposedToChairNote')}</p>

          {cat === 'group' && (
            <section className="settings__group">
              <h2 className="settings__h2">{t('settings.catGroupInfo')}</h2>
              <p className="settings__note">{t('settings.groupInfoNote')}</p>
              <ul className="sysadmin__settings">
                <li><span>{t('app.name')}</span><strong>{t('app.tagline')}</strong></li>
              </ul>
            </section>
          )}

          {cat === 'savings' && (
            <section className="settings__group">
              <h2 className="settings__h2">{t('settings.catSavings')}</h2>
              <p className="settings__note">{t('settings.savingsNote')}</p>
              {num('weekly_share_value')}
            </section>
          )}

          {cat === 'loans' && (
            <section className="settings__group">
              <h2 className="settings__h2">{t('settings.catLoans')}</h2>
              <p className="settings__note">{t('settings.loansNote')}</p>
              {['loan_multiplier', 'default_interest_rate'].map(num)}
            </section>
          )}

          {cat === 'fines' && (
            <section className="settings__group">
              <h2 className="settings__h2">{t('settings.catFines')}</h2>
              <p className="settings__note">{t('settings.absenceFineNote')}</p>
              {num('absence_fine')}
            </section>
          )}

          {cat === 'welfare' && (
            <section className="settings__group">
              <h2 className="settings__h2">{t('settings.catWelfare')}</h2>
              {num('welfare_contribution')}
            </section>
          )}

          {cat === 'shareout' && (
            <section className="settings__group">
              <h2 className="settings__h2">{t('settings.catShareout')}</h2>
              <p className="settings__note">{t('settings.shareoutNote')}</p>
              {['include_interest_in_shareout', 'include_fines_in_shareout', 'include_welfare_in_shareout']
                .filter((k) => k in group)
                .map((k) => (
                  <label className="settings__switch" key={k}>
                    <input type="checkbox" checked={group[k] === 'yes'} onChange={(e) => setGroupVal(k, e.target.checked ? 'yes' : 'no')} />
                    <span>{t(GROUP_LABELS[k] || k)}</span>
                  </label>
                ))}
            </section>
          )}

          {cat === 'membership' && (
            <section className="settings__group">
              <h2 className="settings__h2">{t('settings.catMembership')}</h2>
              {num('registration_fee')}
              <h3 className="settings__h2">{t('settings.screeningTitle')}</h3>
              <p className="settings__note">{t('settings.screeningNote')}</p>
              {questions.length === 0 && <p className="settings__note">{t('settings.screeningEmpty')}</p>}
              <ul className="settings__questions">
                {questions.map((q, i) => (
                  <li key={i} className="settings__question">
                    <div className="settings__qRow">
                      <label className="field-label">{t('settings.screeningEn')}</label>
                      <input value={q.en} onChange={(e) => updateQuestion(i, { en: e.target.value })} />
                    </div>
                    <div className="settings__qRow">
                      <label className="field-label">{t('settings.screeningNy')}</label>
                      <input value={q.ny} onChange={(e) => updateQuestion(i, { ny: e.target.value })} />
                    </div>
                    <div className="settings__qRow settings__qGood">
                      <label className="field-label">{t('settings.screeningGood')}</label>
                      <select value={q.good} onChange={(e) => updateQuestion(i, { good: e.target.value })}>
                        <option value="yes">{t('common.yes')}</option>
                        <option value="no">{t('common.no')}</option>
                      </select>
                      <button type="button" className="btn btn--danger btn--small" onClick={() => removeQuestion(i)}>{t('common.del')}</button>
                    </div>
                  </li>
                ))}
              </ul>
              <button type="button" className="btn btn--ghost" onClick={addQuestion}>{t('settings.screeningAdd')}</button>
            </section>
          )}

          {cat === 'voting' && (
            <section className="settings__group">
              <h2 className="settings__h2">{t('settings.catVoting')}</h2>
              <p className="settings__note">{t('settings.caseNote')}</p>
              {['case_voting_days', 'case_quorum_percent', 'case_dismiss_percent'].map(num)}
              <p className="settings__note">{t('settings.officeNote')}</p>
              {['office_voting_days', 'office_quorum_percent'].map(num)}
            </section>
          )}

          {cat === 'meetings' && (
            <section className="settings__group">
              <h2 className="settings__h2">{t('settings.catMeetings')}</h2>
              <p className="settings__note">{t('settings.absenceFineNote')}</p>
            </section>
          )}

          {cat !== 'group' && cat !== 'meetings' && (
            <button type="submit" className="btn" disabled={busy}>
              {busy ? t('common.saving') : t('settings.proposeToChair')}
            </button>
          )}
        </form>
      )}

      {cat === 'sms' && (
        <form onSubmit={saveSms} className="settings__form">
          <section className="settings__group">
            <h2 className="settings__h2">{t('settings.catSms')}</h2>
            <p className="settings__note">{t('settings.smsNote')}</p>
            <label className="settings__switch">
              <input
                type="checkbox"
                checked={String(system.sms_enabled).toLowerCase() !== 'false'}
                onChange={(e) => setSystem((s) => ({ ...s, sms_enabled: e.target.checked ? 'true' : 'false' }))}
              />
              <span>{t('admin.smsLabel')}</span>
            </label>
          </section>
          <button type="submit" className="btn" disabled={busy}>
            {busy ? t('common.saving') : t('common.save')}
          </button>
        </form>
      )}
    </div>
  );
}
