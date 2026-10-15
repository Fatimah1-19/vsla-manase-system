import { Link } from 'react-router-dom';
import { useLang } from '../context/LangContext.jsx';
import { money, shortDate, monthLong } from '../utils/format.js';
import MemberAvatar from './MemberAvatar.jsx';
import '../styles.css';

/**
 * Fines that are still to be paid, with the meeting, cycle, month and date
 * they belong to. Shown on the committee dashboards so the money people can
 * see at a glance who has to pay what.
 */
export default function ExpectedFines({ fines }) {
  const { t } = useLang();
  const rows = fines || [];
  const total = rows.reduce((s, f) => s + Number(f.amount || 0), 0);

  return (
    <section className="dash__card">
      <div className="expect__head">
        <h2 className="dash__sectionTitle">{t('fines.expectedTitle')}</h2>
        {rows.length > 0 && <span className="expect__total money">{money(total)}</span>}
      </div>

      {rows.length ? (
        <>
          <p className="expect__note muted">{t('fines.expectedNote')}</p>
          <ul className="expect__list">
            {rows.map((f) => (
              <li key={f.id} className="expect__item">
                <span className="expect__who">
                  <MemberAvatar memberId={f.member_id} hasAvatar={f.has_avatar} name={f.full_name} size={30} />
                  <span className="expect__name">{f.full_name}</span>
                </span>
                <span className="expect__meta">
                  <span className="expect__tag">
                    {f.meeting_id ? t('fines.meetingRef', f.meeting_id) : t('fines.noMeeting')}
                  </span>
                  <span className="expect__tag">{f.cycle_name || '—'}</span>
                  <span className="expect__tag">{f.month ? monthLong(f.month) : '—'}</span>
                  <span className="expect__date">{shortDate(f.meeting_date || f.date)}</span>
                </span>
                <span className="expect__amount money">{money(f.amount)}</span>
              </li>
            ))}
          </ul>
          <Link to="/app/fines" className="btn btn--sky btn--small">{t('fines.title')}</Link>
        </>
      ) : (
        <p className="muted">{t('fines.noExpected')}</p>
      )}
    </section>
  );
}
