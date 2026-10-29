import { Fragment, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { useLang } from '../context/LangContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import BackButton from '../components/BackButton.jsx';
import Spinner from '../components/Spinner.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { humanAction } from '../utils/format.js';
import '../styles.css';

const PAGE_SIZE = 50;
const FAILED = /FAILED|LOCKED|BLOCKED|REJECT|DENIED/;
const EMPTY_FILTERS = { q: '', action: '', user_id: '', from: '', to: '' };

const prettyRecord = (type, id) => {
  if (!type) return '—';
  const name = String(type).replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
  return id == null ? name : `${name} #${id}`;
};
const dateOnly = (v) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};
const timeOnly = (v) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

/** Application activity: search it, narrow it down, and read the detail. */
export default function SystemActivity() {
  const { t } = useLang();
  const toast = useToast();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [users, setUsers] = useState([]);
  const [open, setOpen] = useState(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    api.get('/admin/members').then((d) => setUsers(d || [])).catch(() => setUsers([]));
  }, []);

  const load = useCallback(async (forPage) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) p.set(k, v);
    p.set('page', forPage);
    p.set('limit', PAGE_SIZE);
    setData(await api.get(`/audit?${p.toString()}`));
  }, [filters]);

  useEffect(() => { setOpen(null); load(page).catch((e) => toast.error(e.message)); }, [load, page, refresh, toast]);

  const set = (k, v) => { setFilters((f) => ({ ...f, [k]: v })); setPage(1); };
  const clear = () => { setFilters(EMPTY_FILTERS); setPage(1); };

  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="activity">
      <PageHeader title={t('nav.systemActivity')} subtitle={t('admin.systemActivitySubtitle')} />

      <BackButton />

      <div className="activity__filters filter-bar">
        <input
          className="activity__search"
          placeholder={t('admin.actSearch')}
          value={filters.q}
          onChange={(e) => set('q', e.target.value)}
        />
        <select value={filters.user_id} onChange={(e) => set('user_id', e.target.value)}>
          <option value="">{t('admin.actAnyUser')}</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.full_name}{u.role ? ` · ${t(`roles.${u.role}`)}` : ''}</option>
          ))}
        </select>
        <select value={filters.action} onChange={(e) => set('action', e.target.value)}>
          <option value="">{t('activity.anyAction')}</option>
          {(data?.actions || []).map((a) => <option key={a} value={a}>{humanAction(a)}</option>)}
        </select>
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
        <button type="button" className="btn btn--ghost btn--small filter-bar__action" onClick={clear}>{t('activity.clear')}</button>
      </div>

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
                <th>{t('admin.actUser')}</th>
                <th>{t('admin.actAction')}</th>
                <th>{t('admin.actRecord')}</th>
                <th>{t('admin.actDate')}</th>
                <th>{t('admin.actTime')}</th>
                <th>{t('admin.actStatus')}</th>
                <th>{t('admin.actDetails')}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => {
                const failed = FAILED.test(String(r.action || ''));
                const hasDetail = Boolean(r.details);
                const isOpen = open === r.id;
                return (
                  <Fragment key={r.id}>
                    <tr>
                      <td>{r.full_name || t('activity.system')}</td>
                      <td>{humanAction(r.action)}</td>
                      <td>{prettyRecord(r.entity_type, r.entity_id)}</td>
                      <td>{dateOnly(r.created_at)}</td>
                      <td>{timeOnly(r.created_at)}</td>
                      <td>
                        <span className={`tag ${failed ? 'tag--grey' : 'tag--green'}`}>
                          {failed ? t('admin.statusFailed') : t('admin.statusSuccess')}
                        </span>
                      </td>
                      <td>
                        {hasDetail
                          ? <button type="button" className="btn btn--ghost btn--small" onClick={() => setOpen(isOpen ? null : r.id)}>
                              {isOpen ? t('admin.actHideDetails') : t('admin.actViewDetails')}
                            </button>
                          : '—'}
                      </td>
                    </tr>
                    {isOpen && hasDetail && (
                      <tr className="activity__detailRow">
                        <td colSpan={7}>
                          <p className="activity__detail"><strong>{humanAction(r.action)}</strong> · {r.details}</p>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
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

      <p className="sysadmin__more">
        <Link to="/app/activity" className="btn btn--ghost btn--small">{t('admin.viewFullAudit')}</Link>
      </p>
    </div>
  );
}
