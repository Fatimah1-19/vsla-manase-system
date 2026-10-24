import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useLang } from '../context/LangContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { shortDate, dateTime } from '../utils/format.js';
import '../styles.css';

const CATEGORIES = [
  { id: 'general', labelKey: 'settings.catGroupInfo' },
  { id: 'savings', labelKey: 'settings.catSavings' },
  { id: 'loans', labelKey: 'settings.catLoans' },
  { id: 'fines', labelKey: 'settings.catFines' },
  { id: 'welfare', labelKey: 'settings.catWelfare' },
  { id: 'shareout', labelKey: 'settings.catShareout' },
  { id: 'membership', labelKey: 'settings.catMembership' },
  { id: 'voting', labelKey: 'settings.catVoting' },
  { id: 'meetings', labelKey: 'settings.catMeetings' },
  { id: 'sms', labelKey: 'settings.catSms' },
];

export default function SettingsRequests() {
  const { t } = useLang();
  const toast = useToast();
  const confirm = useConfirm();

  const [list, setList] = useState(null);
  const [form, setForm] = useState({ category: 'general', title: '', description: '', details: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const rows = await api.get('/settings-requests/mine');
    setList(rows);
  }, []);

  useEffect(() => { load().catch((e) => toast.error(e.message)); }, [load, toast]);

  async function submit(e) {
    e.preventDefault();
    if (!form.description.trim()) {
      toast.error(t('settingsRequests.descriptionRequired') || 'Description is required');
      return;
    }
    setBusy(true);
    try {
      await api.post('/settings-requests', form);
      toast.success(t('settingsRequests.submitted') || 'Request submitted');
      setForm({ category: 'general', title: '', description: '', details: '' });
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!list) return <Spinner />;

  return (
    <div className="approvals">
      <PageHeader title={t('settingsRequests.title') || 'Settings Requests'} subtitle={t('settingsRequests.subtitle') || 'Request changes to VSLA settings'} />

      <form onSubmit={submit} className="settings__form">
        <div className="settings__row">
          <label className="field-label">{t('settingsRequests.category') || 'Category'}</label>
          <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>{t(c.labelKey)}</option>
            ))}
          </select>
        </div>
        <div className="settings__row">
          <label className="field-label">{t('settingsRequests.title') || 'Title (optional)'}</label>
          <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
        </div>
        <div className="settings__row">
          <label className="field-label">{t('settingsRequests.description') || 'Description/Reason'} *</label>
          <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={4} />
        </div>
        <div className="settings__row">
          <label className="field-label">{t('settingsRequests.details') || 'Additional details (optional)'}</label>
          <textarea value={form.details} onChange={(e) => setForm((f) => ({ ...f, details: e.target.value }))} rows={3} />
        </div>
        <button type="submit" className="btn" disabled={busy}>
          {busy ? t('common.saving') : t('settingsRequests.submit') || 'Send request'}
        </button>
      </form>

      <section className="approvals__history">
        <h2 className="dash__sectionTitle">{t('settingsRequests.myRequests') || 'My Settings Requests'}</h2>
        {list.length === 0 ? (
          <EmptyState title={t('settingsRequests.none') || 'No requests yet'} />
        ) : (
          <ul className="approvals__historyList">
            {list.map((r) => (
              <li key={r.id}>
                <span><strong>{r.category}</strong> {r.title ? `· ${r.title}` : ''} — {r.description}</span>
                <span className={`tag ${r.status === 'completed' ? 'tag--green' : r.status === 'rejected' ? 'tag--grey' : 'tag--gold'}`}>
                  {r.status}
                </span>
                <span className="muted">{r.created_at ? shortDate(r.created_at) : ''}</span>
                {r.status === 'rejected' && r.rejection_reason ? <span className="muted"> {t('settingsRequests.reason') || 'Reason'}: {r.rejection_reason}</span> : null}
                {r.status === 'completed' ? <span className="muted"> {t('settingsRequests.completed') || 'Completed'}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
