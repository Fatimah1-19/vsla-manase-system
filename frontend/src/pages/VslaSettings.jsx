import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useLang } from '../context/LangContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import { money, dateTime } from '../utils/format.js';
import { GROUP_LABELS, REQUEST_FIELDS } from '../utils/groupRuleLabels.js';
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
/**
 * The VSLA settings, one dedicated page per category. The administrator reads the
 * current value of every rule and proposes a change; the chairperson confirms it.
 * Text messages are her own switch and take effect at once.
 */
export default function VslaSettings({ readOnly = false }) {
  const { t } = useLang();
  const toast = useToast();
  const confirm = useConfirm();
  const { user } = useAuth();
  const { section: routeSection } = useParams();
  const [searchParams] = useSearchParams();
  const section = SECTIONS.find((s) => s.id === routeSection);
  const requestId = searchParams.get('requestId');
  const canSend = readOnly && user?.role === 'admin';

  const [group, setGroup] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [system, setSystem] = useState(null);
  const [sms, setSms] = useState(null);
  const [busy, setBusy] = useState(false);
  const [settingsRequests, setSettingsRequests] = useState([]);
  const [requestCounts, setRequestCounts] = useState({});
  const [requestValues, setRequestValues] = useState({});
  const [requestSummary, setRequestSummary] = useState('');
  const [requestNote, setRequestNote] = useState('');
  const requestPanelRef = useRef(null);

  const load = useCallback(async () => {
    const [rows, sys, smsInfo] = await Promise.all([
      api.get('/settings/group-rules').catch(() => []),
      readOnly ? Promise.resolve([]) : api.get('/settings/system').catch(() => []),
      readOnly ? Promise.resolve(null) : api.get('/admin/sms').catch(() => null),
    ]);
    setSms(smsInfo);
    const map = Object.fromEntries((rows || []).map((r) => [r.setting_key, r.setting_value]));
    setGroup(map);
    let parsed = [];
    try {
      const p = JSON.parse(map.join_screening_questions || '[]');
      if (Array.isArray(p)) parsed = p;
    } catch { parsed = []; }
    setQuestions(parsed.map((q) => ({ id: q.id || '', good: q.good === 'no' ? 'no' : 'yes', en: q.en || '', ny: q.ny || '' })));
    setSystem(Object.fromEntries((sys || []).map((r) => [r.setting_key, r.setting_value])));

    if (canSend) {
      const mine = await api.get(`/settings-requests/mine?category=${routeSection}`).catch(() => []);
      setSettingsRequests(Array.isArray(mine) ? mine : []);
    } else if (!readOnly) {
      try {
        const [allReqs, counts] = await Promise.all([
          api.get(`/settings-requests?category=${routeSection}`).catch(() => []),
          api.get('/settings-requests/counts').catch(() => ({})),
        ]);
        setSettingsRequests(Array.isArray(allReqs) ? allReqs : []);
        setRequestCounts(counts || {});
      } catch {}
    }
  }, [canSend, readOnly, routeSection]);

  useEffect(() => { load().catch((e) => toast.error(e.message)); }, [load, toast]);
  useEffect(() => {
    setRequestValues({});
    setRequestSummary('');
    setRequestNote('');
  }, [routeSection]);

  // A notification link opens the category and brings its request panel into view.
  useEffect(() => {
    if (readOnly || !requestId || !settingsRequests.length) return;
    const req = settingsRequests.find((r) => String(r.id) === String(requestId));
    if (!req) return;
    if (!req.read_by_admin) markRequestRead(req.id);
    const timer = window.setTimeout(() => {
      requestPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [readOnly, requestId, settingsRequests]);

  // The administrator saves the real value here. There is no second approval:
  // this is the configuration change itself.
  async function propose(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = {};
      for (const k of (NUM_FIELDS[section.id] || [])) payload[k] = group[k];
      for (const k of (SWITCH_FIELDS[section.id] || [])) payload[k] = group[k];
      if (section.id === 'membership') payload.join_screening_questions = JSON.stringify(questions);
      const res = await api.put('/settings/group-rules/apply', payload);
      toast.success(res.message || t('settings.saved'));
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function sendRequest(e) {
    e.preventDefault();
    const values = Object.fromEntries(
      Object.entries(requestValues).filter(([, value]) => String(value).trim() !== '')
    );
    if (!Object.keys(values).length && !requestSummary.trim()) {
      toast.error(t('settingsRequests.valueRequired'));
      return;
    }
    setBusy(true);
    try {
      await api.post('/settings-requests', {
        category: section.id,
        description: requestSummary.trim() || t(section.label),
        details: requestNote.trim(),
        requested_values: values,
      });
      toast.success(t('settingsRequests.submitted'));
      setRequestValues({});
      setRequestSummary('');
      setRequestNote('');
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function applyRequest(request) {
    if (!(await confirm({ message: t('settingsRequests.confirmConfigure') }))) return;
    setBusy(true);
    try {
      await api.post(`/settings-requests/${request.id}/configure`, {});
      toast.success(t('settingsRequests.configured'));
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

  async function markRequestRead(id) {
    try {
      await api.post(`/settings-requests/${id}/read`);
    } catch {}
  }

  async function completeRequest(id) {
    setBusy(true);
    try {
      await api.post(`/settings-requests/${id}/complete`, {});
      toast.success(t('settingsRequests.completed') || 'Request completed');
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

  // The chairperson may open every existing category; a treasurer keeps the five
  // money pages she already had. Neither may reach the technical controls.
  const readOnlyIds = ['savings', 'loans', 'fines', 'welfare', 'shareout'];
  if (!section || (readOnly && user?.role !== 'admin' && !readOnlyIds.includes(section.id))) {
    return <Navigate to={readOnly ? '/app/settings/savings' : '/app/admin/settings/general'} replace />;
  }
  if (!group || !system) return <Spinner />;

  const setGroupVal = (k, v) => setGroup((g) => ({ ...g, [k]: v }));
  const isSet = (v) => v !== undefined && v !== null && String(v).trim() !== '';
  const money0 = (v) => (isSet(v) ? money(Number(v || 0)) : '—');
  const statusOf = (key, present) => (!present
    ? { status: t('settings.stNotSet'), tag: STATUS_TAG.not_set }
    : { status: t('settings.stInForce'), tag: STATUS_TAG.in_force });
  const fixed = () => ({ status: t('settings.stFixed'), tag: STATUS_TAG.fixed });

  // A rule value, shown the way the group reads it.
  const fmtVal = (key, val) => {
    if (!isSet(val)) return '—';
    if (key === 'join_screening_questions') {
      let n = 0;
      try { const a = JSON.parse(val); n = Array.isArray(a) ? a.length : 0; } catch { n = 0; }
      return t('settings.questionCount', n);
    }
    if (key === 'sms_enabled') {
      return String(val).toLowerCase() === 'false' ? t('settings.stDisabled') : t('settings.stEnabled');
    }
    if (key.startsWith('include_')) return val === 'yes' ? t('common.yes') : t('common.no');
    if (key === 'loan_multiplier') return `${val} × ${t('settings.savingsWord')}`;
    if (MONEY_KEYS.has(key)) return money(Number(val || 0));
    if (PERCENT_KEYS.has(key)) return `${val}%`;
    return String(val);
  };

  const numFields = NUM_FIELDS[section.id] || [];
  const swFields = SWITCH_FIELDS[section.id] || [];
  const editable = numFields.length > 0 || swFields.length > 0 || section.id === 'membership';
  const requestFields = REQUEST_FIELDS[section.id] || [];
  const pendingRequests = settingsRequests.filter((r) => r.status === 'pending');
  const pastRequests = settingsRequests.filter((r) => r.status !== 'pending');
  const currentVal = (key) => (key === 'sms_enabled' ? system.sms_enabled : group[key]);
  const requestStatus = (status) => {
    if (status === 'completed') return { label: t('settingsRequests.statusConfigured'), tag: 'tag--green' };
    if (status === 'rejected') return { label: t('settingsRequests.statusRejected'), tag: 'tag--grey' };
    return { label: t('settingsRequests.statusSent'), tag: 'tag--gold' };
  };
  const basePath = readOnly ? '/app/settings' : '/app/admin/settings';

  const changeLink = (key) => (
    readOnly ? <span className="muted">—</span>
      : <a className="btn btn--ghost btn--small" href={`#edit-${key}`}>{t('settings.change')}</a>
  );

  return (
    <div className="settings">
      <PageHeader
        title={t('nav.vslaSettings')}
        subtitle={readOnly ? (canSend ? t('settings.chairSubtitle') : t('settings.readOnlySubtitle')) : t('settings.vslaSubtitle')}
      />

      <nav className="settings__cats" aria-label={t('nav.vslaSettings')}>
        {SECTIONS.map((s) => (
          <Link
            key={s.id}
            to={`${basePath}/${s.id}`}
            className={section.id === s.id ? 'settings__cat is-on' : 'settings__cat'}
          >
            {t(s.label)}
            {!readOnly && requestCounts[s.id]
              ? <span className="tag tag--gold settings__new">{t('settingsRequests.newCount', requestCounts[s.id])}</span>
              : null}
          </Link>
        ))}
      </nav>

      <div className="settings__group">
        <h2 className="settings__h2">{t(section.label)}</h2>
        <p className="settings__note">{t(section.note)}</p>

        {/* ---- the chairperson sends the configuration she needs ---- */}
        {canSend && (
          <div className="settings__groupCard settings__requestBox">
            <h3 className="settings__h2">{t('settingsRequests.sendTitle')}</h3>
            <p className="settings__note">{t('settingsRequests.sendNote')}</p>
            <form onSubmit={sendRequest} className="settings__form">
              {requestFields.map((key) => {
                const switchField = key === 'sms_enabled' || key.startsWith('include_');
                const yes = key === 'sms_enabled' ? 'true' : 'yes';
                const no = key === 'sms_enabled' ? 'false' : 'no';
                return (
                  <div className="settings__row" key={key}>
                    <label className="field-label" htmlFor={`request-${key}`}>{t(GROUP_LABELS[key] || key)}</label>
                    <span className="settings__hint">
                      {t('settingsRequests.currentSetting')}: {fmtVal(key, currentVal(key))}
                    </span>
                    {switchField ? (
                      <select
                        id={`request-${key}`}
                        value={requestValues[key] ?? ''}
                        onChange={(e) => setRequestValues((v) => ({ ...v, [key]: e.target.value }))}
                      >
                        <option value="">{t('settingsRequests.keepCurrent')}</option>
                        <option value={yes}>{t('common.yes')}</option>
                        <option value={no}>{t('common.no')}</option>
                      </select>
                    ) : (
                      <input
                        id={`request-${key}`}
                        type={MONEY_KEYS.has(key) || PERCENT_KEYS.has(key) || key.endsWith('_days') ? 'number' : 'text'}
                        min="0"
                        step="any"
                        value={requestValues[key] ?? ''}
                        placeholder={fmtVal(key, currentVal(key))}
                        onChange={(e) => setRequestValues((v) => ({ ...v, [key]: e.target.value }))}
                      />
                    )}
                  </div>
                );
              })}

              {requestFields.length === 0 && (
                <div className="settings__row">
                  <label className="field-label" htmlFor="request-summary">{t('settingsRequests.requestedConfig')} *</label>
                  <textarea
                    id="request-summary"
                    rows={3}
                    value={requestSummary}
                    onChange={(e) => setRequestSummary(e.target.value)}
                  />
                </div>
              )}

              <div className="settings__row">
                <label className="field-label" htmlFor="request-note">{t('settingsRequests.noteOptional')}</label>
                <textarea
                  id="request-note"
                  rows={3}
                  value={requestNote}
                  onChange={(e) => setRequestNote(e.target.value)}
                />
              </div>

              <button type="submit" className="btn" disabled={busy}>
                {busy ? t('common.saving') : t('settingsRequests.send')}
              </button>
            </form>
          </div>
        )}

        {/* ---- the administrator's NEW inbox for this exact tab ---- */}
        {!readOnly && pendingRequests.length > 0 && (
          <div className="settings__groupCard settings__inbox" id="settings-requests" ref={requestPanelRef}>
            <div className="settings__requestHead">
              <h3 className="settings__h2">{t('settingsRequests.adminTitle')}</h3>
              <span className="tag tag--gold">{t('settingsRequests.newCount', pendingRequests.length)}</span>
            </div>
            <p className="settings__note">{t('settingsRequests.adminNote')}</p>
            <ul className="settings__requestList">
              {pendingRequests.map((r) => {
                const values = r.requested_values && typeof r.requested_values === 'object' ? r.requested_values : {};
                const keys = Object.keys(values);
                return (
                  <li key={r.id} className="settings__request">
                    <div className="settings__requestMeta">
                      <strong>{r.requested_by_name || '—'}</strong>
                      <span className="muted">{dateTime(r.created_at)}</span>
                      <span className="tag tag--gold">{t('settingsRequests.statusSent')}</span>
                    </div>
                    {keys.length > 0 ? (
                      <ul className="settings__compare">
                        {keys.map((key) => (
                          <li key={key}>
                            <span className="settings__compareLabel">{t(GROUP_LABELS[key] || key)}</span>
                            <span className="muted">{t('settingsRequests.currentSetting')}: {fmtVal(key, currentVal(key))}</span>
                            <span><strong>{t('settingsRequests.requestedSetting')}: {fmtVal(key, values[key])}</strong></span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="settings__requestedText">
                        <strong>{t('settingsRequests.requestedConfig')}:</strong> {r.description}
                      </p>
                    )}
                    {r.details ? <p className="settings__note settings__requestNote">{t('settingsRequests.note')}: {r.details}</p> : null}
                    <div className="settings__requestActions">
                      {keys.length > 0 && (
                        <button type="button" className="btn btn--small" disabled={busy} onClick={() => applyRequest(r)}>
                          {t('settingsRequests.applyRequested')}
                        </button>
                      )}
                      <button type="button" className="btn btn--ghost btn--small" disabled={busy} onClick={() => completeRequest(r.id)}>
                        {t('settingsRequests.markComplete')}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* ---- the chairperson follows what she sent ---- */}
        {canSend && settingsRequests.length > 0 && (
          <div className="settings__groupCard">
            <h3 className="settings__h2">{t('settingsRequests.sentTitle')}</h3>
            <ul className="settings__requestList">
              {settingsRequests.map((r) => {
                const values = r.requested_values && typeof r.requested_values === 'object' ? r.requested_values : {};
                const status = requestStatus(r.status);
                return (
                  <li key={r.id} className="settings__request">
                    <div className="settings__requestMeta">
                      <strong>{t('settingsRequests.statusSent')}</strong>
                      <span className="muted">{dateTime(r.created_at)}</span>
                      <span className={`tag ${status.tag}`}>{status.label}</span>
                    </div>
                    {Object.keys(values).length > 0 ? (
                      <p className="settings__requestedText">
                        {Object.entries(values).map(([key, value]) => (
                          <span key={key}>{t(GROUP_LABELS[key] || key)}: <strong>{fmtVal(key, value)}</strong>{' · '}</span>
                        ))}
                      </p>
                    ) : <p className="settings__requestedText">{r.description}</p>}
                    {r.details ? <p className="settings__note settings__requestNote">{t('settingsRequests.note')}: {r.details}</p> : null}
                    {r.status === 'completed' && r.implemented_at ? (
                      <p className="settings__note">{t('settingsRequests.configuredOn', dateTime(r.implemented_at))}</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* ---- configured requests stay in this tab's history ---- */}
        {!readOnly && pastRequests.length > 0 && (
          <div className="settings__groupCard">
            <h3 className="settings__h2">{t('settingsRequests.historyTitle')}</h3>
            <ul className="settings__requestList">
              {pastRequests.map((r) => {
                const status = requestStatus(r.status);
                return (
                  <li key={r.id} className="settings__request">
                    <div className="settings__requestMeta">
                      <strong>{r.requested_by_name || '—'}</strong>
                      <span className="muted">{dateTime(r.created_at)}</span>
                      <span className={`tag ${status.tag}`}>{status.label}</span>
                    </div>
                    <p className="settings__requestedText">{r.description}</p>
                    {r.details ? <p className="settings__note settings__requestNote">{t('settingsRequests.note')}: {r.details}</p> : null}
                    {r.implemented_at ? (
                      <p className="settings__note">{t('settingsRequests.configuredOn', dateTime(r.implemented_at))}</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

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

        {/* ---- configure the setting directly (administrator) ---- */}
        {!readOnly && editable && section.id !== 'sms' && (
          <form onSubmit={propose} className="settings__form" id="settingsEdit">
            <p className="settings__note">{t('settings.adminConfigNote')}</p>

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

            <button type="submit" className="btn" disabled={busy}>
              {busy ? t('common.saving') : t('settings.saveConfiguration')}
            </button>
          </form>
        )}

        {/* ---- SMS: the administrator's own technical switch ---- */}
        {!readOnly && section.id === 'sms' && (
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
