import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useLang } from '../context/LangContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import '../styles.css';

const NUMBERS = ['loan_multiplier', 'default_interest_rate', 'weekly_share_value', 'welfare_contribution', 'monthly_levy'];
const MEMBERSHIP = ['registration_fee'];
const FINE_RULES = ['absence_fine'];
const CASE_RULES = ['case_voting_days', 'case_quorum_percent', 'case_dismiss_percent'];
const OFFICE_RULES = ['office_voting_days', 'office_quorum_percent'];
const GROUP_LABELS = {
  loan_multiplier: 'settings.loanMultiplier',
  default_interest_rate: 'settings.interestRate',
  weekly_share_value: 'settings.shareValue',
  welfare_contribution: 'settings.welfarePerMeeting',
  monthly_levy: 'settings.monthlyLevy',
  registration_fee: 'settings.registrationFee',
  absence_fine: 'settings.absenceFine',
  case_voting_days: 'settings.caseVotingDays',
  case_quorum_percent: 'settings.caseQuorum',
  case_dismiss_percent: 'settings.caseDismiss',
  office_voting_days: 'settings.officeVotingDays',
  office_quorum_percent: 'settings.officeQuorum',
};
const SYSTEM_LABELS = {
  session_timeout_minutes: 'admin.sessionTimeoutLabel',
  max_login_attempts: 'admin.maxLoginLabel',
  lock_minutes: 'admin.lockLabel',
  reset_max_tries: 'admin.resetTriesLabel',
};
const SYSTEM_ORDER = ['session_timeout_minutes', 'max_login_attempts', 'lock_minutes', 'reset_max_tries'];

/**
 * Everything the group and the system run on, in one place. The administrator
 * looks after every setting here; her save takes effect at once. The chairperson
 * and treasurer keep the books, never these.
 */
export default function SystemSettings() {
  const { t } = useLang();
  const toast = useToast();
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
    setQuestions(parsed.map((q) => ({
      id: q.id || '',
      good: q.good === 'no' ? 'no' : 'yes',
      en: q.en || '',
      ny: q.ny || '',
    })));
    setSystem(Object.fromEntries(sys.map((r) => [r.setting_key, r.setting_value])));
  }, []);

  useEffect(() => { load().catch((e) => toast.error(e.message)); }, [load, toast]);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.put('/settings/group-rules', { ...group, join_screening_questions: JSON.stringify(questions) });
      await api.put('/settings/system', system);
      toast.success(t('admin.saved'));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  function addQuestion() {
    setQuestions((qs) => [...qs, { id: '', good: 'yes', en: '', ny: '' }]);
  }
  function updateQuestion(i, patch) {
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  }
  function removeQuestion(i) {
    setQuestions((qs) => qs.filter((_, idx) => idx !== i));
  }

  if (!group || !system) return <Spinner />;

  const setGroupVal = (k, v) => setGroup((s) => ({ ...s, [k]: v }));
  const setSystemVal = (k, v) => setSystem((s) => ({ ...s, [k]: v }));

  const numberSections = [
    { title: 'loans.title', keys: NUMBERS },
    { title: 'settings.membershipTitle', note: 'settings.membershipNote', keys: MEMBERSHIP },
    { title: 'fines.title', note: 'settings.absenceFineNote', keys: FINE_RULES },
    { title: 'settings.casesTitle', note: 'settings.caseNote', keys: CASE_RULES },
    { title: 'settings.officeTitle', note: 'settings.officeNote', keys: OFFICE_RULES },
  ];

  return (
    <div className="settings">
      <PageHeader title={t('settings.title')} subtitle={t('settings.adminSubtitle')} />

      <form onSubmit={save} className="settings__form">
        {numberSections.map((section) => (
          <section className="settings__group" key={section.title}>
            <h2 className="settings__h2">{t(section.title)}</h2>
            {section.note && <p className="settings__note">{t(section.note)}</p>}
            {section.keys.filter((k) => k in group).map((k) => (
              <div className="settings__row" key={k}>
                <label className="field-label" htmlFor={`set-${k}`}>{t(GROUP_LABELS[k])}</label>
                <input
                  id={`set-${k}`}
                  type="number"
                  min="0"
                  step="any"
                  value={group[k] ?? ''}
                  onChange={(e) => setGroupVal(k, e.target.value)}
                />
              </div>
            ))}
          </section>
        ))}

        <section className="settings__group">
          <h2 className="settings__h2">{t('settings.screeningTitle')}</h2>
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
                  <button type="button" className="btn btn--danger btn--small" onClick={() => removeQuestion(i)}>
                    {t('common.del')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn--ghost" onClick={addQuestion}>{t('settings.screeningAdd')}</button>
        </section>

        <section className="settings__group">
          <h2 className="settings__h2">{t('shareout.title')}</h2>
          <p className="settings__note">
            Savings always go back to the person who saved them. These switches decide
            what else joins the pot that gets split.
          </p>
          {Object.keys(group).filter((k) => k.startsWith('include_')).map((k) => (
            <label className="settings__switch" key={k}>
              <input
                type="checkbox"
                checked={group[k] === 'yes'}
                onChange={(e) => setGroupVal(k, e.target.checked ? 'yes' : 'no')}
              />
              <span>{t(GROUP_LABELS[k] || k)}</span>
            </label>
          ))}
        </section>

        <section className="settings__group">
          <h2 className="settings__h2">{t('admin.systemTitle')}</h2>
          {SYSTEM_ORDER.filter((k) => k in system).map((k) => (
            <div className="settings__row" key={k}>
              <label className="field-label" htmlFor={`sys-${k}`}>{t(SYSTEM_LABELS[k])}</label>
              <input
                id={`sys-${k}`}
                type="number"
                min="1"
                step="1"
                value={system[k] ?? ''}
                onChange={(e) => setSystemVal(k, e.target.value)}
              />
            </div>
          ))}

          <label className="settings__switch">
            <input
              type="checkbox"
              checked={String(system.sms_enabled).toLowerCase() !== 'false'}
              onChange={(e) => setSystemVal('sms_enabled', e.target.checked ? 'true' : 'false')}
            />
            <span>{t('admin.smsLabel')}</span>
          </label>
        </section>

        <button type="submit" className="btn" disabled={busy}>
          {busy ? t('common.saving') : t('common.save')}
        </button>
      </form>
    </div>
  );
}
