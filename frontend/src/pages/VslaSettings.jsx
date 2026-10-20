import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { useLang } from '../context/LangContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import { money, dateTime } from '../utils/format.js';
import { GROUP_LABELS, SECTION_KEYS } from '../utils/groupRuleLabels.js';
import '../styles.css';

// savingRecorded -> "Saving recorded"; other_thing -> "Other thing".
const pretty = (s) => String(s || '')
  .replace(/([a-z])([A-Z])/g, '$1 $2')
  .replace(/[_-]+/g, ' ')
  .replace(/^\w/, (c) => c.toUpperCase());

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
const MONEY_KEYS = new Set(['weekly_share_value', 'monthly_levy', 'welfare_contribution', 'registration_fee', 'absence_fine']);
const PERCENT_KEYS = new Set(['default_interest_rate', 'case_quorum_percent', 'case_dismiss_percent', 'office_quorum_percent']);
const REQ_TAG_BY_STATUS = { pending: STATUS_TAG.waiting, approved: STATUS_TAG.in_force, rejected: STATUS_TAG.not_set, withdrawn: STATUS_TAG.not_set };

/**
 * The VSLA settings, one dedicated page per category. The administrator reads the
 * current value of every rule and proposes a change; the chairperson confirms it.
 * Text messages are her own switch and take effect at once.
 */
export default function VslaSettings({ readOnly = false }) {
  const { t } = useLang();
  const toast = useToast();
  const { section: routeSection } = useParams();
  const section = SECTIONS.find((s) => s.id === routeSection);

  const [group, setGroup] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [system, setSystem] = useState(null);
  const [sms, setSms] = useState(null);
  const [changes, setChanges] = useState([]);
  const [pendingKeys, setPendingKeys] = useState(() => new Set());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [rows, sys, changes, smsInfo] = await Promise.all([
      api.get('/settings/group-rules'),
      readOnly ? Promise.resolve([]) : api.get('/settings/system'),
      readOnly ? Promise.resolve([]) : api.get('/admin/config-changes').catch(() => []),
      readOnly ? Promise.resolve(null) : api.get('/admin/sms').catch(() => null),
    ]);
    setSms(smsInfo);
    const map = Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value]));
    setGroup(map);
    let parsed = [];
    try {
      const p = JSON.parse(map.join_screening_questions || '[]');
      if (Array.isArray(p)) parsed = p;
    } catch { parsed = []; }
    setQuestions(parsed.map((q) => ({ id: q.id || '', good: q.good === 'no' ? 'no' : 'yes', en: q.en || '', ny: q.ny || '' })));
    setSystem(Object.fromEntries(sys.map((r) => [r.setting_key, r.setting_value])));
    const list = changes || [];
    setChanges(list);
    const keys = new Set();
    for (const c of list) {
      if (c.status === 'pending' && c.payload) Object.keys(c.payload).forEach((k) => keys.add(k));
    }
    setPendingKeys(keys);
  }, [readOnly]);

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

  async function withdraw(id) {
    setBusy(true);
    try {
      const res = await api.post(`/admin/change-requests/${id}/withdraw`);
      toast.success(res.message || t('settings.withdrawn'));
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

  const readOnlyIds = ['savings', 'loans', 'fines', 'welfare', 'shareout'];
  if (!section || (readOnly && !readOnlyIds.includes(section.id))) {
    return <Navigate to={readOnly ? '/app/settings/savings' : '/app/admin/settings/general'} replace />;
  }
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

  // Everything the administrator has put to the chairperson about this page's
  // rules, one row per rule: the value now, the value asked for, who asked, when,
  // and who decided it.
  const sectionKeys = SECTION_KEYS[section.id] || [];
  const historyRows = [];
  for (const c of changes) {
    for (const key of (sectionKeys.length ? sectionKeys : Object.keys(c.payload || {}))) {
      if (c.payload && Object.prototype.hasOwnProperty.call(c.payload, key)) historyRows.push({ change: c, key });
    }
  }

  const numFields = NUM_FIELDS[section.id] || [];
  const swFields = SWITCH_FIELDS[section.id] || [];
  const editable = numFields.length > 0 || swFields.length > 0 || section.id === 'membership';
  const changeLink = (key) => (
    readOnly ? <span className="muted">—</span>
      : <a className="btn btn--ghost btn--small" href={`#edit-${key}`}>{t('settings.change')}</a>
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

        {/* ---- meetings: dates and place are set per meeting ---- */}
        {section.id === 'meetings' && (
          <>
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
                  {[
                    ['meetingFrequency', 'meetingFrequencyValue'],
                    ['meetingDay', 'meetingDayValue'],
                    ['meetingTime', 'meetingTimeValue'],
                    ['meetingLocation', 'meetingLocationValue'],
                  ].map(([l, v]) => (
                    <tr key={l}>
                      <td>{t(`settings.${l}`)}</td>
                      <td>{t(`settings.${v}`)}</td>
                      <td><span className={`tag ${STATUS_TAG.fixed}`}>{t('settings.stFixed')}</span></td>
                      <td>—</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="settings__groupCard">
              <p className="settings__note">{t('settings.meetingsNoSettings')}</p>
              <ul className="sysadmin__settings">
                <li><span>{t('settings.absenceFine')}</span><strong>{money0(group.absence_fine)}</strong></li>
              </ul>
              <p className="settings__note">
                {t('settings.meetingsFineRef')} <Link to="/app/admin/settings/fines">{t('settings.catFines')}</Link>
              </p>
            </div>
          </>
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
        {!readOnly && editable && section.id !== 'sms' && (
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

        {/* ---- the approval record: what was asked, by whom, and the verdict ---- */}
        {sectionKeys.length > 0 && historyRows.length > 0 && (
          <div className="settings__tableWrap">
            <h3 className="settings__h2">{t('settings.historyTitle')}</h3>
            <p className="settings__note">{t('settings.historyNote')}</p>
            <table className="sysadmin__table">
              <thead>
                <tr>
                  <th>{t('settings.tblSetting')}</th>
                  <th>{t('settings.tblCurrent')}</th>
                  <th>{t('settings.proposedValue')}</th>
                  <th>{t('settings.proposedBy')}</th>
                  <th>{t('settings.dateProposed')}</th>
                  <th>{t('settings.tblStatus')}</th>
                  <th>{t('settings.decidedBy')}</th>
                  <th>{t('settings.decidedAt')}</th>
                  <th>{t('settings.tblActions')}</th>
                </tr>
              </thead>
              <tbody>
                {historyRows.map(({ change: c, key }) => (
                  <tr key={`${c.id}-${key}`}>
                    <td>{t(GROUP_LABELS[key] || key)}</td>
                    <td>{fmtVal(key, group[key])}</td>
                    <td>{fmtVal(key, c.payload[key])}</td>
                    <td>{c.requested_by_name || '—'}</td>
                    <td>{dateTime(c.created_at)}</td>
                    <td><span className={`tag ${REQ_TAG_BY_STATUS[c.status] || STATUS_TAG.not_set}`}>{t(`settings.req_${c.status}`)}</span></td>
                    <td>{c.decided_by_name || '—'}</td>
                    <td>{c.decided_at ? dateTime(c.decided_at) : '—'}</td>
                    <td>
                      {!readOnly && c.status === 'pending'
                        ? <button type="button" className="btn btn--ghost btn--small" disabled={busy} onClick={() => withdraw(c.id)}>{t('settings.withdraw')}</button>
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ---- SMS: the administrator's own technical switch ---- */}
        {section.id === 'sms' && (
          <>
            {(() => {
              const on = String(system.sms_enabled).toLowerCase() !== 'false';
              const live = sms?.gateway_configured && !sms?.dry_run;
              return (
                <div className="settings__tableWrap">
                  <table className="sysadmin__table">
                    <thead>
                      <tr>
                        <th>{t('settings.tblSetting')}</th>
                        <th>{t('settings.tblCurrent')}</th>
                        <th>{t('settings.tblStatus')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>{t('settings.smsService')}</td>
                        <td>{on ? t('settings.stEnabled') : t('settings.stDisabled')}</td>
                        <td><span className={`tag ${on ? STATUS_TAG.in_force : STATUS_TAG.off}`}>{on ? t('settings.stActive') : t('settings.stOff')}</span></td>
                      </tr>
                      <tr>
                        <td>{t('settings.smsGateway')}</td>
                        <td>{sms?.dry_run ? t('settings.smsTestMode') : sms?.gateway_configured ? t('settings.smsConfigured') : t('settings.smsNotConfigured')}</td>
                        <td><span className={`tag ${live ? STATUS_TAG.in_force : STATUS_TAG.not_set}`}>{live ? t('settings.stInForce') : t('settings.stNotSet')}</span></td>
                      </tr>
                      <tr>
                        <td>{t('settings.smsPreferences')}</td>
                        <td>{t('settings.smsPreferencesValue')}</td>
                        <td><span className={`tag ${STATUS_TAG.fixed}`}>{t('settings.stFixed')}</span></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              );
            })()}

            {sms && (
              <div className="settings__stats">
                <div className="settings__stat"><span>{t('settings.smsTotal')}</span><strong>{sms.stats.total}</strong></div>
                <div className="settings__stat"><span>{t('settings.smsSent')}</span><strong>{sms.stats.sent}</strong></div>
                <div className="settings__stat"><span>{t('settings.smsFailed')}</span><strong>{sms.stats.failed}</strong></div>
                <div className="settings__stat"><span>{t('settings.smsToday')}</span><strong>{sms.stats.today}</strong></div>
              </div>
            )}

            {sms && sms.types.length > 0 && (
              <div className="settings__groupCard">
                <h3 className="settings__h2">{t('settings.smsTypes')}</h3>
                <ul className="settings__chips">
                  {sms.types.map((ty) => (
                    <li key={ty.category} className="settings__chip">
                      {pretty(ty.category)}<span className="settings__chipCount">{ty.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {sms && sms.templates.length > 0 && (
              <div className="settings__groupCard">
                <h3 className="settings__h2">{t('settings.smsTemplates')}</h3>
                <p className="settings__note">{t('settings.smsTemplatesNote')}</p>
                <ul className="settings__chips">
                  {sms.templates.map((k) => <li key={k} className="settings__chip">{pretty(k)}</li>)}
                </ul>
              </div>
            )}

            {sms && sms.recent.length > 0 && (
              <div className="settings__tableWrap">
                <h3 className="settings__h2">{t('settings.smsRecent')}</h3>
                <table className="sysadmin__table">
                  <thead>
                    <tr>
                      <th>{t('common.name')}</th>
                      <th>{t('settings.smsTypeLabel')}</th>
                      <th>{t('settings.tblStatus')}</th>
                      <th>{t('settings.smsSentAt')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sms.recent.map((r) => (
                      <tr key={r.id}>
                        <td>{r.recipient_name || '—'}</td>
                        <td>{pretty(r.category)}</td>
                        <td><span className={`tag ${r.status === 'sent' ? STATUS_TAG.in_force : STATUS_TAG.not_set}`}>{pretty(r.status)}</span></td>
                        <td>{dateTime(r.sent_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

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
          </>
        )}
      </div>
    </div>
  );
}
