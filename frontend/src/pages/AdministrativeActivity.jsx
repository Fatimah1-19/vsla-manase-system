import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useLang } from '../context/LangContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import EmptyState from '../components/EmptyState.jsx';
import '../styles.css';

const PAGE_SIZE = 50;
const EMPTY_FILTERS = { q: '', from: '', to: '' };

// The administrative actions, and how each one reads to the group.
const ACTION_LABELS = {
  CREATE_USER: 'actCreated',
  UPDATE_USER: 'actUpdated',
  EXECUTE_MEMBER_VOTE: 'actMembership',
  DEACTIVATE_USER: 'actDeactivated',
  REACTIVATE_USER: 'actReactivated',
  UNLOCK_USER: 'actUnlocked',
  CREATE_MEETING: 'actMeeting',
  SAVE_ATTENDANCE: 'actAttendance',
  UPDATE_MEETING: 'actMinutes',
};

const RECORD_KEYS = {
  users: 'recUser',
  members: 'recMember',
  meetings: 'recMeeting',
  member_documents: 'recDocument',
};

const dateOnly = (v) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};
const timeOnly = (v) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

/**
 * §17 Administrative activity. The written record of the secretary's own work:
 * the register, the meetings and the attendance. Money is not kept here, and
 * nothing on this page can be changed — the trail is append-only.
 */
export default function AdministrativeActivity() {
  const { t } = useLang();
  const toast = useToast();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [refresh, setRefresh] = useState(0);

  const query = useCallback((forPage) => {
    const p = new URLSearchParams({ scope: 'administrative' });
    for (const [k, v] of Object.entries(filters)) if (v) p.set(k, v);
    p.set('page', forPage);
    p.set('limit', PAGE_SIZE);
    return p;
  }, [filters]);

  useEffect(() => {
    setData(null);
    api.get(`/audit?${query(page)}`).then(setData).catch((e) => toast.error(e.message));
  }, [query, page, refresh, toast]);

  const set = (k, v) => { setPage(1); setFilters((f) => ({ ...f, [k]: v })); };

  const record = (event) => {
    const key = RECORD_KEYS[event.entity_type];
    const name = key ? t(`activity.${key}`) : (event.entity_type || t('activity.record'));
    return event.entity_id == null ? name : `${name} #${event.entity_id}`;
  };

  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="activity">
      <PageHeader title={t('nav.adminActivity')} subtitle={t('activity.adminNote')} />

      <div className="activity__filters filter-bar">
        <input
          className="activity__search"
          placeholder={t('activity.filterSearch')}
          value={filters.q}
          onChange={(e) => set('q', e.target.value)}
        />
        <label className="activity__date">
          <span>{t('activity.filterFrom')}</span>
          <input type="date" value={filters.from} onChange={(e) => set('from', e.target.value)} />
        </label>
        <label className="activity__date">
          <span>{t('activity.filterTo')}</span>
          <input type="date" value={filters.to} onChange={(e) => set('to', e.target.value)} />
        </label>
        <button
          type="button"
          className="btn btn--small filter-bar__action filter-bar__apply"
          onClick={() => { setPage(1); setRefresh((n) => n + 1); }}
        >
          {t('common.filter')}
        </button>
      </div>

      <p className="activity__readonly">{t('activity.readOnly')}</p>

      {!data ? (
        <Spinner />
      ) : data.rows.length === 0 ? (
        <EmptyState title={t('activity.logEmpty')} />
      ) : (
        <>
          <div className="settings__tableWrap">
            <table className="sysadmin__table">
              <thead>
                <tr>
                  <th>{t('activity.colUser')}</th>
                  <th>{t('activity.colAction')}</th>
                  <th>{t('activity.colRecord')}</th>
                  <th>{t('activity.colDate')}</th>
                  <th>{t('activity.colTime')}</th>
                  <th>{t('activity.colStatus')}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((event) => (
                  <tr key={event.id}>
                    <td>{event.full_name || t('activity.system')}</td>
                    <td>
                      {t(`activity.${ACTION_LABELS[event.action] || 'actOther'}`)}
                      {event.details ? <span className="muted"> · {event.details}</span> : null}
                    </td>
                    <td>{record(event)}</td>
                    <td>{dateOnly(event.created_at)}</td>
                    <td>{timeOnly(event.created_at)}</td>
                    <td><span className="tag tag--green">{t('activity.statusDone')}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="activity__pager">
            <button type="button" className="btn btn--ghost btn--small" disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}>{t('activity.previous')}</button>
            <span className="muted">{t('activity.pageOf', page, pages)}</span>
            <button type="button" className="btn btn--ghost btn--small" disabled={page >= pages}
              onClick={() => setPage((p) => Math.min(pages, p + 1))}>{t('activity.next')}</button>
          </div>
        </>
      )}
    </div>
  );
}
