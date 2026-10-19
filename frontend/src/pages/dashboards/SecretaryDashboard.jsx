import { Link, useNavigate } from 'react-router-dom';
import { useLang } from '../../context/LangContext.jsx';
import StatCard from '../../components/StatCard.jsx';
import { BarChart } from '../../components/Charts.jsx';
import { plainNumber, shortDate, dateTime, humanAction } from '../../utils/format.js';
import '../../styles.css';

/**
 * The secretary keeps the record of people: who joined, who wants to join,
 * and what the group decided. The money stays on the treasurer's board.
 */
export default function SecretaryDashboard({ data }) {
  const { t } = useLang();
  const navigate = useNavigate();
  const attendance = [...(data.recent_meetings || [])].reverse();
  const changes = data.membership_changes || { joined: 0, changed: 0, total: 0 };

  // Her shortcuts: everything she opens at every meeting. Nothing that only
  // the chairperson may decide is offered here.
  const quickActions = [
    { to: '/app/members', key: 'dashboard.qaViewMembers', cls: 'btn--sky' },
    { to: '/app/members?add=1', key: 'dashboard.qaAddMember', cls: '' },
    { to: '/app/requests', key: 'dashboard.qaReviewRequests', cls: 'btn--gold' },
    { to: '/app/members?view=history', key: 'dashboard.qaMembershipHistory', cls: 'btn--ghost' },
    { to: '/app/meetings?new=1', key: 'dashboard.qaCreateMeeting', cls: 'btn--sky' },
    { to: '/app/meetings?tab=attendance', key: 'dashboard.qaRecordAttendance', cls: '' },
    { to: '/app/meetings?tab=records', key: 'dashboard.qaMeetingRecords', cls: 'btn--ghost' },
    { to: '/app/analytics?tab=reports&report=members', key: 'dashboard.qaMembershipReport', cls: 'btn--sky' },
    { to: '/app/analytics?tab=reports&report=attendance', key: 'dashboard.qaAttendanceReport', cls: '' },
  ];

  return (
    <>
      <div className="page-grid page-grid--stat">
        <StatCard
          label={t('dashboard.totalMembers')}
          value={plainNumber(data.members?.total)}
          tone="blue" icon="members" big
        />
        <StatCard
          label={t('dashboard.activeMembers')}
          value={plainNumber(data.members?.active)}
          tone="green" icon="members"
        />
        <StatCard
          label={t('dashboard.inactiveMembers')}
          value={plainNumber(data.members?.inactive)}
          tone="red" icon="members"
        />
        <StatCard
          label={t('dashboard.pendingRequests')}
          value={plainNumber(data.pending_join_requests)}
          tone={data.pending_join_requests > 0 ? 'gold' : 'plain'}
          icon="requests"
        />
        <StatCard
          label={t('dashboard.upcomingMeetings')}
          value={plainNumber(data.upcoming_meetings ?? 0)}
          tone="blue" icon="meetings"
          hint={data.next_meeting ? shortDate(data.next_meeting.meeting_date) : undefined}
        />
        <StatCard
          label={t('dashboard.recentAttendance')}
          value={`${data.attendance_rate ?? 0}%`}
          tone="green" icon="meetings"
        />
        <StatCard
          label={t('dashboard.membershipChanges')}
          value={plainNumber(changes.total)}
          tone={changes.total > 0 ? 'gold' : 'plain'}
          icon="activity"
          hint={t('dashboard.changesHint', changes.joined, changes.changed)}
          onClick={() => navigate('/app/activity')}
        />
      </div>

      {data.pending_join_requests > 0 && (
        <p className="notice notice--warn">
          {t('dashboard.waitingNote', data.pending_join_requests)}{' '}
          <Link to="/app/requests">{t('common.view')}</Link>
        </p>
      )}

      <section className="dash__card sdash__quick">
        <h2 className="dash__sectionTitle">{t('dashboard.quickActions')}</h2>
        <div className="sdash__quickGrid">
          {quickActions.map((a) => (
            <Link key={a.to + a.key} to={a.to} className={`btn ${a.cls}`.trim()}>
              {t(a.key)}
            </Link>
          ))}
        </div>
      </section>

      {attendance.length > 0 && (
        <section className="dash__card">
          <h2 className="dash__sectionTitle">{t('dashboard.attendanceTrend')}</h2>
          <BarChart
            data={attendance.map((mt) => ({
              label: shortDate(mt.meeting_date),
              present: mt.present_count || 0,
              marked: mt.marked || 0,
            }))}
            series={[
              { key: 'present', label: t('dashboard.present') },
              { key: 'marked', label: t('dashboard.marked') },
            ]}
            format={(v) => plainNumber(v)}
          />
        </section>
      )}

      <section className="sdash__next">
        <h2 className="dash__sectionTitle">{t('dashboard.nextMeeting')}</h2>
        {data.next_meeting ? (
          <p className="sdash__nextLine">
            <strong>{shortDate(data.next_meeting.meeting_date)}</strong>
            {data.next_meeting.meeting_time ? ` — ${data.next_meeting.meeting_time}` : ''}
            {data.next_meeting.location ? <span className="muted"> · {data.next_meeting.location}</span> : null}
          </p>
        ) : (
          <div className="sdash__noMeeting">
            <p className="muted">{t('dashboard.noMeeting')}</p>
            <Link to="/app/meetings" className="btn btn--small">{t('meetings.schedule')}</Link>
          </div>
        )}
      </section>

      <section className="sdash__cols">
        <div className="sdash__col">
          <h2 className="dash__sectionTitle">{t('dashboard.recentMeetings')}</h2>
          {data.recent_meetings?.length ? (
            <ul className="sdash__meetings">
              {data.recent_meetings.map((mt) => (
                <li key={mt.id}>
                  <span>{shortDate(mt.meeting_date)}</span>
                  <span className="sdash__present">
                    {mt.marked > 0 && <span className="sdash__marked">✓</span>}
                    {mt.present_count} present
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">{t('meetings.empty')}</p>
          )}
          <Link to="/app/meetings" className="btn btn--sky btn--small">{t('meetings.title')}</Link>
        </div>

        <div className="sdash__col">
          <h2 className="dash__sectionTitle">{t('dashboard.recentActivity')}</h2>
          {data.recent_activity?.length ? (
            <ul className="sdash__activity">
              {data.recent_activity.map((a, i) => (
                <li key={i}>
                  <span className="sdash__action">{humanAction(a.action)}</span>
                  {a.details && <span className="sdash__details">{a.details}</span>}
                  <span className="sdash__when">{a.full_name || '—'} · {dateTime(a.created_at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">{t('common.none')}</p>
          )}
          <Link to="/app/activity" className="btn btn--gold btn--small">{t('nav.activity')}</Link>
        </div>
      </section>
    </>
  );
}
