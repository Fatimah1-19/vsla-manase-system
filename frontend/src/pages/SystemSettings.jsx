import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useLang } from '../context/LangContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import '../styles.css';

const LABELS = {
  session_timeout_minutes: 'admin.sessionTimeoutLabel',
  max_login_attempts: 'admin.maxLoginLabel',
  lock_minutes: 'admin.lockLabel',
  reset_max_tries: 'admin.resetTriesLabel',
  sms_enabled: 'admin.smsLabel',
};

/** How the system behaves. The administrator alone looks after these. */
export default function SystemSettings() {
  const { t } = useLang();
  const toast = useToast();
  const [values, setValues] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const rows = await api.get('/settings/system');
    setValues(Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value])));
  }, []);

  useEffect(() => { load().catch((e) => toast.error(e.message)); }, [load, toast]);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.put('/settings/system', values);
      toast.success(t('admin.saved'));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!values) return <Spinner />;

  const set = (k, v) => setValues((s) => ({ ...s, [k]: v }));
  const numbers = ['session_timeout_minutes', 'max_login_attempts', 'lock_minutes', 'reset_max_tries'];

  return (
    <div className="settings">
      <PageHeader title={t('admin.systemTitle')} subtitle={t('admin.systemSubtitle')} />

      <form onSubmit={save} className="settings__form">
        <section className="settings__group">
          <h2 className="settings__h2">{t('admin.systemTitle')}</h2>
          {numbers.map((k) => (
            <div className="settings__row" key={k}>
              <label className="field-label" htmlFor={`sys-${k}`}>{t(LABELS[k])}</label>
              <input
                id={`sys-${k}`}
                type="number"
                min="1"
                step="1"
                value={values[k] ?? ''}
                onChange={(e) => set(k, e.target.value)}
              />
            </div>
          ))}

          <label className="settings__switch">
            <input
              type="checkbox"
              checked={String(values.sms_enabled).toLowerCase() !== 'false'}
              onChange={(e) => set('sms_enabled', e.target.checked ? 'true' : 'false')}
            />
            <span>{t('admin.smsLabel')}</span>
          </label>
        </section>

        <p className="settings__note">{t('admin.settingsNote')}</p>
        <button type="submit" className="btn" disabled={busy}>
          {busy ? t('common.saving') : t('common.save')}
        </button>
      </form>
    </div>
  );
}
