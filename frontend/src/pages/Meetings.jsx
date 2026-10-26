import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useLang } from '../context/LangContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import ReportHeader from '../components/ReportHeader.jsx';
import BackButton from '../components/BackButton.jsx';
import Ledger from '../components/Ledger.jsx';
import Modal from '../components/Modal.jsx';
import Spinner from '../components/Spinner.jsx';
import EmptyState from '../components/EmptyState.jsx';
import MemberAvatar from '../components/MemberAvatar.jsx';
import Icon from '../components/Icon.jsx';
import { shortDate, inputDate } from '../utils/format.js';
import { exportReportAsPdf } from '../utils/reportPdf.js';
import '../styles.css';

const blank = { meeting_date: inputDate(), meeting_time: '', location: '', agenda: '', notify: true };

function attendanceGroups(meeting) {
  const list = Array.isArray(meeting.attendance) ? meeting.attendance : [];
  return {
    present: list.filter((a) => a.status === 'present'),
    absent: list.filter((a) => a.status === 'absent'),
    excused: list.filter((a) => a.status === 'excused'),
  };
}

function AttendanceNames({ people }) {
  if (!people.length) return <span className="muted">-</span>;
  return (
    <div className="meetings__names">
      {people.map((a) => (
        <span key={a.member_id} className={`meetings__name is-${a.status}`}>{a.full_name}</span>
      ))}
    </div>
  );
}

export default function Meetings() {
  const { t } = useLang();
  const { isRecorder, isCommittee } = useAuth();
  const toast = useToast();
  const { search } = useLocation();

  const [meetings, setMeetings] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState(null);
  const [marks, setMarks] = useState({});
  const [minutes, setMinutes] = useState('');
  const [info, setInfo] = useState({ location: '', agenda: '', meeting_time: '' });
  const pdfRef = useRef(null);

  // The secretary's menu links straight to a section: the meeting list, the
  // attendance register, or the written-up meeting records. Read from the
  // router so the page follows a menu click without needing a full reload.
  const tab = new URLSearchParams(search).get('tab');

  const load = useCallback(async () => { setMeetings(await api.get('/meetings')); }, []);
  useEffect(() => { load().catch((e) => toast.error(e.message)); }, [load, toast]);

  // "Create meeting" from the secretary's dashboard opens the form at once.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('new') === '1' && isRecorder) setOpen(true);
  }, [isRecorder]);

  const change = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.post('/meetings', form);
      toast.success(
        form.notify
          ? `${res.message} ${res.notified.sent} member(s) were texted.`
          : res.message
      );
      setOpen(false);
      setForm(blank);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function openDetail(id) {
    try {
      const data = await api.get(`/meetings/${id}`);
      setDetail(data);
      setMinutes(data.meeting.notes || '');
      setInfo({
        location: data.meeting.location || '',
        agenda: data.meeting.agenda || '',
        meeting_time: data.meeting.meeting_time || '',
      });
      setMarks(Object.fromEntries(data.attendance.map((a) => [a.member_id, a.status])));
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function saveAttendance() {
    setBusy(true);
    try {
      const list = Object.entries(marks).map(([member_id, status]) => ({ member_id: Number(member_id), status }));
      await api.put(`/meetings/${detail.meeting.id}/attendance`, { attendance: list });
      // The secretary may also correct the place, the time and the agenda on the
      // record; the audit trail keeps a line for the change.
      await api.patch(`/meetings/${detail.meeting.id}`, { notes: minutes, ...info });
      toast.success(`${t('meetings.attendance')} — ${t('common.save')}.`);
      setDetail(null);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  function exportMeetings() {
    const ok = exportReportAsPdf(pdfRef.current, {
      title: `${t('meetings.exportTitle')} - ${t('app.name')}`,
    });
    if (!ok) toast.error(t('reports.reportExportBlocked'));
    else toast.info(t('reports.reportPdfHint'));
  }

  if (!meetings) return <Spinner />;

  // The secretary keeps the meeting book: what is coming, who was there, and
  // what was written up afterwards.
  const today = new Date(new Date().toDateString());
  const isUpcoming = (m) => new Date(m.meeting_date) >= today;
  const upcomingMeetings = meetings.filter(isUpcoming);
  const previousMeetings = meetings.filter((m) => !isUpcoming(m));

  function listItems(list) {
    return list.map((m) => {
      const upcoming = isUpcoming(m);
      return (
        <li key={m.id} className={upcoming ? 'meetings__item is-upcoming' : 'meetings__item'}>
          <div className="meetings__date">
            <span className="meetings__day">{new Date(m.meeting_date).getDate()}</span>
            <span className="meetings__month">
              {new Date(m.meeting_date).toLocaleDateString('en-GB', { month: 'short' })}
            </span>
          </div>
          <div className="meetings__body">
            <p className="meetings__status">
              <span className={`tag ${upcoming ? 'tag--blue' : 'tag--grey'}`}>
                {upcoming ? t('meetings.statusUpcoming') : t('meetings.statusHeld')}
              </span>
              {m.marked_count > 0 && (
                <span className="tag tag--green">{t('meetings.markedAttendance')}</span>
              )}
            </p>
            <p className="meetings__where">
              {m.location || t('meetings.noPlace')}
              {m.meeting_time ? <span className="muted"> · {m.meeting_time}</span> : null}
            </p>
            {m.agenda && <p className="meetings__agenda">{m.agenda}</p>}
            {m.notes && (
              <div className="meetings__minutesPreview">
                <span className="meetings__minutesLabel">
                  <Icon name="reports" size={13} />
                  {t('meetings.minutes')}
                </span>
                <p>{m.notes}</p>
              </div>
            )}
            <p className="meetings__count">
              {m.marked_count > 0
                ? t('meetings.presentCount', m.present_count, m.marked_count)
                : <span className="muted">{t('meetings.attendance')} not marked</span>}
            </p>
          </div>
          {isCommittee && (
            <button
              type="button"
              className={m.marked_count > 0 ? 'btn btn--ghost btn--small is-marked' : 'btn btn--ghost btn--small'}
              onClick={() => openDetail(m.id)}
            >
              {isRecorder
                ? (m.marked_count > 0 ? `\u2713 ${t('meetings.markedAttendance')}` : t('meetings.markAttendance'))
                : t('meetings.viewRecord')}
            </button>
          )}
        </li>
      );
    });
  }

  return (
    <div className="meetings">
      <PageHeader
        title={t('meetings.title')}
        action={(
          <div className="row-actions">
            {meetings.length > 0 && (
              <button type="button" className="btn btn--gold meetings__exportBtn" onClick={exportMeetings}>
                <Icon name="reports" size={18} />
                {t('meetings.exportPdf')}
              </button>
            )}
            {isRecorder && (
              <button type="button" className="btn" onClick={() => setOpen(true)}>
                <Icon name="meetings" size={18} />
                {t('meetings.schedule')}
              </button>
            )}
          </div>
        )}
      />

      {isCommittee && (
        <div className="meetings__recordings">
          <span className="meetings__recordLabel">{t('meetings.otherRecordings')}</span>
          <div className="meetings__recordLinks">
            <Link to="/app/savings?from=/app/meetings" className="btn btn--ghost btn--small">
              <Icon name="savings" size={18} />{t('nav.savings')}
            </Link>
            <Link to="/app/fines?from=/app/meetings" className="btn btn--ghost btn--small">
              <Icon name="fines" size={18} />{t('nav.fines')}
            </Link>
            <Link to="/app/loans?from=/app/meetings" className="btn btn--ghost btn--small">
              <Icon name="loans" size={18} />{t('nav.loans')}
            </Link>
            <Link to="/app/welfare?from=/app/meetings" className="btn btn--ghost btn--small">
              <Icon name="welfare" size={18} />{t('nav.welfare')}
            </Link>
            <Link to="/app/wrappers?from=/app/meetings" className="btn btn--ghost btn--small">
              <Icon name="wrappers" size={18} />{t('nav.wrappers')}
            </Link>
          </div>
        </div>
      )}

      <div className="meetings__tabsRow">
        <BackButton />
        <nav className="meetings__tabs">
          <Link to="/app/meetings" className={`meetings__tab${!tab ? ' is-on' : ''}`}>{t('meetings.title')}</Link>
          <Link to="/app/meetings?tab=attendance" className={`meetings__tab${tab === 'attendance' ? ' is-on' : ''}`}>
            {t('meetings.attendance')}
          </Link>
          <Link to="/app/meetings?tab=records" className={`meetings__tab${tab === 'records' ? ' is-on' : ''}`}>
            {t('meetings.recordsTitle')}
          </Link>
        </nav>
      </div>

      {tab === 'attendance' ? (
        <section className="meetings__section">
          <p className="muted">{t('meetings.attendanceHint')}</p>
          <div className="meetings__legend" aria-label={t('meetings.attendance')}>
            <span className="meetings__legendItem"><i className="meetings__legendDot is-present" />{t('meetings.present')}</span>
            <span className="meetings__legendItem"><i className="meetings__legendDot is-absent" />{t('meetings.absent')}</span>
            <span className="meetings__legendItem"><i className="meetings__legendDot is-excused" />{t('meetings.excused')}</span>
          </div>
          <Ledger
            columns={[
              { key: 'meeting_date', label: t('common.date'), render: (m) => shortDate(m.meeting_date) },
              { key: 'location', label: t('meetings.place'), render: (m) => m.location || '—' },
              { key: 'present', label: t('meetings.came'),
                render: (m) => (m.marked_count > 0
                  ? <AttendanceNames people={attendanceGroups(m).present} />
                  : <span className="meetings__notMarked">{t('meetings.attendanceNotMarked')}</span>) },
              { key: 'absent', label: t('meetings.absent'),
                render: (m) => (m.marked_count > 0 ? <AttendanceNames people={attendanceGroups(m).absent} /> : null) },
              { key: 'excused', label: t('meetings.excused'),
                render: (m) => (m.marked_count > 0 ? <AttendanceNames people={attendanceGroups(m).excused} /> : null) },
              { key: 'action', label: '', render: (m) => (isCommittee ? (
                <button type="button" className="btn btn--ghost btn--small" onClick={() => openDetail(m.id)}>
                  {isRecorder ? t('meetings.markAttendance') : t('meetings.viewRecord')}
                </button>
              ) : null) },
            ]}
            rows={meetings}
          />
        </section>
      ) : tab === 'records' ? (
        <section className="meetings__section">
          <p className="muted">{t('meetings.recordsHint')}</p>
          <Ledger
            columns={[
              { key: 'meeting_date', label: t('common.date'), render: (m) => shortDate(m.meeting_date) },
              { key: 'meeting_time', label: t('meetings.time'), render: (m) => m.meeting_time || '—', hideOnPhone: true },
              { key: 'location', label: t('meetings.place'), render: (m) => m.location || '—' },
              { key: 'agenda', label: t('meetings.agenda'), render: (m) => m.agenda || '—', hideOnPhone: true },
              { key: 'notes', label: t('meetings.minutes'), render: (m) => m.notes || '—' },
              { key: 'attendance', label: t('meetings.attendance'),
                render: (m) => (m.marked_count > 0 ? t('meetings.presentCount', m.present_count, m.marked_count) : '—') },
              { key: 'recorded_by_name', label: t('savings.recordedBy'), render: (m) => m.recorded_by_name || '—', hideOnPhone: true },
              { key: 'created_at', label: t('meetings.dateCreated'), render: (m) => shortDate(m.created_at), hideOnPhone: true },
            ]}
            rows={meetings}
            onRowClick={isCommittee ? (m) => openDetail(m.id) : undefined}
          />
        </section>
      ) : meetings.length === 0 ? (
        <EmptyState
          title={t('meetings.empty')}
          action={isRecorder && (
            <button type="button" className="btn" onClick={() => setOpen(true)}>{t('meetings.schedule')}</button>
          )}
        />
      ) : (
        <>
          {upcomingMeetings.length > 0 && (
            <section className="meetings__section">
              <h2 className="meetings__group">{t('meetings.upcomingTitle')}</h2>
              <ul className="meetings__list">{listItems(upcomingMeetings)}</ul>
            </section>
          )}
          <section className="meetings__section">
            <h2 className="meetings__group">{t('meetings.previousTitle')}</h2>
            {previousMeetings.length === 0
              ? <p className="muted">{t('common.none')}</p>
              : <ul className="meetings__list">{listItems(previousMeetings)}</ul>}
          </section>
        </>
      )}

      <Modal
        open={open}
        title={t('meetings.schedule')}
        onClose={() => setOpen(false)}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</button>
            <button type="submit" form="meeting-form" className="btn" disabled={busy}>
              {busy ? t('common.saving') : t('common.save')}
            </button>
          </>
        }
      >
        <form id="meeting-form" onSubmit={create} noValidate>
          <div className="form-row form-row--2">
            <div>
              <label className="field-label" htmlFor="mt-date">{t('meetings.when')}</label>
              <input id="mt-date" type="date" value={form.meeting_date} onChange={change('meeting_date')} required />
            </div>
            <div>
              <label className="field-label" htmlFor="mt-time">{t('meetings.time')}</label>
              <input id="mt-time" type="time" value={form.meeting_time} onChange={change('meeting_time')} />
            </div>
          </div>

          <div className="form-row">
            <div>
              <label className="field-label" htmlFor="mt-place">{t('meetings.place')}</label>
              <input id="mt-place" value={form.location} onChange={change('location')} />
            </div>
          </div>

          <div className="form-row">
            <div>
              <label className="field-label" htmlFor="mt-agenda">{t('meetings.agenda')}</label>
              <textarea id="mt-agenda" rows={3} value={form.agenda} onChange={change('agenda')} />
            </div>
          </div>

          <label className="meetings__notify">
            <input type="checkbox" checked={form.notify} onChange={change('notify')} />
            <span>{t('meetings.notify')}</span>
          </label>
        </form>
      </Modal>

      <Modal
        open={!!detail}
        title={detail ? `${t('meetings.attendance')} — ${shortDate(detail.meeting.meeting_date)}` : ''}
        onClose={() => setDetail(null)}
        wide
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setDetail(null)}>{t('common.cancel')}</button>
            {isRecorder && (
              <button type="button" className="btn" onClick={saveAttendance} disabled={busy}>
                {busy ? t('common.saving') : t('common.save')}
              </button>
            )}
          </>
        }
      >
        {detail && (
          <>
            <ul className="meetings__marks">
              {detail.attendance.map((a) => (
                <li key={a.member_id}>
                  <span className="meetings__markName"><span className="vcell"><MemberAvatar memberId={a.member_id} hasAvatar={a.has_avatar} name={a.full_name} size={28} />{a.full_name}</span></span>
                  {marks[a.member_id] && (
                    <span className={`tag ${marks[a.member_id] === 'present' ? 'tag--green'
                      : marks[a.member_id] === 'excused' ? 'tag--gold' : 'tag--red'}`}>
                      {t(`meetings.${marks[a.member_id]}`)}
                    </span>
                  )}
                  <div className="meetings__markBtns" role="group" aria-label={a.full_name}>
                    {['present', 'absent', 'excused'].map((s) => (
                      <button
                        key={s}
                        type="button"
                        disabled={!isRecorder}
                        className={marks[a.member_id] === s ? `meetings__mark is-${s}` : 'meetings__mark'}
                        onClick={() => setMarks((m) => ({ ...m, [a.member_id]: s }))}
                        aria-pressed={marks[a.member_id] === s}
                      >
                        {t(`meetings.${s}`)}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>

            {isRecorder && (
              <div className="meetings__minutes">
                <h3 className="meetings__group">{t('meetings.details')}</h3>
                <div className="form-row form-row--2">
                  <div>
                    <label className="field-label" htmlFor="mt-edit-time">{t('meetings.time')}</label>
                    <input id="mt-edit-time" type="time" value={info.meeting_time}
                      onChange={(e) => setInfo((v) => ({ ...v, meeting_time: e.target.value }))} />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="mt-edit-place">{t('meetings.place')}</label>
                    <input id="mt-edit-place" value={info.location}
                      onChange={(e) => setInfo((v) => ({ ...v, location: e.target.value }))} />
                  </div>
                </div>
                <div className="form-row">
                  <div>
                    <label className="field-label" htmlFor="mt-edit-agenda">{t('meetings.agenda')}</label>
                    <textarea id="mt-edit-agenda" rows={2} value={info.agenda}
                      onChange={(e) => setInfo((v) => ({ ...v, agenda: e.target.value }))} />
                  </div>
                </div>
              </div>
            )}

            <div className="meetings__minutes">
              <label className="field-label" htmlFor="mt-minutes">{t('meetings.minutes')}</label>
              <textarea id="mt-minutes" rows={4} value={minutes} disabled={!isRecorder}
                onChange={(e) => setMinutes(e.target.value)} />
            </div>
          </>
        )}
      </Modal>

      <div className="meetings__pdf print-area print-only" ref={pdfRef}>
        <ReportHeader title={t('meetings.exportTitle')} subtitle={t('meetings.exportSubtitle')} />

        <div className="meetings__pdfStats">
          <div><span>{t('meetings.title')}</span><strong>{meetings.length}</strong></div>
          <div><span>{t('meetings.statusHeld')}</span><strong>{previousMeetings.length}</strong></div>
          <div><span>{t('meetings.statusUpcoming')}</span><strong>{upcomingMeetings.length}</strong></div>
        </div>

        {meetings.map((m) => {
          const groups = attendanceGroups(m);
          const names = (list) => (list.length ? list.map((a) => a.full_name).join(', ') : '-');
          return (
            <section className="meetings__pdfItem" key={m.id}>
              <div className="meetings__pdfHead">
                <h3>{shortDate(m.meeting_date)}</h3>
                <span className={isUpcoming(m) ? 'is-upcoming' : 'is-held'}>
                  {isUpcoming(m) ? t('meetings.statusUpcoming') : t('meetings.statusHeld')}
                </span>
              </div>

              <dl className="meetings__pdfMeta">
                <div><dt>{t('meetings.time')}</dt><dd>{m.meeting_time || '-'}</dd></div>
                <div><dt>{t('meetings.place')}</dt><dd>{m.location || '-'}</dd></div>
                <div><dt>{t('savings.recordedBy')}</dt><dd>{m.recorded_by_name || '-'}</dd></div>
              </dl>

              <div className="meetings__pdfBlock">
                <h4>{t('meetings.agenda')}</h4>
                <p>{m.agenda || '-'}</p>
              </div>

              <div className="meetings__pdfBlock meetings__pdfBlock--minutes">
                <h4>{t('meetings.minutes')}</h4>
                <p className="meetings__pdfText">{m.notes || t('meetings.noMinutes')}</p>
              </div>

              <div className="meetings__pdfBlock">
                <h4>{t('meetings.attendance')}</h4>
                {m.marked_count > 0 ? (
                  <>
                    <dl className="meetings__pdfAttendance">
                      <div><dt>{t('meetings.came')}</dt><dd className="is-present">{names(groups.present)}</dd></div>
                      <div><dt>{t('meetings.absent')}</dt><dd className="is-absent">{names(groups.absent)}</dd></div>
                      <div><dt>{t('meetings.excused')}</dt><dd className="is-excused">{names(groups.excused)}</dd></div>
                    </dl>
                    <p className="meetings__pdfCount">{t('meetings.presentCount', m.present_count, m.marked_count)}</p>
                  </>
                ) : (
                  <p>{t('meetings.attendanceNotMarked')}</p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
