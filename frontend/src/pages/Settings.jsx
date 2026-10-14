import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
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
const LABELS = {
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

/** The rules the group agreed on. Only the chairperson can change them. */
export default function Settings() {
  const { t } = useLang();
  const { isAdmin } = useAuth();
  const toast = useToast();

  const [values, setValues] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const rows = await api.get('/settings');
    const map = Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value]));
    setValues(map);
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
  }, []);

  useEffect(() => { load().catch((e) => toast.error(e.message)); }, [load, toast]);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.put('/settings', { ...values, join_screening_questions: JSON.stringify(questions) });
      toast.success(t('settings.saved'));
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

  if (!values) return <Spinner />;

  const set = (k, v) => setValues((s) => ({ ...s, [k]: v }));

  return (
    <div className="settings">
      <PageHeader
        title={t('settings.title')}
        subtitle={isAdmin ? undefined : t('settings.adminOnly')}
      />

      <form onSubmit={save} className="settings__form">
        <section className="settings__group">
          <h2 className="settings__h2">{t('loans.title')}</h2>
          {NUMBERS.filter((k) => k in values).map((k) => (
            <div className="settings__row" key={k}>
              <label className="field-label" htmlFor={`set-${k}`}>{t(LABELS[k])}</label>
              <input
                id={`set-${k}`}
                type="number"
                min="0"
                step="any"
                value={values[k]}
                onChange={(e) => set(k, e.target.value)}
                disabled={!isAdmin}
              />
            </div>
          ))}
        </section>

        <section className="settings__group">
          <h2 className="settings__h2">{t('settings.membershipTitle')}</h2>
          <p className="settings__note">{t('settings.membershipNote')}</p>
          {MEMBERSHIP.filter((k) => k in values).map((k) => (
            <div className="settings__row" key={k}>
              <label className="field-label" htmlFor={`set-${k}`}>{t(LABELS[k])}</label>
              <input
                id={`set-${k}`}
                type="number"
                min="0"
                step="any"
                value={values[k]}
                onChange={(e) => set(k, e.target.value)}
                disabled={!isAdmin}
              />
            </div>
          ))}
        </section>

        <section className="settings__group">
          <h2 className="settings__h2">{t('fines.title')}</h2>
          <p className="settings__note">{t('settings.absenceFineNote')}</p>
          {FINE_RULES.filter((k) => k in values).map((k) => (
            <div className="settings__row" key={k}>
              <label className="field-label" htmlFor={`set-${k}`}>{t(LABELS[k])}</label>
              <input
                id={`set-${k}`}
                type="number"
                min="0"
                step="any"
                value={values[k]}
                onChange={(e) => set(k, e.target.value)}
                disabled={!isAdmin}
              />
            </div>
          ))}
        </section>

        <section className="settings__group">
          <h2 className="settings__h2">{t('settings.casesTitle')}</h2>
          <p className="settings__note">{t('settings.caseNote')}</p>
          {CASE_RULES.filter((k) => k in values).map((k) => (
            <div className="settings__row" key={k}>
              <label className="field-label" htmlFor={`set-${k}`}>{t(LABELS[k])}</label>
              <input
                id={`set-${k}`}
                type="number"
                min="0"
                step="any"
                value={values[k]}
                onChange={(e) => set(k, e.target.value)}
                disabled={!isAdmin}
              />
            </div>
          ))}
        </section>

        <section className="settings__group">
          <h2 className="settings__h2">{t('settings.officeTitle')}</h2>
          <p className="settings__note">{t('settings.officeNote')}</p>
          {OFFICE_RULES.filter((k) => k in values).map((k) => (
            <div className="settings__row" key={k}>
              <label className="field-label" htmlFor={`set-${k}`}>{t(LABELS[k])}</label>
              <input
                id={`set-${k}`}
                type="number"
                min="0"
                step="any"
                value={values[k]}
                onChange={(e) => set(k, e.target.value)}
                disabled={!isAdmin}
              />
            </div>
          ))}
        </section>

        <section className="settings__group">
          <h2 className="settings__h2">{t('settings.screeningTitle')}</h2>
          <p className="settings__note">{t('settings.screeningNote')}</p>
          {questions.length === 0 && <p className="settings__note">{t('settings.screeningEmpty')}</p>}
          <ul className="settings__questions">
            {questions.map((q, i) => (
              <li key={i} className="settings__question">
                <div className="settings__qRow">
                  <label className="field-label">{t('settings.screeningEn')}</label>
                  <input value={q.en} onChange={(e) => updateQuestion(i, { en: e.target.value })} disabled={!isAdmin} />
                </div>
                <div className="settings__qRow">
                  <label className="field-label">{t('settings.screeningNy')}</label>
                  <input value={q.ny} onChange={(e) => updateQuestion(i, { ny: e.target.value })} disabled={!isAdmin} />
                </div>
                <div className="settings__qRow settings__qGood">
                  <label className="field-label">{t('settings.screeningGood')}</label>
                  <select value={q.good} onChange={(e) => updateQuestion(i, { good: e.target.value })} disabled={!isAdmin}>
                    <option value="yes">{t('common.yes')}</option>
                    <option value="no">{t('common.no')}</option>
                  </select>
                  {isAdmin && (
                    <button type="button" className="btn btn--danger btn--small" onClick={() => removeQuestion(i)}>
                      {t('common.del')}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {isAdmin && (
            <button type="button" className="btn btn--ghost" onClick={addQuestion}>{t('settings.screeningAdd')}</button>
          )}
        </section>

        <section className="settings__group">
          <h2 className="settings__h2">{t('shareout.title')}</h2>
          <p className="settings__note">
            Savings always go back to the person who saved them. These switches decide
            what else joins the pot that gets split.
          </p>
          {Object.keys(values).filter((k) => k.startsWith('include_')).map((k) => (
            <label className="settings__switch" key={k}>
              <input
                type="checkbox"
                checked={values[k] === 'yes'}
                onChange={(e) => set(k, e.target.checked ? 'yes' : 'no')}
                disabled={!isAdmin}
              />
              <span>{t(LABELS[k] || k)}</span>
            </label>
          ))}
        </section>

        {isAdmin && (
          <button type="submit" className="btn" disabled={busy}>
            {busy ? t('common.saving') : t('common.save')}
          </button>
        )}
      </form>
    </div>
  );
}
