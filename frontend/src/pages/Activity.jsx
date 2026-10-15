import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useLang } from '../context/LangContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { dateTime, humanAction } from '../utils/format.js';
import '../styles.css';

/** One event line, shared by the sittings below and the "other events" list. */
function EventRow({ event, t, showWho }) {
  return (
    <li className="activity__item">
      <span className="activity__marker" aria-hidden="true" />
      <div className="activity__body">
        <p className="activity__action">{humanAction(event.action)}</p>
        {event.details && <p className="activity__details">{event.details}</p>}
        <p className="activity__meta">
          {showWho ? `${event.full_name || t('activity.system')} · ` : ''}
          {dateTime(event.created_at)}
        </p>
      </div>
    </li>
  );
}

/** Who signed in, when they left, and everything done in between. */
export default function Activity() {
  const { t } = useLang();
  const toast = useToast();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get('/audit/sessions?limit=1000').then(setData).catch((e) => toast.error(e.message));
  }, [toast]);

  if (!data) return <Spinner />;

  const sessions = data.sessions || [];
  const unassigned = data.unassigned || [];

  return (
    <div className="activity">
      <PageHeader title={t('nav.activity')} subtitle={t('activity.subtitle')} />

      {sessions.length === 0 && unassigned.length === 0 ? (
        <EmptyState title={t('common.none')} />
      ) : (
        <>
          <ul className="activity__sessions">
            {sessions.map((s, i) => (
              <li key={`${s.user_id}-${s.login_at}-${i}`} className="activity__session">
                <header className="activity__sessionHead">
                  <div className="activity__sessionWho">
                    <h2 className="activity__who">
                      {s.full_name || t('activity.system')}
                      {s.role ? <span className="activity__role">{t(`roles.${s.role}`)}</span> : null}
                    </h2>
                    <p className="activity__times">
                      <span className="activity__time">
                        <span className="activity__timeLabel">{t('activity.signedIn')}</span>
                        {dateTime(s.login_at)}
                      </span>
                      <span className="activity__time">
                        <span className="activity__timeLabel">{t('activity.signedOut')}</span>
                        {s.logout_at
                          ? dateTime(s.logout_at)
                          : <em className="activity__muted">{t('activity.noSignOut')}</em>}
                      </span>
                    </p>
                  </div>
                  <span className="activity__count">{t('activity.actionCount', s.activities.length)}</span>
                </header>

                {s.activities.length > 0 ? (
                  <ul className="activity__list">
                    {s.activities.map((event, j) => (
                      <EventRow key={j} event={event} t={t} />
                    ))}
                  </ul>
                ) : (
                  <p className="activity__noneList">{t('activity.noActions')}</p>
                )}
              </li>
            ))}
          </ul>

          {unassigned.length > 0 && (
            <section className="activity__other">
              <h2 className="activity__otherTitle">{t('activity.otherTitle')}</h2>
              <ul className="activity__list">
                {unassigned.map((event, i) => (
                  <EventRow key={i} event={event} t={t} showWho />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
