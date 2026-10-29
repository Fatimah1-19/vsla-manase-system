import { useCallback, useEffect, useRef, useState } from 'react';
import { api, fetchFile } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useLang } from '../context/LangContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import BackButton from '../components/BackButton.jsx';
import PersonHeader from '../components/PersonHeader.jsx';
import ReportHeader from '../components/ReportHeader.jsx';
import Avatar from '../components/Avatar.jsx';
import LanguageToggle from '../components/LanguageToggle.jsx';
import PasswordInput from '../components/PasswordInput.jsx';
import Spinner from '../components/Spinner.jsx';
import StatCard from '../components/StatCard.jsx';
import Ledger from '../components/Ledger.jsx';
import StatusTag from '../components/StatusTag.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { money, shortDate, inputDate, monthLong } from '../utils/format.js';
import { exportReportAsPdf } from '../utils/reportPdf.js';
import '../styles.css';

const DOC_TYPES = ['national_id', 'membership_form', 'passport_photo', 'proof_of_address', 'other'];
const MAX_BYTES = 2 * 1024 * 1024;
const ACCOUNT_TAG = { active: 'green', deactivated: 'grey', suspended: 'grey', locked: 'gold' };

const ACCOUNT_LABEL = { active: 'statusActive', deactivated: 'statusSuspended', suspended: 'statusSuspended', locked: 'statusLocked' };
// The empty shape a person without a member record still sees, so every
// "My account" page keeps the same tabs and layout.
const EMPTY_PROFILE = {
  member: null, savings: [], loans: [], fines: [], documents: [], welfare: [], months: [], shareouts: [],
  cycle: null,
  totals: { savings: 0, shares: 0, active_loans: 0, outstanding: 0, unpaid_fines: 0, net: 0, documents: 0 },
  loan_limit: { multiplier: 0, max_loan: 0 },
};

const toBase64 = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1]);
  r.onerror = () => reject(new Error('Could not read that file.'));
  r.readAsDataURL(file);
});

export default function Profile() {
  const { t } = useLang();
  const { user, refresh, logout, avatar, reloadAvatar } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState(() =>
    (new URLSearchParams(window.location.search).get('tab') === 'account' ? 'account' : 'details'));
  const [details, setDetails] = useState({
    phone: '', email: '', gender: '', marital_status: '', date_of_birth: '',
    occupation: '', village: '', address: '', next_of_kin: '', next_of_kin_phone: '',
  });
  const [pass, setPass] = useState({ current_password: '', new_password: '', confirm: '' });
  const [docType, setDocType] = useState('national_id');
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileRef = useRef(null);
  const photoRef = useRef(null);
  const reportRef = useRef(null);

  const load = useCallback(async () => {
    if (!user.member_id) { setData(EMPTY_PROFILE); return; }
    const res = await api.get('/profile/me');
    setData(res);
    const m = res.member;
    setDetails({
      phone: m.phone || '', email: m.email || '', gender: m.gender || '', marital_status: m.marital_status || '',
      date_of_birth: m.date_of_birth ? String(m.date_of_birth).slice(0, 10) : '',
      occupation: m.occupation || '', village: m.village || '', address: m.address || '',
      next_of_kin: m.next_of_kin || '', next_of_kin_phone: m.next_of_kin_phone || '',
    });
  }, [user.member_id]);

  useEffect(() => { load().catch((e) => { toast.error(e.message); setData(EMPTY_PROFILE); }); }, [load, toast]);

  const exportReport = () => {
    const ok = exportReportAsPdf(reportRef.current, { title: `${t('profile.tab_report')} - ${t('app.name')}` });
    if (!ok) toast.error(t('reports.reportExportBlocked'));
    else toast.info(t('reports.reportPdfHint'));
  };

  const setField = (k) => (e) => setDetails((d) => ({ ...d, [k]: e.target.value }));

  async function saveDetails(e) {
    e.preventDefault();
    setBusy(true);
    try {
      toast.success((await api.put('/profile/me', details)).message);
      await refresh();
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    if (pass.new_password !== pass.confirm) { toast.error(t('forgot.mismatch')); return; }
    if (pass.new_password.length < 6) { toast.error(t('profile.passShort')); return; }
    setBusy(true);
    try {
      await api.post('/auth/change-password', {
        current_password: pass.current_password, new_password: pass.new_password,
      });
      toast.success(t('profile.passChanged'));
      setPass({ current_password: '', new_password: '', confirm: '' });
      await refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function upload(e) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) { toast.error(t('profile.chooseFile')); return; }
    if (file.size > MAX_BYTES) { toast.error(t('profile.fileBig')); return; }
    setBusy(true);
    try {
      const res = await api.post('/profile/documents', {
        document_type: docType, file_name: file.name, mime_type: file.type, data: await toBase64(file),
      });
      toast.success(res.message);
      if (fileRef.current) fileRef.current.value = '';
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function changePhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { toast.error(t('profile.photoType')); return; }
    if (file.size > MAX_BYTES) { toast.error(t('profile.fileBig')); return; }
    setPhotoBusy(true);
    try {
      toast.success((await api.put('/profile/avatar', { mime_type: file.type, data: await toBase64(file) })).message);
      await refresh();
      reloadAvatar();
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setPhotoBusy(false);
    }
  }

  async function removePhoto() {
    if (!(await confirm({ message: t('profile.confirmRemovePhoto'), danger: true }))) return;
    setPhotoBusy(true);
    try {
      toast.success((await api.put('/profile/avatar', { data: null })).message);
      await refresh();
      reloadAvatar();
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setPhotoBusy(false);
    }
  }

  async function openDoc(doc) {
    try {
      const url = await fetchFile(`/profile/documents/${doc.id}`);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function removeDoc(doc) {
    if (!(await confirm({ message: t('profile.confirmRemoveDoc'), danger: true }))) return;
    try {
      toast.success((await api.del(`/profile/documents/${doc.id}`)).message);
      await load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  if (!data) return <Spinner />;
  const m = data.member;

  // Every person in the group is a member, so everyone's "My account" page is
  // the same: the committee sees exactly what an ordinary member sees.
  const tabs = ['details', 'report', 'savings', 'loans', 'fines', 'documents', 'account'];
  const active = tabs.includes(tab) ? tab : tabs[0];

  const savingsColumns = [
    { key: 'date', label: t('common.date'), render: (r) => shortDate(r.date) },
    { key: 'amount', label: t('common.amount'), align: 'right', money: true, render: (r) => money(r.amount) },
    { key: 'shares', label: t('savings.shares'), align: 'right', hideOnPhone: true },
    { key: 'status', label: t('common.status'), render: (r) => <StatusTag status={r.status} /> },
    { key: 'note', label: t('savings.note'), hideOnPhone: true, render: (r) => r.note || '—' },
  ];

  const finesColumns = [
    { key: 'date', label: t('common.date'), render: (r) => shortDate(r.date) },
    { key: 'reason', label: t('common.reason'), render: (r) => r.reason || '—' },
    { key: 'meeting', label: t('fines.meeting'), hideOnPhone: true,
      render: (r) => (r.meeting_id ? t('fines.meetingRef', r.meeting_id) : <span className="muted">—</span>) },
    { key: 'cycle', label: t('fines.cycle'), hideOnPhone: true,
      render: (r) => r.cycle_name || <span className="muted">—</span> },
    { key: 'month', label: t('fines.month'), hideOnPhone: true,
      render: (r) => (r.month ? monthLong(r.month) : '—') },
    { key: 'amount', label: t('common.amount'), align: 'right', money: true, render: (r) => money(r.amount) },
    { key: 'paid', label: t('common.status'),
      render: (r) => (
        <StatusTag status={r.paid ? 'paid' : 'outstanding'}>
          {r.paid ? t('fines.paid') : t('fines.unpaid')}
        </StatusTag>
      ) },
  ];

  const welfareColumns = [
    { key: 'date', label: t('common.date'), render: (r) => shortDate(r.date) },
    { key: 'type', label: t('profile.welfareType'),
      render: (r) => (
        <StatusTag status={r.type === 'contribution' ? 'active' : 'outstanding'} tone={r.type === 'contribution' ? 'green' : 'gold'}>
          {r.type === 'payout' ? t('welfare.payout') : t('welfare.contribution')}
        </StatusTag>
      ) },
    { key: 'notes', label: t('common.reason'), hideOnPhone: true, render: (r) => r.notes || r.category || '—' },
    { key: 'amount', label: t('common.amount'), align: 'right', money: true,
      render: (r) => <span className={r.type === 'payout' ? 'money money--neg' : 'money'}>{money(r.amount)}</span> },
  ];

  const monthsColumns = [
    { key: 'period', label: t('wrappers.month') },
    { key: 'amount', label: t('common.amount'), align: 'right', money: true, render: (r) => money(r.amount) },
    { key: 'paid_on', label: t('common.date'), hideOnPhone: true, render: (r) => shortDate(r.paid_on) },
  ];

  const shareoutColumns = [
    { key: 'cycle_name', label: t('profile.cycle'), render: (r) => r.cycle_name || '—' },
    { key: 'status', label: t('common.status'),
      render: (r) => <StatusTag status={r.status}>
        {r.status === 'distributed' ? t('profile.handedOut') : t('profile.notDistributed')}</StatusTag> },
    { key: 'date_distributed', label: t('profile.dateHandedOut'), hideOnPhone: true,
      render: (r) => (r.date_distributed ? shortDate(r.date_distributed) : '—') },
    { key: 'member_savings', label: t('profile.totalSavings'), align: 'right', money: true, render: (r) => money(r.member_savings) },
    { key: 'profit_share', label: t('shareout.profitShare'), align: 'right', money: true, hideOnPhone: true, render: (r) => money(r.profit_share) },
    { key: 'deductions', label: t('shareout.deductions'), align: 'right', money: true, hideOnPhone: true,
      render: (r) => (r.deductions > 0 ? <span className="money money--neg">{money(r.deductions)}</span> : money(r.deductions)) },
    { key: 'share_amount', label: t('profile.payout'), align: 'right', money: true, render: (r) => money(r.share_amount) },
  ];

  const loanColumns = [
    { key: 'amount', label: t('loans.principal'), align: 'right', money: true, render: (l) => money(l.amount) },
    { key: 'total_due', label: t('loans.totalDue'), align: 'right', money: true, hideOnPhone: true, render: (l) => money(l.total_due) },
    { key: 'outstanding', label: t('loans.outstanding'), align: 'right', money: true,
      render: (l) => <span className={l.outstanding > 0 ? 'money money--neg' : 'money'}>{money(l.outstanding)}</span> },
    { key: 'due_date', label: t('loans.dueDate'), hideOnPhone: true, render: (l) => shortDate(l.due_date) },
    { key: 'status', label: t('common.status'),
      render: (l) => <StatusTag status={l.status}>{t(`loans.${l.status === 'repaid' ? 'repaidStatus' : l.status}`)}</StatusTag> },
  ];

  return (
    <div className="profile">
      <PageHeader title={t('profile.title')} />
      <BackButton />
      <PersonHeader
        name={user.full_name}
        role={t(`roles.${user.role}`)}
        detail={m ? `${t('members.number')} ${m.membership_number}` : null}
        photo={avatar || null}
      />

      {user.must_change_password && <p className="notice notice--warn">{t('profile.mustChange')}</p>}

      <div className="page-grid page-grid--stat">
        <StatCard label={t('dashboard.mySavings')} value={money(data.totals.savings)} hint={`${data.totals.shares} ${t('savings.shares').toLowerCase()}`} tone="gold" />
        <StatCard label={t('dashboard.canBorrow')} value={money(data.loan_limit.max_loan)} hint={t('dashboard.canBorrowHint', data.loan_limit.multiplier)} tone="green" />
        <StatCard label={t('profile.stillOwe')} value={money(data.totals.outstanding)} tone={data.totals.outstanding > 0 ? 'red' : 'plain'} />
        <StatCard label={t('dashboard.unpaidFines')} value={money(data.totals.unpaid_fines)} tone={data.totals.unpaid_fines > 0 ? 'red' : 'plain'} />
      </div>

      <div className="profile__tabs" role="tablist">
        {tabs.map((k) => (
          <button key={k} type="button" role="tab" aria-selected={active === k}
            className={active === k ? 'profile__tab is-on' : 'profile__tab'} onClick={() => setTab(k)}>
            {t(`profile.tab_${k}`)}
          </button>
        ))}
      </div>

      {active === 'details' && (
        <section className="profile__card">
          <h2 className="profile__h2">{t('profile.personal')}</h2>

          <div className="profile__photo">
            <Avatar name={user.full_name} size={72} src={avatar || null} />
            <div className="profile__photoCtl">
              <input id="photo-file" type="file" accept="image/jpeg,image/png,image/webp"
                ref={photoRef} onChange={changePhoto} hidden />
              <div className="profile__photoBtns">
                <button type="button" className="btn btn--small" disabled={photoBusy}
                  onClick={() => photoRef.current?.click()}>
                  {photoBusy ? t('common.saving') : (m?.has_avatar ? t('profile.changePhoto') : t('profile.addPhoto'))}
                </button>
                {m?.has_avatar && (
                  <button type="button" className="btn btn--small btn--danger" disabled={photoBusy} onClick={removePhoto}>
                    {t('profile.removePhoto')}
                  </button>
                )}
              </div>
              <span className="profile__hint">{t('profile.photoHint')}</span>
            </div>
          </div>

          <dl className="profile__rows profile__rows--static">
            <div><dt>{t('common.name')}</dt><dd>{user.full_name}</dd></div>
            <div><dt>{t('login.username')}</dt><dd><code>{user.username}</code></dd></div>
            <div><dt>{t('common.role')}</dt><dd>{t(`roles.${user.role}`)}</dd></div>
            <div>
              <dt>{t('profile.accountStatus')}</dt>
              <dd>
                <span className={`tag tag--${ACCOUNT_TAG[m?.account_status] || 'grey'}`}>
                  {t(`profile.${ACCOUNT_LABEL[m?.account_status] || 'statusSuspended'}`)}
                </span>
              </dd>
            </div>
            <div><dt>{t('members.number')}</dt><dd>{m?.membership_number || '—'}</dd></div>
            <div><dt>{t('members.id')}</dt><dd>{m?.id ?? user.member_id ?? '—'}</dd></div>
            <div><dt>{t('members.joined')}</dt><dd>{m?.date_joined ? shortDate(m.date_joined) : '—'}</dd></div>
            <div><dt>{t('common.phone')}</dt><dd>{details.phone || '—'}</dd></div>
            <div><dt>{t('common.email')}</dt><dd>{details.email || '—'}</dd></div>
          </dl>

          <form onSubmit={saveDetails} noValidate className="profile__form">
            <div className="form-row form-row--2">
              <div>
                <label className="field-label" htmlFor="pd-phone">{t('common.phone')}</label>
                <input id="pd-phone" type="tel" inputMode="tel" value={details.phone} onChange={setField('phone')} />
                <span className="field-hint">{t('profile.phoneHint')}</span>
              </div>
              <div>
                <label className="field-label" htmlFor="pd-email">{t('common.email')}</label>
                <input id="pd-email" type="email" inputMode="email" value={details.email} onChange={setField('email')} />
              </div>
            </div>
            <div className="form-row form-row--2">
              <div>
                <label className="field-label" htmlFor="pd-gender">{t('profile.gender')}</label>
                <select id="pd-gender" value={details.gender} onChange={setField('gender')}>
                  <option value="">—</option>
                  <option value="female">{t('profile.female')}</option>
                  <option value="male">{t('profile.male')}</option>
                </select>
              </div>
              <div>
                <label className="field-label" htmlFor="pd-marital">{t('profile.marital')}</label>
                <select id="pd-marital" value={details.marital_status} onChange={setField('marital_status')}>
                  <option value="">—</option>
                  {['single', 'married', 'divorced', 'widowed'].map((x) => <option key={x} value={x}>{t(`profile.${x}`)}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row form-row--2">
              <div>
                <label className="field-label" htmlFor="pd-dob">{t('profile.dob')}</label>
                <input id="pd-dob" type="date" max={inputDate()} value={details.date_of_birth} onChange={setField('date_of_birth')} />
              </div>
              <div>
                <label className="field-label" htmlFor="pd-job">{t('profile.occupation')}</label>
                <input id="pd-job" value={details.occupation} onChange={setField('occupation')} />
              </div>
            </div>
            <div className="form-row form-row--2">
              <div>
                <label className="field-label" htmlFor="pd-village">{t('common.village')}</label>
                <input id="pd-village" value={details.village} onChange={setField('village')} />
              </div>
              <div>
                <label className="field-label" htmlFor="pd-addr">{t('profile.address')}</label>
                <input id="pd-addr" value={details.address} onChange={setField('address')} />
              </div>
            </div>
            <div className="form-row form-row--2">
              <div>
                <label className="field-label" htmlFor="pd-kin">{t('members.nextOfKin')}</label>
                <input id="pd-kin" value={details.next_of_kin} onChange={setField('next_of_kin')} />
              </div>
              <div>
                <label className="field-label" htmlFor="pd-kinp">{t('common.phone')}</label>
                <input id="pd-kinp" type="tel" value={details.next_of_kin_phone} onChange={setField('next_of_kin_phone')} />
              </div>
            </div>
            <button type="submit" className="btn" disabled={busy}>{busy ? t('common.saving') : t('common.save')}</button>
          </form>
        </section>
      )}

      {active === 'savings' && (
        <section className="profile__card">
          <h2 className="profile__h2">{t('profile.tab_savings')}</h2>
          <Ledger rows={data.savings} columns={savingsColumns} />
        </section>
      )}

      {active === 'loans' && (
        <section className="profile__card">
          <h2 className="profile__h2">{t('profile.tab_loans')}</h2>
          <p className="muted">{t('profile.loanRule', data.loan_limit.multiplier)}</p>
          <Ledger rows={data.loans} columns={loanColumns} />
        </section>
      )}

      {active === 'fines' && (
        <section className="profile__card">
          <h2 className="profile__h2">{t('profile.tab_fines')}</h2>
          <Ledger rows={data.fines} columns={finesColumns} />
        </section>
      )}

      {active === 'documents' && (
        <section className="profile__card">
          <h2 className="profile__h2">{t('profile.tab_documents')}</h2>
          <p className="muted">{t('profile.docsNote')}</p>

          <form onSubmit={upload} className="profile__upload">
            <div className="form-row form-row--2">
              <div>
                <label className="field-label" htmlFor="doc-type">{t('profile.docType')}</label>
                <select id="doc-type" value={docType} onChange={(e) => setDocType(e.target.value)}>
                  {DOC_TYPES.map((d) => <option key={d} value={d}>{t(`profile.doc_${d}`)}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label" htmlFor="doc-file">{t('profile.docFile')}</label>
                <input id="doc-file" type="file" accept="application/pdf,image/jpeg,image/png" ref={fileRef} />
                <span className="field-hint">{t('profile.docLimit')}</span>
              </div>
            </div>
            <button type="submit" className="btn" disabled={busy}>{busy ? t('common.saving') : t('profile.upload')}</button>
          </form>

          <ul className="profile__docs">
            {data.documents.length === 0 && <li className="muted">{t('common.none')}</li>}
            {data.documents.map((d) => (
              <li key={d.id}>
                <span className="profile__docName">
                  <strong>{t(`profile.doc_${d.document_type}`)}</strong>
                  <span className="muted"> · {d.original_name} · {Math.round(d.size_bytes / 1024)} KB · {shortDate(d.uploaded_at)}</span>
                </span>
                <span className="row-actions">
                  <button type="button" className="btn btn--small btn--ghost" onClick={() => openDoc(d)}>{t('common.view')}</button>
                  <button type="button" className="btn btn--small btn--ghost" onClick={() => removeDoc(d)}>{t('common.del')}</button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {active === 'report' && (
        <>
          <div className="profile__toolbar no-print">
            <button type="button" className="btn btn--small" onClick={load} disabled={busy}>
              {t('profile.reportReload')}
            </button>
            <button type="button" className="btn btn--sky btn--small no-print" onClick={exportReport}>
              {t('profile.reportPrint')}
            </button>
          </div>

          <div className="print-area" ref={reportRef}>
            <ReportHeader
              title={t('profile.tab_report')}
              subtitle={m ? `${t('members.number')} ${m.membership_number}` : undefined}
            />
            <section className="profile__card">
              <h2 className="profile__h2">{t('profile.shareholdingTitle')}</h2>
              <dl className="profile__rows">
                <div><dt>{t('profile.cycle')}</dt><dd>{data.cycle ? data.cycle.cycle_name : '—'}</dd></div>
                <div><dt>{t('profile.totalSavings')}</dt><dd className="money">{money(data.totals.savings)}</dd></div>
                <div><dt>{t('savings.shares')}</dt><dd>{data.totals.shares}</dd></div>
                <div><dt>{t('profile.shareValue')}</dt><dd className="money">{money(data.cycle ? data.cycle.share_value : 0)}</dd></div>
                <div><dt>{t('profile.moneyInBox')}</dt><dd className="money">{money(data.totals.net)}</dd></div>
                <div><dt>{t('profile.estPayout')}</dt>
                  <dd className="money">{money(data.totals.savings - data.totals.unpaid_fines - data.totals.outstanding)}</dd></div>
                <div><dt>{t('profile.stillOwe')}</dt>
                  <dd className={data.totals.outstanding > 0 ? 'money money--neg' : 'money'}>{money(data.totals.outstanding)}</dd></div>
                <div><dt>{t('dashboard.unpaidFines')}</dt>
                  <dd className={data.totals.unpaid_fines > 0 ? 'money money--neg' : 'money'}>{money(data.totals.unpaid_fines)}</dd></div>
              </dl>
              <p className="profile__hint">{t('shareout.memberWait')}</p>
            </section>

            <section className="profile__card">
              <h2 className="profile__h2">{t('profile.shareoutTitle')}</h2>
              {data.shareouts.length === 0
                ? <EmptyState title={t('profile.noShareouts')} />
                : <Ledger rows={data.shareouts} keyField="share_out_id" columns={shareoutColumns} />}
            </section>

            <section className="profile__card">
              <h2 className="profile__h2">{t('profile.tab_savings')}</h2>
              <Ledger rows={data.savings} columns={savingsColumns} />
            </section>

            <section className="profile__card">
              <h2 className="profile__h2">{t('profile.tab_loans')}</h2>
              <p className="muted">{t('profile.loanRule', data.loan_limit.multiplier)}</p>
              <Ledger rows={data.loans} columns={loanColumns} />
            </section>

            <section className="profile__card">
              <h2 className="profile__h2">{t('profile.tab_fines')}</h2>
              <Ledger rows={data.fines} columns={finesColumns} />
            </section>

            <section className="profile__card">
              <h2 className="profile__h2">{t('profile.welfareTitle')}</h2>
              <Ledger rows={data.welfare} keyField="id" columns={welfareColumns} />
            </section>

            <section className="profile__card">
              <h2 className="profile__h2">{t('profile.groceriesTitle')}</h2>
              <Ledger rows={data.months} keyField="id" columns={monthsColumns} />
            </section>
          </div>
        </>
      )}

      {active === 'account' && (
        <>
          <section className="profile__card">
            <h2 className="profile__h2">{t('profile.languagePref')}</h2>
            <LanguageToggle />
            <p className="profile__hint">{t('profile.smsLang')}</p>
          </section>

          <section className="profile__card">
            <h2 className="profile__h2">{t('profile.changePassword')}</h2>
            <form onSubmit={changePassword} noValidate>
              {[['current_password', 'p-current', 'profile.current', 'current-password'],
                ['new_password', 'p-new', 'profile.newPass', 'new-password'],
                ['confirm', 'p-confirm', 'profile.confirm', 'new-password']].map(([key, id, label, ac]) => (
                <div className="profile__field" key={key}>
                  <label className="field-label" htmlFor={id}>{t(label)}</label>
                  <PasswordInput id={id} autoComplete={ac} value={pass[key]}
                    onChange={(e) => setPass((p) => ({ ...p, [key]: e.target.value }))} required />
                </div>
              ))}
              <button type="submit" className="btn" disabled={busy}>{busy ? t('common.saving') : t('common.save')}</button>
            </form>
          </section>

          <button type="button" className="btn btn--danger btn--full" onClick={() => logout()}>{t('nav.logout')}</button>
        </>
      )}
    </div>
  );
}