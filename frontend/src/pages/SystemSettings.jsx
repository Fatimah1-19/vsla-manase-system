import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useLang } from '../context/LangContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import '../styles.css';

const SYSTEM_LABELS = {
  session_timeout_minutes: 'admin.sessionTimeoutLabel',
  max_login_attempts: 'admin.maxLoginLabel',
  lock_minutes: 'admin.lockLabel',
  reset_max_tries: 'admin.resetTriesLabel',
};
const SYSTEM_ORDER = ['session_timeout_minutes', 'max_login_attempts', 'lock_minutes', 'reset_max_tries'];

/**
 * How the system itself behaves. These are the administrator's alone and take
 * effect at once. The rules of the group live on the VSLA settings page and are
 * confirmed by the chairperson.
 */
export default function SystemSettings() {
  const { t } = useLang();
  const toast = useToast();
  const [system, setSystem] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const sys = await api.get('/settings/system');
    setSystem(Object.fromEntries(sys.map((r) => [r.setting_key, r.setting_value])));
  }, []);

  useEffect(() => { load().catch((e) => toast.error(e.message)); }, [load, toast]);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.put('/settings/system', system);
      toast.success(t('admin.saved'));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!system) return <Spinner />;

  const setVal = (k, v) => setSystem((s) => ({ ...s, [k]: v }));

  return (
    <div className="settings">
      <PageHeader title={t('nav.systemSettings')} subtitle={t('admin.systemSubtitle')} />

      <form onSubmit={save} className="settings__form">
        <section className="settings__group">
          <h2 className="settings__h2">{t('admin.systemTitle')}</h2>
          {SYSTEM_ORDER.filter((k) => k in system).map((k) => (
            <div className="settings__row" key={k}>
              <label className="field-label" htmlFor={`sys-${k}`}>{t(SYSTEM_LABELS[k])}</label>
              <input
                id={`sys-${k}`}
                type="number"
                min="1"
                step="1"
                value={system[k] ?? ''}
                onChange={(e) => setVal(k, e.target.value)}
              />
            </div>
          ))}

          <label className="settings__switch">
            <input
              type="checkbox"
              checked={String(system.sms_enabled).toLowerCase() !== 'false'}
              onChange={(e) => setVal('sms_enabled', e.target.checked ? 'true' : 'false')}
            />
            <span>{t('admin.smsLabel')}</span>
          </label>
        </section>

        <button type="submit" className="btn" disabled={busy}>
          {busy ? t('common.saving') : t('common.save')}
        </button>
      </form>
    </div>
  );
}
