import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { useLang } from '../context/LangContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { dateTime, humanAction } from '../utils/format.js';
import '../styles.css';

const FAILED = /FAILED|LOCKED|BLOCKED|REJECT/;

/** The system's own record: who did what, when, and whether it went through. */
export default function SystemActivity() {
  const { t } = useLang();
  const toast = useToast();
  const [rows, setRows] = useState(null);

  useEffect(() => {
    api.get('/audit?limit=200')
      .then((d) => setRows(d.rows || []))
      .catch((e) => toast.error(e.message));
  }, [toast]);

  return (
    <div className="activity">
      <PageHeader title={t('nav.systemActivity')} subtitle={t('admin.systemActivitySubtitle')} />

      {!rows ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState title={t('common.none')} />
      ) : (
        <table className="sysadmin__table">
          <thead>
            <tr>
              <th>{t('admin.actUser')}</th>
              <th>{t('admin.actAction')}</th>
              <th>{t('admin.actDateTime')}</th>
              <th>{t('admin.actStatus')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const failed = FAILED.test(String(r.action || ''));
              return (
                <tr key={r.id}>
                  <td>{r.full_name || t('activity.system')}</td>
                  <td>
                    {humanAction(r.action)}
                    {r.details ? <span className="muted"> · {r.details}</span> : null}
                  </td>
                  <td>{dateTime(r.created_at)}</td>
                  <td>
                    <span className={`tag ${failed ? 'tag--grey' : 'tag--green'}`}>
                      {failed ? t('admin.statusFailed') : t('admin.statusSuccess')}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <p className="sysadmin__more">
        <Link to="/app/activity" className="btn btn--ghost btn--small">{t('admin.viewFullAudit')}</Link>
      </p>
    </div>
  );
}
