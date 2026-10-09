import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useLang } from '../context/LangContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Ledger from '../components/Ledger.jsx';
import Spinner from '../components/Spinner.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { shortDate } from '../utils/format.js';
import './Reports.css';

const STATUSES = ['absent', 'excused'];

/** A register of who has been missing meetings, by meeting or by member. */
export default function Reports() {
  const { t } = useLang();
  const toast = useToast();

  const [view, setView] = useState('list');
  const [status, setStatus] = useState('absent');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rows, setRows] = useState(null);

  const load = useCallback(async () => {
    const q = new URLSearchParams({ status });
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    const path = view === 'register' ? '/reports/absentee-register' : '/reports/absentees';
    setRows(await api.get(`${path}?${q.toString()}`));
  }, [view, status, from, to]);

  useEffect(() => { load().catch((e) => toast.error(e.message)); }, [load, toast]);

  const listColumns = [
    { key: 'full_name', label: t('common.name') },
    { key: 'membership_number', label: t('members.number'), hideOnPhone: true },
    { key: 'meeting_date', label: t('common.date'), render: (r) => shortDate(r.meeting_date) },
    { key: 'agenda', label: t('meetings.agenda'), hideOnPhone: true,
      render: (r) => r.agenda || <span className="muted">—</span> },
    { key: 'status', label: t('common.status'),
      render: (r) => <span className={`tag tag--${r.status === 'excused' ? 'blue' : 'red'}`}>{t(`meetings.${r.status}`)}</span> },
    { key: 'unpaid_fines_on_date', label: t('reports.unpaidFine'), align: 'right',
      render: (r) => (r.unpaid_fines_on_date > 0
        ? <span className="tag tag--gold">{r.unpaid_fines_on_date}</span>
        : <span className="muted">—</span>) },
  ];

  const registerColumns = [
    { key: 'full_name', label: t('common.name') },
    { key: 'membership_number', label: t('members.number'), hideOnPhone: true },
    { key: 'total_absences', label: t('reports.total'), align: 'right' },
    { key: 'absences_last_30', label: t('reports.last30'), align: 'right' },
    { key: 'last_absence_date', label: t('reports.last'),
      render: (r) => (r.last_absence_date ? shortDate(r.last_absence_date) : <span className="muted">—</span>) },
  ];

  return (
    <div className="reports">
      <PageHeader
        title={t('reports.title')}
        subtitle={t('reports.subtitle')}
        action={
          <button type="button" className="btn btn--gold no-print" onClick={() => window.print()}>
            {t('reports.print')}
          </button>
        }
      />

      <div className="reports__tabs no-print" role="tablist">
        {['list', 'register'].map((k) => (
          <button key={k} type="button" role="tab" aria-selected={view === k}
            className={view === k ? 'reports__tab is-on' : 'reports__tab'} onClick={() => setView(k)}>
            {t(`reports.tab_${k}`)}
          </button>
        ))}
      </div>

      <div className="toolbar no-print">
        <div className="reports__status" role="group" aria-label={t('common.status')}>
          {STATUSES.map((s) => (
            <button key={s} type="button"
              className={status === s ? 'reports__filter is-on' : 'reports__filter'}
              onClick={() => setStatus(s)}>
              {t(`meetings.${s}`)}
            </button>
          ))}
        </div>

        <label className="reports__date">
          <span className="field-label" htmlFor="rp-from">{t('reports.from')}</span>
          <input id="rp-from" type="date" value={from} max={to || undefined}
            onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="reports__date">
          <span className="field-label" htmlFor="rp-to">{t('reports.to')}</span>
          <input id="rp-to" type="date" value={to} min={from || undefined}
            onChange={(e) => setTo(e.target.value)} />
        </label>

        {(from || to) && (
          <button type="button" className="btn btn--ghost btn--small"
            onClick={() => { setFrom(''); setTo(''); }}>
            {t('reports.clear')}
          </button>
        )}
      </div>

      <div className="print-area">
        <p className="notice">{t('reports.note')}</p>

        {rows === null ? <Spinner /> : (
          <Ledger
            columns={view === 'register' ? registerColumns : listColumns}
            rows={rows}
            keyField={view === 'register' ? 'member_id' : 'id'}
            empty={<EmptyState title={view === 'register' ? t('reports.emptyRegister') : t('reports.empty')} />}
          />
        )}
      </div>
    </div>
  );
}
