import { useCallback, useEffect, useState } from 'react';
import { api, fetchFile } from '../api/client.js';
import { useLang } from '../context/LangContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { dateTime, humanAction } from '../utils/format.js';
import '../styles.css';

const PAGE_SIZE = 50;
const EMPTY_FILTERS = { q: '', action: '', from: '', to: '' };

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

/** The plain history list: every recorded step, filtered and downloadable. */
function LogTab({ t, toast }) {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);

  const query = useCallback((forPage) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) p.set(k, v);
    p.set('page', forPage);
    p.set('limit', PAGE_SIZE);
    return p;
  }, [filters]);

  useEffect(() => {
    setData(null);
    api.get(`/audit?${query(page)}`).then(setData).catch((e) => toast.error(e.message));
  }, [query, page, toast]);

  const set = (k, v) => { setPage(1); setFilters((f) => ({ ...f, [k]: v })); };

  const exportCsv = () => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) p.set(k, v);
    fetchFile(`/audit/export?${p}`).then((url) => {
      const a = document.createElement('a');
      a.href = url;
      a.download = 'activity.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }).catch((e) => toast.error(e.message));
  };

  if (!data) return <Spinner />;

  const total = data.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <div className="activity__filters">
        <input
          className="activity__search"
          placeholder={t('activity.filterSearch')}
          value={filters.q}
          onChange={(e) => set('q', e.target.value)}
        />
        <select value={filters.action} onChange={(e) => set('action', e.target.value)}>
          <option value="">{t('activity.anyAction')}</option>
          {(data.actions || []).map((a) => <option key={a} value={a}>{humanAction(a)}</option>)}
        </select>
        <label className="activity__date">
          <span>{t('activity.filterFrom')}</span>
          <input type="date" value={filters.from} onChange={(e) => set('from', e.target.value)} />
        </label>
        <label className="activity__date">
          <span>{t('activity.filterTo')}</span>
          <input type="date" value={filters.to} onChange={(e) => set('to', e.target.value)} />
        </label>
        <button type="button" className="btn btn--ghost btn--small" onClick={exportCsv}>
          {t('activity.export')}
        </button>
      </div>

      {data.rows.length === 0 ? (
        <EmptyState title={t('activity.logEmpty')} />
      ) : (
        <>
          <ul className="activity__list activity__list--log">
            {data.rows.map((event) => <EventRow key={event.id} event={event} t={t} showWho />)}
          </ul>
          <div className="activity__pager">
            <button type="button" className="btn btn--ghost btn--small" disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}>{t('activity.previous')}</button>
            <span className="muted">{t('activity.pageOf', page, pages)}</span>
            <button type="button" className="btn btn--ghost btn--small" disabled={page >= pages}
              onClick={() => setPage((p) => Math.min(pages, p + 1))}>{t('activity.next')}</button>
          </div>
        </>
      )}
    </>
  );
}

/** Who signed in, when they left, and everything done in between. */
export default function Activity() {
  const { t } = useLang();
  const toast = useToast();
  const [tab, setTab] = useState('sessions');
  const [data, setData] = useState(null);

  useEffect(() => {
    if (tab !== 'sessions') return;
    api.get('/audit/sessions?limit=1000').then(setData).catch((e) => toast.error(e.message));
  }, [tab, toast]);

  const sessions = data?.sessions || [];
  const unassigned = data?.unassigned || [];

  return (
    <div className="activity">
      <PageHeader title={t('nav.activity')} subtitle={t('activity.subtitle')} />

      <div className="activity__tabs" role="tablist">
        {['sessions', 'log'].map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k}
            className={tab === k ? 'activity__tab is-on' : 'activity__tab'} onClick={() => setTab(k)}>
            {k === 'sessions' ? t('activity.sittings') : t('activity.fullLog')}
          </button>
        ))}
      </div>

      {tab === 'log' ? (
        <LogTab t={t} toast={toast} />
      ) : !data ? (
        <Spinner />
      ) : sessions.length === 0 && unassigned.length === 0 ? (
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
