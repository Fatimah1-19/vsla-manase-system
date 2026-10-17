import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { useLang } from '../context/LangContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import { money } from '../utils/format.js';
import { GROUP_LABELS } from '../utils/groupRuleLabels.js';
import '../styles.css';

// Each category lives on its own page, in the order the group reads them.
const SECTIONS = [
  { id: 'general', label: 'settings.catGroupInfo', note: 'settings.groupInfoNote' },
  { id: 'savings', label: 'settings.catSavings', note: 'settings.savingsNote' },
  { id: 'loans', label: 'settings.catLoans', note: 'settings.loansNote' },
  { id: 'fines', label: 'settings.catFines', note: 'settings.fineSubtitle' },
  { id: 'welfare', label: 'settings.catWelfare', note: 'settings.welfareNote' },
  { id: 'shareout', label: 'settings.catShareout', note: 'settings.shareoutNote' },
  { id: 'membership', label: 'settings.catMembership', note: 'settings.membershipNote' },
  { id: 'voting', label: 'settings.catVoting', note: 'settings.votingNote' },
  { id: 'meetings', label: 'settings.catMeetings', note: 'settings.meetingsNote' },
  { id: 'sms', label: 'settings.catSms', note: 'settings.smsNote' },
];

// Which group-rule settings belong on which page, and how they are shown.
const NUM_FIELDS = {
  savings: ['weekly_share_value', 'monthly_levy'],
  loans: ['loan_multiplier', 'default_interest_rate'],
  fines: ['absence_fine'],
  welfare: ['welfare_contribution'],
  voting: ['case_voting_days', 'case_quorum_percent', 'case_dismiss_percent', 'office_voting_days', 'office_quorum_percent'],
  membership: ['registration_fee'],
};
const SWITCH_FIELDS = {
  shareout: ['include_interest_in_shareout', 'include_fines_in_shareout', 'include_welfare_in_shareout'],
};

const STATUS_TAG = {
  in_force: 'tag--green', waiting: 'tag--gold', not_set: 'tag--grey', fixed: 'tag--grey', off: 'tag--grey',
};

/**
 * The VSLA settings, one dedicated page per category. The administrator reads the
 * current value of every rule and proposes a change; the chairperson confirms it.
 * Text messages are her own switch and take effect at once.
 */
export default function VslaSettings() {
  const { t } = useLang();
  const toast = useToast();
  const { section: routeSection } = useParams();
  const section = SECTIONS.find((s) => s.id === routeSection);

  const [group, setGroup] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [system, setSystem] = useState(null);
  const [pendingKeys, setPendingKeys] = useState(() => new Set());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [rows, sys, changes] = await Promise.all([
      api.get('/settings/group-rules'),
      api.get('/settings/system'),
      api.get('/admin/config-changes').catch(() => []),
    ]);
    const map = Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value]));
    setGroup(map);
    let parsed = [];
    try {
      const p = JSON.parse(map.join_screening_questions || '[]');
      if (Array.isArray(p)) parsed = p;
    } catch { parsed = []; }
    setQuestions(parsed.map((q) => ({ id: q.id || '', good: q.good === 'no' ? 'no' : 'yes', en: q.en || '', ny: q.ny || '' })));
    setSystem(Object.fromEntries(sys.map((r) => [r.setting_key, r.setting_value])));
    const keys = new Set();
    for (const c of (changes || [])) {
      if (c.status === 'pending' && c.payload) Object.keys(c.payload).forEach((k) => keys.add(k));
    }
    setPendingKeys(keys);
  }, []);

  useEffect(() => { load().catch((e) => toast.error(e.message)); }, [load, toast]);

  async function propose(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = {};
      for (const k of (NUM_FIELDS[section.id] || [])) payload[k] = group[k];
      for (const k of (SWITCH_FIELDS[section.id] || [])) payload[k] = group[k];
      if (section.id === 'membership') payload.join_screening_questions = JSON.stringify(questions);
      const res = await api.put('/settings/group-rules', payload);
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
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  function addQuestion() {
    setQuestions((q) => [...q, { id: '', good: 'yes', en: '', ny: '' }]);
  }
  function updateQuestion(i, patch) { setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q))); }
  function removeQuestion(i) { setQuestions((qs) => qs.filter((_, j) => j !== i)); }

  if (!section) return <Navigate to="/app/admin/settings/general" replace />;
  if (!group || !system) return <Spinner />;

  const setGroupVal = (k, v) => setGroup((g) => ({ ...g, [k]: v }));
  const isSet = (v) => v !== undefined && v !== null && String(v).trim() !== '';
  const money0 = (v) => (isSet(v) ? money(Number(v || 0)) : '—');
  const statusOf = (key, present) => {
    if (pendingKeys.has(key)) return { status: t('settings.stWaiting'), tag: STATUS_TAG.waiting };
    if (!present) return { status: t('settings.stNotSet'), tag: STATUS_TAG.not_set };
    return { status: t('settings.stInForce'), tag: STATUS_TAG.in_force };
  };
  const fixed = () => ({ status: t('settings.stFixed'), tag: STATUS_TAG.fixed });

  const numFields = NUM_FIELDS[section.id] || [];
  const swFields = SWITCH_FIELDS[section.id] || [];
  const editable = numFields.length > 0 || swFields.length > 0 || section.id === 'membership';
  const changeLink = (key) => (
    <a className="btn btn--ghost btn--small" href={`#edit-${key}`}>{t('settings.change')}</a>
  );

  return (
    <div className="settings">
      <PageHeader title={t('nav.vslaSettings')} subtitle={t('settings.vslaSubtitle')} />

      <nav className="settings__cats" aria-label={t('nav.vslaSettings')}>
        {SECTIONS.map((s) => (
          <Link
            key={s.id}
            to={`/app/admin/settings/${s.id}`}
            className={section.id === s.id ? 'settings__cat is-on' : 'settings__cat'}
          >
            {t(s.label)}
          </Link>
        ))}
      </nav>

      <div className="settings__group">
        <h2 className="settings__h2">{t(section.label)}</h2>
        <p className="settings__note">{t(section.note)}</p>

        {/* ---- what the rules say right now ---- */}
        {section.id === 'general' && (
          <ul className="sysadmin__settings">
            <li><span>{t('settings.groupName')}</span><strong>{t('app.name')}</strong></li>
            <li><span>{t('settings.groupSlogan')}</span><strong>{t('app.tagline')}</strong></li>
            <li><span>{t('settings.groupLocation')}</span><strong>{t('settings.groupLocationValue')}</strong></li>
            <li><span>{t('settings.groupContact')}</span><strong>{t('settings.groupContactValue')}</strong></li>
          </ul>
        )}

        {section.id === 'fines' ? (
          <div className="settings__tableWrap">
            <table className="sysadmin__table">
              <thead>
                <tr>
                  <th>{t('settings.tblType')}</th>
                  <th>{t('settings.tblAmount')}</th>
                  <th>{t('settings.tblDescription')}</th>
                  <th>{t('settings.tblStatus')}</th>
                  <th>{t('settings.tblActions')}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{t('settings.fineTypeAbsence')}</td>
                  <td>{money0(group.absence_fine)}</td>
                  <td className="settings__desc">{t('settings.absenceFineNote')}</td>
                  <td>
                    <span className={`tag ${!isSet(group.absence_fine) ? STATUS_TAG.not_set : Number(group.absence_fine) > 0 ? STATUS_TAG.in_force : STATUS_TAG.off}`}>
                      {!isSet(group.absence_fine) ? t('settings.stNotSet') : Number(group.absence_fine) > 0 ? t('settings.stActive') : t('settings.stOff')}
                    </span>
                  </td>
                  <td>{changeLink('absence_fine')}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : section.id !== 'general' && section.id !== 'meetings' && section.id !== 'sms' && (
          <div className="settings__tableWrap">
            <table className="sysadmin__table">
              <thead>
                <tr>
                  <th>{t('settings.tblSetting')}</th>
                  <th>{t('settings.tblCurrent')}</th>
                  <th>{t('settings.tblStatus')}</th>
                  <th>{t('settings.tblActions')}</th>
                </tr>
              </thead>
              <tbody>
                {section.id === 'savings' && (
                  <>
                    <tr>
                      <td>{t('settings.shareValue')}</td>
                      <td>{money0(group.weekly_share_value)}</td>
                      <td><span className={`tag ${statusOf('weekly_share_value', isSet(group.weekly_share_value)).tag}`}>{statusOf('weekly_share_value', isSet(group.weekly_share_value)).status}</span></td>
                      <td>{changeLink('weekly_share_value')}</td>
                    </tr>
                    <tr>
                      <td>{t('settings.monthlyLevy')}</td>
                      <td>{money0(group.monthly_levy)}</td>
                      <td><span className={`tag ${statusOf('monthly_levy', isSet(group.monthly_levy)).tag}`}>{statusOf('monthly_levy', isSet(group.monthly_levy)).status}</span></td>
                      <td>{changeLink('monthly_levy')}</td>
                    </tr>
                    <tr>
                      <td>{t('settings.savingsFrequency')}</td>
                      <td>{t('settings.savingsFrequencyValue')}</td>
                      <td><span className={`tag ${fixed().tag}`}>{fixed().status}</span></td>
                      <td>—</td>
                    </tr>
                  </>
                )}

                {section.id === 'loans' && (
                  <>
                    <tr>
                      <td>{t('settings.interestRate')}</td>
                      <td>{isSet(group.default_interest_rate) ? `${group.default_interest_rate}%` : '—'}</td>
                      <td><span className={`tag ${statusOf('default_interest_rate', isSet(group.default_interest_rate)).tag}`}>{statusOf('default_interest_rate', isSet(group.default_interest_rate)).status}</span></td>
                      <td>{changeLink('default_interest_rate')}</td>
                    </tr>
                    <tr>
                      <td>{t('settings.borrowLimit')}</td>
                      <td>{isSet(group.loan_multiplier) ? `${group.loan_multiplier} × ${t('settings.savingsWord')}` : '—'}</td>
                      <td><span className={`tag ${statusOf('loan_multiplier', isSet(group.loan_multiplier)).tag}`}>{statusOf('loan_multiplier', isSet(group.loan_multiplier)).status}</span></td>
                      <td>{changeLink('loan_multiplier')}</td>
                    </tr>
                    <tr>
                      <td>{t('settings.loanRepayPeriod')}</td>
                      <td>{t('settings.loanRepayPeriodValue')}</td>
                      <td><span className={`tag ${fixed().tag}`}>{fixed().status}</span></td>
                      <td>—</td>
                    </tr>
                    <tr>
                      <td>{t('settings.loanRepayFreq')}</td>
                      <td>{t('settings.loanRepayFreqValue')}</td>
                      <td><span className={`tag ${fixed().tag}`}>{fixed().status}</span></td>
                      <td>—</td>
                    </tr>
                  </>
                )}

                {section.id === 'welfare' && (
                  <>
                    <tr>
                      <td>{t('settings.welfarePerMeeting')}</td>
                      <td>{money0(group.welfare_contribution)}</td>
                      <td><span className={`tag ${statusOf('welfare_contribution', isSet(group.welfare_contribution)).tag}`}>{statusOf('welfare_contribution', isSet(group.welfare_contribution)).status}</span></td>
                      <td>{changeLink('welfare_contribution')}</td>
                    </tr>
                    <tr>
                      <td>{t('settings.welfareFreq')}</td>
                      <td>{t('settings.welfareFreqValue')}</td>
                      <td><span className={`tag ${fixed().tag}`}>{fixed().status}</span></td>
                      <td>—</td>
                    </tr>
                  </>
                )}

                {section.id === 'shareout' && (
                  <>
                    {swFields.map((k) => (
                      <tr key={k}>
                        <td>{t(GROUP_LABELS[k] || k)}</td>
                        <td>{group[k] === 'yes' ? t('common.yes') : t('common.no')}</td>
                        <td><span className={`tag ${statusOf(k, true).tag}`}>{statusOf(k, true).status}</span></td>
                        <td>{changeLink(k)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td>{t('settings.shareoutCycle')}</td>
                      <td>{t('settings.shareoutCycleValue')}</td>
                      <td><span className={`tag ${fixed().tag}`}>{fixed().status}</span></td>
                      <td>—</td>
                    </tr>
                    <tr>
                      <td>{t('settings.shareoutInterest')}</td>
                      <td>{t('settings.shareoutInterestValue')}</td>
                      <td><span className={`tag ${fixed().tag}`}>{fixed().status}</span></td>
                      <td>—</td>
                    </tr>
                  </>
                )}

                {section.id === 'voting' && numFields.map((k) => (
                  <tr key={k}>
                    <td>{t(GROUP_LABELS[k] || k)}</td>
                    <td>{isSet(group[k]) ? group[k] : '—'}</td>
                    <td><span className={`tag ${statusOf(k, isSet(group[k])).tag}`}>{statusOf(k, isSet(group[k])).status}</span></td>
                    <td>{changeLink(k)}</td>
                  </tr>
                ))}

                {section.id === 'membership' && (
                  <tr>
                    <td>{t('settings.registrationFee')}</td>
                    <td>{money0(group.registration_fee)}</td>
                    <td><span className={`tag ${statusOf('registration_fee', isSet(group.registration_fee)).tag}`}>{statusOf('registration_fee', isSet(group.registration_fee)).status}</span></td>
                    <td>{changeLink('registration_fee')}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ---- meetings: nothing of its own ---- */}
        {section.id === 'meetings' && (
          <div className="settings__groupCard">
            <p className="settings__note">{t('settings.meetingsNoSettings')}</p>
            <ul className="sysadmin__settings">
              <li><span>{t('settings.absenceFine')}</span><strong>{money0(group.absence_fine)}</strong></li>
            </ul>
            <p className="settings__note">
              {t('settings.meetingsFineRef')} <Link to="/app/admin/settings/fines">{t('settings.catFines')}</Link>
            </p>
          </div>
        )}

        {/* ---- membership: how a new member joins (read-only) ---- */}
        {section.id === 'membership' && (
          <div className="settings__groupCard">
            <h3 className="settings__h2">{t('settings.workflowTitle')}</h3>
            <ol className="settings__flow">
              {t('settings.workflowSteps').map((step, i) => <li key={i}>{step}</li>)}
            </ol>
            <p className="notice notice--warn">{t('settings.adminCannotDecide')}</p>
            <p className="settings__note">{t('settings.adminAsMember')}</p>
          </div>
        )}

        {/* ---- propose a change ---- */}
        {editable && section.id !== 'sms' && (
          <form onSubmit={propose} className="settings__form" id="settingsEdit">
            <p className="settings__note">{t('settings.proposedToChairNote')}</p>

            {numFields.map((k) => (
              <div className="settings__row" key={k} id={`edit-${k}`}>
                <label className="field-label" htmlFor={`set-${k}`}>{t(GROUP_LABELS[k] || k)}</label>
                <input id={`set-${k}`} type="number" min="0" step="any" value={group[k] ?? ''} onChange={(e) => setGroupVal(k, e.target.value)} />
              </div>
            ))}

            {swFields.map((k) => (
              <label className="settings__switch" key={k} id={`edit-${k}`}>
                <input type="checkbox" checked={group[k] === 'yes'} onChange={(e) => setGroupVal(k, e.target.checked ? 'yes' : 'no')} />
                <span>{t(GROUP_LABELS[k] || k)}</span>
              </label>
            ))}

            {section.id === 'membership' && (
              <>
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
              </>
            )}

            {pendingKeys.size > 0 && <p className="notice notice--warn">{t('settings.alreadyWaiting')}</p>}
            <button type="submit" className="btn" disabled={busy}>
              {busy ? t('common.saving') : t('settings.proposeToChair')}
            </button>
          </form>
        )}

        {/* ---- SMS: the administrator's own switch ---- */}
        {section.id === 'sms' && (
          <form onSubmit={saveSms} className="settings__form">
            <label className="settings__switch">
              <input
                type="checkbox"
                checked={String(system.sms_enabled).toLowerCase() !== 'false'}
                onChange={(e) => setSystem((s) => ({ ...s, sms_enabled: e.target.checked ? 'true' : 'false' }))}
              />
              <span>{t('admin.smsLabel')}</span>
            </label>
            <button type="submit" className="btn" disabled={busy}>
              {busy ? t('common.saving') : t('common.save')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
