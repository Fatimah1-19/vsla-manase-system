import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, fetchFile } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useLang } from '../context/LangContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import SectionTabs from '../components/SectionTabs.jsx';
import Icon from '../components/Icon.jsx';
import Ledger from '../components/Ledger.jsx';
import Modal from '../components/Modal.jsx';
import Spinner from '../components/Spinner.jsx';
import EmptyState from '../components/EmptyState.jsx';
import MemberAvatar from '../components/MemberAvatar.jsx';
import ReportHeader from '../components/ReportHeader.jsx';
import { money, shortDate, inputDate, monthName, plainNumber } from '../utils/format.js';
import { exportReportAsPdf } from '../utils/reportPdf.js';
import '../styles.css';

const blank = {
  full_name: '', phone: '', language: 'ny',
  village: '', next_of_kin: '', next_of_kin_phone: '', username: '',
  gender: '', marital_status: '', date_of_birth: '', occupation: '', address: '',
};

/** Personal details every VSLA keeps on file for each member. */
function PersonalFields({ values, onChange, t, prefix }) {
  return (
    <>
      <div className="form-row form-row--2">
        <div>
          <label className="field-label" htmlFor={`${prefix}-gender`}>{t('profile.gender')}</label>
          <select id={`${prefix}-gender`} value={values.gender || ''} onChange={onChange('gender')}>
            <option value="">—</option>
            <option value="female">{t('profile.female')}</option>
            <option value="male">{t('profile.male')}</option>
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor={`${prefix}-marital`}>{t('profile.marital')}</label>
          <select id={`${prefix}-marital`} value={values.marital_status || ''} onChange={onChange('marital_status')}>
            <option value="">—</option>
            {['single', 'married', 'divorced', 'widowed'].map((m) => (
              <option key={m} value={m}>{t(`profile.${m}`)}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="form-row form-row--2">
        <div>
          <label className="field-label" htmlFor={`${prefix}-dob`}>{t('profile.dob')}</label>
          <input id={`${prefix}-dob`} type="date" value={values.date_of_birth || ''} onChange={onChange('date_of_birth')} />
        </div>
        <div>
          <label className="field-label" htmlFor={`${prefix}-job`}>{t('profile.occupation')}</label>
          <input id={`${prefix}-job`} value={values.occupation || ''} onChange={onChange('occupation')} />
        </div>
      </div>
      <div className="form-row">
        <div>
          <label className="field-label" htmlFor={`${prefix}-addr`}>{t('profile.address')}</label>
          <input id={`${prefix}-addr`} value={values.address || ''} onChange={onChange('address')} />
        </div>
      </div>
    </>
  );
}

/** The membership papers the register keeps. The same list the server accepts. */
const DOC_TYPES = ['national_id', 'membership_form', 'passport_photo', 'proof_of_address', 'other'];
const MAX_DOC_BYTES = 2 * 1024 * 1024;

const toBase64 = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1]);
  r.onerror = () => reject(new Error('Could not read that file.'));
  r.readAsDataURL(file);
});

/** How each membership event reads on the history page. */
const EVENT_KEYS = {
  joined: 'evJoined', approved: 'evApproved', rejected: 'evRejected',
  deactivated: 'evDeactivated', reactivated: 'evReactivated',
  status_changed: 'evStatusChanged', record_updated: 'evRecordUpdated',
  unlocked: 'evUnlocked', membership_event: 'evOther',
};
const EVENT_STATUS_KEYS = {
  active: 'members.active', inactive: 'members.inactive',
  approved: 'members.statusApproved', rejected: 'members.statusRejected',
};
const EVENT_STATUS_TONES = {
  active: 'tag--green', approved: 'tag--green', inactive: 'tag--red', rejected: 'tag--red',
};

export default function Members() {
  const { t } = useLang();
  const { user, isAdmin, isRecorder, isCommittee } = useAuth();
  const navigate = useNavigate();
  // Adding a member record is the chairperson's and the secretary's work;
  // every other button here needs users.manage, which is the chairperson's alone.
  const canAddMember = !!user && ['admin'].includes(user.role);
  // The secretary keeps the register; only the permitted member details are
  // edited from here, never standing in the group.
  const canEditMember = !!user && ['admin', 'secretary'].includes(user.role);
  const [editForm, setEditForm] = useState(null);
  const toast = useToast();
  const confirm = useConfirm();

  const [people, setPeople] = useState(null);
  const [leadership, setLeadership] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [credentials, setCredentials] = useState(null);
  const [detail, setDetail] = useState(null);
  const [history, setHistory] = useState(null);   // the full record behind one person
  const [fees, setFees] = useState(null);
  const [feeForm, setFeeForm] = useState(null);
  const [feeBusy, setFeeBusy] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const receiptRef = useRef(null);
  const [events, setEvents] = useState(null);   // the whole register's story
  const [allDocs, setAllDocs] = useState(null);  // every membership paper on file
  const [records, setRecords] = useState(null);  // the register with each member's balances
  const [docType, setDocType] = useState(DOC_TYPES[1]);
  const [docBusy, setDocBusy] = useState(false);
  const docRef = useRef(null);

  // /app/members?view=history is the Membership History section: a reading of the
  // register and the audit trail. There is no way to change it from this page.
  const view = new URLSearchParams(window.location.search).get('view');

  const load = useCallback(async () => {
    const [people, reg] = await Promise.all([api.get('/users'), api.get('/registration-fees')]);
    setPeople(people);
    setFees(reg);
  }, []);

  useEffect(() => { load().catch((e) => toast.error(e.message)); }, [load, toast]);

  // "Add member record" from the secretary's dashboard opens the form at once.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('add') === '1' && canAddMember) setAddOpen(true);
  }, [canAddMember]);

  useEffect(() => {
    if (view !== 'history') return;
    api.get('/users/history').then((d) => setEvents(d.events)).catch((e) => toast.error(e.message));
  }, [view, toast]);

  // The whole shelf of membership papers, for the documents section.
  useEffect(() => {
    if (view !== 'documents') return;
    api.get('/members/documents').then(setAllDocs).catch((e) => toast.error(e.message));
  }, [view, toast]);

  // The register with each member's balances, for the records section.
  useEffect(() => {
    if (view !== 'details') return;
    api.get('/members?all=true').then(setRecords).catch((e) => toast.error(e.message));
  }, [view, toast]);

  // Is any committee office empty? If so the chairperson (or, if the chairperson
  // seat itself is empty, a treasurer or secretary) can start an election from here.
  useEffect(() => {
    api.get('/office-votes').then(setLeadership).catch(() => {});
  }, []);

  const change = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function addPerson(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.post('/users', form);
      setCredentials({
        name: form.full_name,
        username: res.user.username,
        password: res.temporary_password,
        smsSent: res.sms_sent,
      });
      setAddOpen(false);
      setForm(blank);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  const changeEdit = (k) => (e) => setEditForm((f) => ({ ...f, [k]: e.target.value }));

  function startEdit(p) {
    setEditForm({
      id: p.id, full_name: p.full_name || '', phone: p.phone || '', language: p.language || 'ny',
      village: p.village || '', next_of_kin: p.next_of_kin || '', next_of_kin_phone: p.next_of_kin_phone || '',
      gender: p.gender || '', marital_status: p.marital_status || '',
      date_of_birth: p.date_of_birth ? String(p.date_of_birth).slice(0, 10) : '',
      occupation: p.occupation || '', address: p.address || '',
    });
    setDetail(null);
  }

  async function openMemberDoc(doc) {
    try {
      const url = await fetchFile(`/profile/documents/${doc.id}`);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      toast.error(err.message);
    }
  }

  // Filing a membership paper (a form, a copy of the record) with the register.
  async function uploadMemberDoc(e) {
    e.preventDefault();
    const file = docRef.current?.files?.[0];
    if (!file) { toast.error(t('members.chooseFile')); return; }
    if (file.size > MAX_DOC_BYTES) { toast.error(t('profile.fileBig')); return; }
    setDocBusy(true);
    try {
      const res = await api.post(`/members/${detail.member_id}/documents`, {
        document_type: docType, file_name: file.name, mime_type: file.type, data: await toBase64(file),
      });
      toast.success(res.message);
      if (docRef.current) docRef.current.value = '';
      setHistory(await api.get(`/members/${detail.member_id}`));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDocBusy(false);
    }
  }

  async function removeMemberDoc(doc) {
    if (!(await confirm({ message: t('members.confirmDocRemove'), danger: true }))) return;
    setDocBusy(true);
    try {
      toast.success((await api.del(`/members/${detail.member_id}/documents/${doc.id}`)).message);
      setHistory(await api.get(`/members/${detail.member_id}`));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDocBusy(false);
    }
  }

  async function saveEdit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const { id, ...body } = editForm;
      toast.success((await api.patch(`/users/${id}`, body)).message);
      setEditForm(null);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function act(id, what) {
    setBusy(true);
    try {
      if (what === 'unlock') {
        toast.success((await api.post(`/users/${id}/unlock`)).message);
      } else if (what === 'reset') {
        const res = await api.post(`/users/${id}/reset-password`);
        const person = people.find((p) => p.id === id);
        setCredentials({
          name: person?.full_name, username: person?.username,
          password: res.temporary_password, smsSent: res.sms_sent,
        });
      } else if (what === 'suspend') {
        if (!(await confirm({ message: t('members.confirmSuspend'), danger: true }))) return;
        toast.success((await api.del(`/users/${id}`)).message);
      } else if (what === 'reactivate') {
        if (!(await confirm({ message: t('members.confirmReactivate') }))) return;
        toast.success((await api.post(`/users/${id}/reactivate`)).message);
      }
      setDetail(null);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  const feeByMember = useMemo(() => {
    const map = {};
    (fees?.members || []).forEach((m) => { map[m.member_id] = m; });
    return map;
  }, [fees]);

  // Opening one person also pulls her whole record: savings, loans, fines, meetings.
  async function openPerson(p) {
    setDetail(p);
    setHistory(null);
    if (!p.member_id) return;
    try {
      setHistory(await api.get(`/members/${p.member_id}`));
    } catch {
      setHistory(null);
    }
  }

  function closePerson() {
    setDetail(null);
    setHistory(null);
  }

  function startFee(person) {
    setFeeForm({
      member_id: person.member_id,
      full_name: person.full_name,
      membership_number: person.membership_number || '',
      amount: String(fees?.fee ?? ''),
      paid_on: inputDate(),
      note: '',
    });
  }

  async function submitFee(e) {
    e.preventDefault();
    setFeeBusy(true);
    try {
      const res = await api.post('/registration-fees', {
        member_id: feeForm.member_id,
        amount: Number(feeForm.amount),
        paid_on: feeForm.paid_on,
        note: feeForm.note || null,
      });
      toast.success(res.sms_sent ? `${res.message} ${t('wrappers.texted')}` : res.message);
      setFeeForm(null);
      setDetail(null);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setFeeBusy(false);
    }
  }

  function openFeeReceipt(person) {
    const fee = feeByMember[person?.member_id];
    if (!fee?.paid) return;
    setReceipt({
      ...fee,
      full_name: person.full_name || fee.full_name,
      membership_number: person.membership_number || fee.membership_number,
    });
  }

  function printFeeReceipt() {
    const ok = exportReportAsPdf(receiptRef.current, {
      title: `${t('members.feeReceipt')} - ${receipt.full_name}`,
    });
    if (!ok) toast.error(t('reports.reportExportBlocked'));
    else toast.info(t('reports.reportPdfHint'));
  }

  const filtered = useMemo(() => {
    if (!people) return [];
    const q = search.trim().toLowerCase();
    const rows = q
      ? people.filter((p) => (p.full_name || '').toLowerCase().includes(q)
          || (p.username || '').includes(q)
          || (p.phone || '').includes(q)
          || (p.membership_number || '').toLowerCase().includes(q))
      : people.slice();
    const wanted = statusFilter === 'all'
      ? rows
      : rows.filter((p) => {
          if (!p.member_status) return false;   // the offices hold no member record
          if (statusFilter === 'active') return p.member_status === 'active';
          if (statusFilter === 'inactive') return p.member_status !== 'active';
          const jd = p.date_joined ? String(p.date_joined).slice(0, 10) : '';
          return !!jd && Date.now() - new Date(`${jd}T00:00:00Z`).getTime() <= 30 * 86400000;
        });
    return wanted.sort((a, b) => {
      const da = a.date_joined || '';
      const db = b.date_joined || '';
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return db.localeCompare(da);
    });
  }, [people, search, statusFilter]);

  const groupByJoin = (p) => {
    const jd = p.date_joined ? String(p.date_joined).slice(0, 10) : '';
    if (!jd || jd.length < 10) return [{ key: 'none', label: t('members.noJoinDate') }];
    const [y, m, d] = jd.split('-');
    return [{ key: jd, label: `${monthName(Number(m))} ${Number(d)}, ${y}` }];
  };

  if (view === 'history') {
    if (!events) return <Spinner />;
    return (
      <div className="members">
        <PageHeader title={t('nav.membershipHistory')} subtitle={t('members.histNote')} />
        <SectionTabs />
        <Ledger
          columns={[
            { key: 'member_name', label: t('common.name') },
            {
              key: 'event_key',
              label: t('members.colEvent'),
              render: (e) => t(`members.${EVENT_KEYS[e.event_key] || 'evOther'}`),
            },
            { key: 'occurred_at', label: t('common.date'), render: (e) => shortDate(e.occurred_at) },
            { key: 'performed_by', label: t('members.performedBy'), render: (e) => e.performed_by || '—' },
            {
              key: 'status',
              label: t('common.status'),
              render: (e) => (e.status
                ? <span className={`tag ${EVENT_STATUS_TONES[e.status] || 'tag--grey'}`}>
                    {t(EVENT_STATUS_KEYS[e.status] || 'common.none')}
                  </span>
                : '—'),
            },
          ]}
          rows={events}
        />
      </div>
    );
  }

  if (!people) return <Spinner />;

  // /app/members?view=details is the Member Records section: the register read
  // as a plain record sheet, every member's number, standing and balances.
  if (view === 'details') {
    return (
      <div className="members">
        <PageHeader title={t('nav.memberRecords')} subtitle={t('members.recordsNote')} />
        <SectionTabs />
        {!records ? (
          <Spinner />
        ) : (
          <Ledger
            columns={[
              { key: 'full_name', label: t('common.name'),
                render: (p) => (
                  <span className="vcell">
                    <MemberAvatar memberId={p.id} hasAvatar={p.has_avatar} name={p.full_name} size={34} />
                    <span className="vcell__name">{p.full_name}</span>
                  </span>
                ) },
              { key: 'membership_number', label: t('members.number'), render: (p) => p.membership_number || '—' },
              { key: 'village', label: t('common.village'), hideOnPhone: true, render: (p) => p.village || '—' },
              { key: 'date_joined', label: t('members.joined'), render: (p) => (p.date_joined ? shortDate(p.date_joined) : '—') },
              { key: 'state', label: t('common.status'),
                render: (p) => (p.is_active
                  ? <span className="tag tag--green">{t('members.active')}</span>
                  : <span className="tag tag--red">{t('members.inactive')}</span>) },
              { key: 'total_shares', label: t('shares'), render: (p) => plainNumber(p.total_shares) },
              { key: 'total_savings', label: t('members.savings'), render: (p) => money(p.total_savings) },
              { key: 'active_loans', label: t('dashboard.activeLoans'), render: (p) => plainNumber(p.active_loans) },
              { key: 'unpaid_fines', label: t('fines.unpaidFines') === 'fines.unpaidFines' ? 'Unpaid fines' : t('fines.unpaidFines'), render: (p) => money(p.unpaid_fines) },
            ]}
            rows={records}
            empty={<EmptyState title={t('members.empty')} />}
          />
        )}
      </div>
    );
  }

  // /app/members?view=documents is the Membership Documents section: every
  // paper the register holds, with the ones the committee may open.
  if (view === 'documents') {
    return (
      <div className="members">
        <PageHeader title={t('nav.membershipDocuments')} subtitle={t('members.documentsNote')} />
        <SectionTabs />
        {!allDocs ? (
          <Spinner />
        ) : allDocs.length === 0 ? (
          <EmptyState title={t('common.none')} />
        ) : (
          <Ledger
            columns={[
              { key: 'full_name', label: t('common.name') },
              { key: 'membership_number', label: t('members.number'), hideOnPhone: true,
                render: (d) => d.membership_number || '—' },
              { key: 'document_type', label: t('profile.docType'),
                render: (d) => <span className="tag tag--grey">{t(`profile.doc_${d.document_type}`)}</span> },
              { key: 'original_name', label: t('profile.docFile'), render: (d) => d.original_name || '—' },
              { key: 'uploaded_at', label: t('members.colDate'), render: (d) => shortDate(d.uploaded_at) },
              { key: 'action', label: t('common.actions'),
                render: (d) => (
                  <button type="button" className="btn btn--small btn--ghost"
                    onClick={() => openMemberDoc(d)}>{t('common.view')}</button>
                ) },
            ]}
            rows={allDocs}
          />
        )}
      </div>
    );
  }

  const isLocked = (p) => p.locked_until && new Date(p.locked_until) > new Date();

  const columns = [
    { key: 'full_name', label: t('common.name'),
      render: (p) => (
        <span className="vcell">
          <MemberAvatar memberId={p.member_id} hasAvatar={p.has_avatar} name={p.full_name} size={34} />
          <span className="vcell__name">{p.full_name}</span>
        </span>
      ) },
    { key: 'username', label: t('login.username'), hideOnPhone: true,
      render: (p) => <code className="members__user">{p.username}</code> },
    { key: 'role', label: t('common.role'),
      render: (p) => <span className="tag tag--grey">{t(`roles.${p.role}`)}</span> },
    { key: 'phone', label: t('common.phone'), hideOnPhone: true, render: (p) => p.phone || '—' },
    { key: 'state', label: t('common.status'),
      render: (p) => {
        if (!p.is_active) return <span className="tag tag--red">{t('members.inactive')}</span>;
        if (isLocked(p)) return <span className="tag tag--gold">{t('members.locked')}</span>;
        return <span className="tag tag--green">{t('members.active')}</span>;
      } },
    { key: 'registration', label: t('members.regFee'), hideOnPhone: true,
      render: (p) => {
        const f = feeByMember[p.member_id];
        if (!f) return <span className="muted">—</span>;
        if (f.paid) return (
          <span className="members__regCell">
            <span className="tag tag--green">{t('members.regFeePaidTag')}</span>
            <button type="button" className="btn btn--small btn--sky"
              onClick={(e) => { e.stopPropagation(); openFeeReceipt(p); }}>
              {t('members.feeReceiptButton')}
            </button>
          </span>
        );
        return (
          <span className="members__regCell">
            <span className="tag tag--gold">{t('members.regFeeDueTag')}</span>
            {isRecorder && (
              <button type="button" className="btn btn--small" disabled={feeBusy}
                onClick={(e) => { e.stopPropagation(); startFee(p); }}>
                {t('members.regFeeRecordShort')}
              </button>
            )}
          </span>
        );
      } },
  ];

  // The register has no action column now, so there is no
  // `if (!isAdmin) columns.pop()` to remove it for the secretary.
  return (
    <div className="members">
      <PageHeader
        title={t('members.title')}
        subtitle={`${people.filter((p) => p.is_active).length} ${t('members.active').toLowerCase()}`}
        action={canAddMember && (
          <button type="button" className="btn" onClick={() => setAddOpen(true)}>{t('members.addPerson')}</button>
        )}
      />
      <SectionTabs />

      {leadership?.can_open && leadership.vacant_offices?.length > 0 && (
        <div className="members__vacant">
          <p className="members__vacantTitle">
            <Icon name="leadership" size={18} /> {t('leaders.vacantTitle')}
          </p>
          <div className="members__rowActs">
            {leadership.vacant_offices.map((o) => (
              <button key={o} type="button" className="btn btn--gold btn--small"
                onClick={() => navigate(`/app/leadership?office=${o}`)}>
                {t('leaders.startElection')} · {t(`leaders.offices.${o}`)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="toolbar members__toolbar">
        <input
          className="toolbar__search"
          type="search"
          placeholder={t('common.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label={t('common.search')}
        />
        <select
          className="members__status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label={t('members.filterLabel')}
        >
          <option value="all">{t('members.filterAll')}</option>
          <option value="active">{t('members.filterActive')}</option>
          <option value="inactive">{t('members.filterInactive')}</option>
          <option value="new">{t('members.filterNew')}</option>
        </select>
      </div>

      <Ledger
        columns={columns}
        rows={filtered}
        onRowClick={openPerson}
        groupBy={groupByJoin}
        empty={<EmptyState title={t('members.empty')} />}
      />

      {/* ---- add ---- */}
      <Modal
        open={addOpen}
        title={t('members.addPerson')}
        onClose={() => setAddOpen(false)}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setAddOpen(false)}>{t('common.cancel')}</button>
            <button type="submit" form="member-form" className="btn" disabled={busy}>
              {busy ? t('common.saving') : t('common.add')}
            </button>
          </>
        }
      >
        <form id="member-form" onSubmit={addPerson} noValidate>
          <div className="form-row">
            <div>
              <label className="field-label" htmlFor="m-name">{t('common.name')}</label>
              <input id="m-name" value={form.full_name} onChange={change('full_name')} required />
            </div>
          </div>

          <div className="form-row form-row--2">
            <div>
              <label className="field-label" htmlFor="m-phone">{t('common.phone')}</label>
              <input id="m-phone" type="tel" inputMode="tel" placeholder="0995727978"
                value={form.phone} onChange={change('phone')} />
              <span className="field-hint">{t('members.smsHint')}</span>
            </div>
            <div>
              <label className="field-label" htmlFor="m-village">{t('common.village')}</label>
              <input id="m-village" value={form.village} onChange={change('village')} />
            </div>
          </div>

          <div className="form-row">
            <div>
              <label className="field-label" htmlFor="m-lang">{t('common.language')}</label>
              <select id="m-lang" value={form.language} onChange={change('language')}>
                <option value="ny">Chichewa</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div>
              <label className="field-label" htmlFor="m-username">
                {t('login.username')} <span className="muted">({t('common.optional')})</span>
              </label>
              <input id="m-username" autoCapitalize="none" value={form.username} onChange={change('username')} />
              <span className="field-hint">{t('members.usernameHint')}</span>
            </div>
          </div>

          <div className="form-row form-row--2">
            <div>
              <label className="field-label" htmlFor="m-kin">{t('members.nextOfKin')}</label>
              <input id="m-kin" value={form.next_of_kin} onChange={change('next_of_kin')} />
            </div>
            <div>
              <label className="field-label" htmlFor="m-kinphone">{t('common.phone')}</label>
              <input id="m-kinphone" type="tel" value={form.next_of_kin_phone} onChange={change('next_of_kin_phone')} />
            </div>
          </div>

          <PersonalFields values={form} onChange={change} t={t} prefix="m" />
        </form>
      </Modal>

      {/* ---- edit ---- */}
      <Modal
        open={!!editForm}
        title={editForm ? `${t('common.edit')} — ${editForm.full_name}` : ''}
        onClose={() => setEditForm(null)}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setEditForm(null)}>{t('common.cancel')}</button>
            <button type="submit" form="member-edit-form" className="btn" disabled={busy}>
              {busy ? t('common.saving') : t('common.save')}
            </button>
          </>
        }
      >
        {editForm && (
          <form id="member-edit-form" onSubmit={saveEdit} noValidate>
            <div className="form-row">
              <div>
                <label className="field-label" htmlFor="e-name">{t('common.name')}</label>
                <input id="e-name" value={editForm.full_name} onChange={changeEdit('full_name')} required />
              </div>
            </div>
            <div className="form-row form-row--2">
              <div>
                <label className="field-label" htmlFor="e-phone">{t('common.phone')}</label>
                <input id="e-phone" type="tel" inputMode="tel" value={editForm.phone} onChange={changeEdit('phone')} />
              </div>
              <div>
                <label className="field-label" htmlFor="e-village">{t('common.village')}</label>
                <input id="e-village" value={editForm.village} onChange={changeEdit('village')} />
              </div>
            </div>
            <div className="form-row">
              <div>
                <label className="field-label" htmlFor="e-lang">{t('common.language')}</label>
                <select id="e-lang" value={editForm.language} onChange={changeEdit('language')}>
                  <option value="ny">Chichewa</option>
                  <option value="en">English</option>
                </select>
              </div>
            </div>
            <div className="form-row form-row--2">
              <div>
                <label className="field-label" htmlFor="e-kin">{t('members.nextOfKin')}</label>
                <input id="e-kin" value={editForm.next_of_kin} onChange={changeEdit('next_of_kin')} />
              </div>
              <div>
                <label className="field-label" htmlFor="e-kinphone">{t('common.phone')}</label>
                <input id="e-kinphone" type="tel" value={editForm.next_of_kin_phone} onChange={changeEdit('next_of_kin_phone')} />
              </div>
            </div>
            <PersonalFields values={editForm} onChange={changeEdit} t={t} prefix="e" />
          </form>
        )}
      </Modal>

      {/* ---- credentials, shown once ---- */}
      <Modal
        open={!!credentials}
        title={t('members.tempPassword')}
        onClose={() => setCredentials(null)}
        footer={<button type="button" className="btn" onClick={() => setCredentials(null)}>{t('common.close')}</button>}
      >
        {credentials && (
          <div className="members__creds">
            <p className="notice notice--warn">{t('members.writeItDown')}</p>
            <dl className="members__credRows">
              <div><dt>{t('common.name')}</dt><dd>{credentials.name}</dd></div>
              <div><dt>{t('login.username')}</dt><dd><code>{credentials.username}</code></dd></div>
              <div><dt>{t('login.password')}</dt><dd><code className="members__pass">{credentials.password}</code></dd></div>
            </dl>
            <p className={credentials.smsSent ? 'notice notice--good' : 'notice notice--danger'}>
              {credentials.smsSent
                ? t('members.credsSent')
                : t('members.credsNotSent')}
            </p>
          </div>
        )}
      </Modal>

      {/* ---- one person ---- */}
      <Modal
        open={!!detail}
        title={detail?.full_name || ''}
        onClose={closePerson}
      >
        {detail && (
          <div className="members__detail">
            <dl className="members__credRows">
              <div><dt>{t('login.username')}</dt><dd><code>{detail.username}</code></dd></div>
              <div><dt>{t('common.role')}</dt><dd>{t(`roles.${detail.role}`)}</dd></div>
              <div><dt>{t('common.phone')}</dt><dd>{detail.phone || '—'}</dd></div>
              <div><dt>{t('members.number')}</dt><dd>{detail.membership_number || '—'}</dd></div>
              <div><dt>{t('common.village')}</dt><dd>{detail.village || '—'}</dd></div>
              <div><dt>{t('common.language')}</dt><dd>{detail.language === 'en' ? 'English' : 'Chichewa'}</dd></div>
              <div><dt>{t('profile.gender')}</dt><dd>{detail.gender ? t(`profile.${detail.gender}`) : '—'}</dd></div>
              <div><dt>{t('profile.marital')}</dt><dd>{detail.marital_status ? t(`profile.${detail.marital_status}`) : '—'}</dd></div>
              <div><dt>{t('profile.dob')}</dt><dd>{detail.date_of_birth ? shortDate(detail.date_of_birth) : '—'}</dd></div>
              <div><dt>{t('profile.occupation')}</dt><dd>{detail.occupation || '—'}</dd></div>
              <div><dt>{t('profile.address')}</dt><dd>{detail.address || '—'}</dd></div>
              <div><dt>{t('members.nextOfKin')}</dt><dd>{detail.next_of_kin ? `${detail.next_of_kin}${detail.next_of_kin_phone ? ' · ' + detail.next_of_kin_phone : ''}` : '—'}</dd></div>
              <div><dt>{t('members.lastLogin')}</dt><dd>{detail.last_login ? shortDate(detail.last_login) : t('members.never')}</dd></div>
            </dl>

            {/* ---- membership history: what this person has done in the group ---- */}
            {detail.member_id && (
              <div className="members__hist">
                <h3 className="members__feeTitle">{t('members.historyTitle')}</h3>
                <dl className="members__credRows">
                  <div><dt>{t('members.joined')}</dt><dd>{detail.date_joined ? shortDate(detail.date_joined) : '—'}</dd></div>
                  <div><dt>{t('common.status')}</dt><dd>
                    {!detail.is_active ? <span className="tag tag--red">{t('members.inactive')}</span>
                      : isLocked(detail) ? <span className="tag tag--gold">{t('members.locked')}</span>
                      : <span className="tag tag--green">{t('members.active')}</span>}
                  </dd></div>
                  <div><dt>{t('members.savings')}</dt><dd>{money(history?.total_savings ?? detail.total_savings ?? 0)}</dd></div>
                  <div><dt>{t('dashboard.activeLoans')}</dt><dd>{plainNumber(history?.active_loans ?? detail.active_loans ?? 0)}</dd></div>
                  <div><dt>{t('fines.unpaidFines') === 'fines.unpaidFines' ? 'Unpaid fines' : t('fines.unpaidFines')}</dt><dd>{money(history?.unpaid_fines ?? detail.unpaid_fines ?? 0)}</dd></div>
                </dl>
                {history?.attendance?.length > 0 && (
                  <p className="muted">
                    {t('members.presentIn',
                      history.attendance.filter((a) => a.status === 'present').length,
                      history.attendance.length)}
                  </p>
                )}
                {history?.wrappers && (
                  <p className="muted">
                    {t('members.welfarePaid', money(history.wrappers.total_paid || 0), history.wrappers.payments || 0)}
                  </p>
                )}
                {history?.loans?.length > 0 && (
                  <ul className="members__histLoans">
                    {history.loans.slice(0, 4).map((l) => {
                      const due = l.with_interest ? l.amount + (l.amount * l.interest_rate) / 100 : l.amount;
                      return (
                        <li key={l.id}>
                          <span>{money(l.amount)}</span>
                          <span className="tag tag--grey">{t(`loans.${l.status === 'repaid' ? 'repaidStatus' : l.status}`)}</span>
                          <span className="muted">{t('members.repaidOf', money(l.total_repaid || 0), money(+due.toFixed(2)))}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            {/* ---- membership documents: the committee may open them ---- */}
            {detail.member_id && isCommittee && (
              <div className="members__hist">
                <h3 className="members__feeTitle">{t('nav.membershipDocuments')}</h3>
                {canEditMember && (
                  <form className="members__docUpload" onSubmit={uploadMemberDoc}>
                    <div className="form-row form-row--2">
                      <div>
                        <label className="field-label" htmlFor="md-type">{t('profile.docType')}</label>
                        <select id="md-type" value={docType} onChange={(e) => setDocType(e.target.value)}>
                          {DOC_TYPES.map((d) => <option key={d} value={d}>{t(`profile.doc_${d}`)}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="field-label" htmlFor="md-file">{t('profile.docFile')}</label>
                        <input id="md-file" type="file" accept="application/pdf,image/jpeg,image/png" ref={docRef} />
                        <span className="field-hint">{t('profile.docLimit')}</span>
                      </div>
                    </div>
                    <button type="submit" className="btn btn--small" disabled={docBusy}>
                      {docBusy ? t('common.saving') : t('profile.upload')}
                    </button>
                  </form>
                )}
                <ul className="profile__docs">
                  {!history?.documents?.length && <li className="muted">{t('common.none')}</li>}
                  {history?.documents?.map((d) => (
                    <li key={d.id}>
                      <span className="profile__docName">
                        <strong>{t(`profile.doc_${d.document_type}`)}</strong>
                        <span className="muted"> · {d.original_name} · {shortDate(d.uploaded_at)}</span>
                      </span>
                      <span className="row-actions">
                        <button type="button" className="btn btn--small btn--ghost"
                          onClick={() => openMemberDoc(d)}>{t('common.view')}</button>
                        {canEditMember && (
                          <button type="button" className="btn btn--small btn--ghost" disabled={docBusy}
                            onClick={() => removeMemberDoc(d)}>{t('common.del')}</button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {detail.member_id && feeByMember[detail.member_id] && (
              <div className="members__fee">
                <h3 className="members__feeTitle">{t('members.regFee')}</h3>
                {feeByMember[detail.member_id]?.paid ? (
                  <>
                    <p className="members__feePaid">
                      {t('members.regFeePaid',
                        money(feeByMember[detail.member_id].amount),
                        shortDate(feeByMember[detail.member_id].paid_on))}
                      {feeByMember[detail.member_id].recorded_by_name
                        ? ` · ${t('savings.recordedBy')}: ${feeByMember[detail.member_id].recorded_by_name}` : ''}
                    </p>
                    <div className="members__rowActs members__rowActs--tight">
                      <button type="button" className="btn btn--small btn--sky"
                        onClick={() => openFeeReceipt(detail)}>
                        {t('members.feeReceiptButton')}
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="muted">{t('members.regFeeDue', money(fees?.fee ?? 0))}</p>
                )}
                {isRecorder && !feeByMember[detail.member_id]?.paid && (
                  <button type="button" className="btn btn--small" disabled={feeBusy}
                    onClick={() => startFee(detail)}>{t('members.recordFee')}</button>
                )}
              </div>
            )}

            {canEditMember && (isAdmin || detail.role === 'member') && (
              <div className="members__actions">
                <button type="button" className="btn" disabled={busy} onClick={() => startEdit(detail)}>{t('common.edit')}</button>
                {isAdmin && detail.member_id && (
                  <button type="button" className="btn btn--sky" disabled={busy}
                    onClick={() => navigate(`/app/cases?member=${detail.member_id}`)}>{t('cases.openFor')}</button>
                )}
                {isAdmin && isLocked(detail) && (
                  <button type="button" className="btn btn--gold" disabled={busy}
                    onClick={() => act(detail.id, 'unlock')}>{t('members.unlock')}</button>
                )}
                {isAdmin && (
                  <button type="button" className="btn btn--ghost" disabled={busy}
                    onClick={() => act(detail.id, 'reset')}>{t('members.newPassword')}</button>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ---- record registration fee ---- */}
      <Modal
        open={!!feeForm}
        title={t('members.recordFee')}
        onClose={() => setFeeForm(null)}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setFeeForm(null)}>{t('common.cancel')}</button>
            <button type="submit" form="fee-form" className="btn" disabled={feeBusy}>
              {feeBusy ? t('common.saving') : t('common.save')}
            </button>
          </>
        }
      >
        {feeForm && (
          <form id="fee-form" onSubmit={submitFee} noValidate>
            <p className="members__feeFor">
              {feeForm.full_name}{feeForm.membership_number ? ` · ${feeForm.membership_number}` : ''}
            </p>
            <div className="form-row form-row--2">
              <div>
                <label className="field-label" htmlFor="fee-amount">{t('common.amount')}</label>
                <input id="fee-amount" type="number" min="0" step="any"
                  value={feeForm.amount} onChange={(e) => setFeeForm((f) => ({ ...f, amount: e.target.value }))} required />
              </div>
              <div>
                <label className="field-label" htmlFor="fee-date">{t('common.date')}</label>
                <input id="fee-date" type="date"
                  value={feeForm.paid_on} onChange={(e) => setFeeForm((f) => ({ ...f, paid_on: e.target.value }))} />
              </div>
            </div>
            <div className="form-row">
              <div>
                <label className="field-label" htmlFor="fee-note">{t('savings.note')}</label>
                <input id="fee-note" value={feeForm.note}
                  onChange={(e) => setFeeForm((f) => ({ ...f, note: e.target.value }))} />
              </div>
            </div>
          </form>
        )}
      </Modal>

      {/* ---- registration fee receipt ---- */}
      <Modal
        open={!!receipt}
        title={t('members.feeReceipt')}
        onClose={() => setReceipt(null)}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setReceipt(null)}>
              {t('common.close')}
            </button>
            <button type="button" className="btn btn--gold" onClick={printFeeReceipt}>
              {t('members.feeReceiptPrint')}
            </button>
          </>
        }
      >
        {receipt && (
          <div className="receipt print-area" ref={receiptRef}>
            <div className="print-only">
              <ReportHeader title={t('members.feeReceipt')} subtitle={receipt.full_name} />
            </div>
            <div className="receipt__card">
              <div className="receipt__head">
                <div>
                  <p className="receipt__eyebrow">{t('members.feeReceiptOfficial')}</p>
                  <p className="receipt__no">
                    {t('members.feeReceiptNumber')} RF-{String(receipt.payment_id).padStart(5, '0')}
                  </p>
                </div>
                <div className="receipt__amount">
                  <span>{t('common.amount')}</span>
                  <strong className="money">{money(receipt.amount)}</strong>
                </div>
              </div>

              <dl className="receipt__rows">
                <div><dt>{t('common.name')}</dt><dd>{receipt.full_name}</dd></div>
                {receipt.membership_number && (
                  <div><dt>{t('members.number')}</dt><dd>{receipt.membership_number}</dd></div>
                )}
                <div><dt>{t('members.regFee')}</dt><dd>{t('members.regFeePaidTag')}</dd></div>
                <div><dt>{t('common.date')}</dt><dd>{shortDate(receipt.paid_on)}</dd></div>
                {receipt.recorded_by_name && (
                  <div><dt>{t('savings.recordedBy')}</dt><dd>{receipt.recorded_by_name}</dd></div>
                )}
                {receipt.note && <div><dt>{t('savings.note')}</dt><dd>{receipt.note}</dd></div>}
              </dl>

              <p className="receipt__thanks">{t('members.feeReceiptThanks')}</p>
              <div className="receipt__sign">
                <span>{t('members.feeReceiptSignature')}</span>
                <strong>{receipt.recorded_by_name || t('members.feeReceiptCommittee')}</strong>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
