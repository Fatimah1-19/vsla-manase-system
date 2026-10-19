import { Link } from 'react-router-dom';
import { useLang } from '../context/LangContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Icon from '../components/Icon.jsx';
import '../styles.css';

/**
 * The secretary's administrative records. Everything here is a written record
 * of the group's people and meetings — never a shilling. The money stays in the
 * treasurer's books, and this page points nowhere near them.
 */
const GROUPS = [
  {
    key: 'recordsMembership',
    links: [
      ['/app/members', 'nav.members', 'members'],
      ['/app/members?view=details', 'nav.memberRecords', 'members'],
      ['/app/members?view=history', 'nav.membershipHistory', 'members'],
      ['/app/members?view=documents', 'nav.membershipDocuments', 'members'],
      ['/app/requests', 'nav.requests', 'requests'],
    ],
  },
  {
    key: 'recordsMeetings',
    links: [
      ['/app/meetings', 'nav.meetings', 'meetings'],
      ['/app/meetings?tab=attendance', 'nav.attendance', 'meetings'],
      ['/app/meetings?tab=records', 'nav.meetingRecords', 'meetings'],
    ],
  },
  {
    key: 'recordsDecisions',
    links: [
      ['/app/activity?view=audit', 'nav.adminRecords', 'audit'],
      ['/app/activity', 'nav.adminActivity', 'activity'],
    ],
  },
  {
    key: 'recordsReports',
    links: [
      ['/app/analytics?tab=reports', 'nav.membershipReports', 'analytics'],
      ['/app/analytics?tab=reports', 'nav.attendanceReports', 'analytics'],
      ['/app/analytics?tab=reports', 'nav.meetingReports', 'analytics'],
    ],
  },
];

export default function AdministrativeRecords() {
  const { t } = useLang();

  return (
    <div className="records">
      <PageHeader title={t('nav.adminRecords')} subtitle={t('records.note')} />

      <div className="records__groups">
        {GROUPS.map((group) => (
          <section key={group.key} className="panel records__group">
            <h2 className="panel__title">{t(`records.${group.key}`)}</h2>
            <ul className="records__links">
              {group.links.map(([to, key, icon]) => (
                <li key={`${to}-${key}`}>
                  <Link to={to} className="records__link">
                    <span className="records__icon"><Icon name={icon} size={18} /></span>
                    <span>{t(key)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <p className="records__note">{t('records.moneyNote')}</p>
    </div>
  );
}
