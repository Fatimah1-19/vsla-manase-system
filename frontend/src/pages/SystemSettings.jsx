import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useLang } from '../context/LangContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import '../styles.css';

const SECURITY_LABELS = {
  session_timeout_minutes: 'admin.sessionTimeoutLabel',
  max_login_attempts: 'admin.maxLoginLabel',
  lock_minutes: 'admin.lockLabel',
  reset_max_tries: 'admin.resetTriesLabel',
};
const SECURITY_ORDER = ['session_timeout_minutes', 'max_login_attempts', 'lock_minutes', 'reset_max_tries'];

/**
 * The technical settings of the system itself — general information, security
 * and the application state. These are the administrator's alone. The group's
 * money rules (loans, fines, savings, welfare, share-out) live on their own
 * VSLA settings pages and are confirmed by the chairperson.
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

      {/* ---- GENERAL: fixed details of the system ---- */}
      <div className="settings__group">
        <h2 className="settings__h2">{t('settings.generalTitle')}</h2>
        <ul className="sysadmin__settings">
          <li><span>{t('settings.systemName')}</span><strong>{t('app.name')}</strong></li>
          <li><span>{t('settings.currency')}</span><strong>{t('settings.currencyValue')}</strong></li>
          <li><span>{t('settings.dateFormat')}</span><strong>{t('settings.dateFormatValue')}</strong></li>
          <li><span>{t('settings.timeFormat')}</span><strong>{t('settings.timeFormatValue')}</strong></li>
          <li><span>{t('settings.languageLabel')}</span><strong>{t('settings.languageValue')}</strong></li>
        </ul>
      </div>

      {/* ---- SECURITY: the administrator's own settings ---- */}
      <form onSubmit={save} className="settings__form">
        <section className="settings__group">
          <h2 className="settings__h2">{t('settings.securityTitle')}</h2>
          {SECURITY_ORDER.filter((k) => k in system).map((k) => (
            <div className="settings__row" key={k}>
              <label className="field-label" htmlFor={`sys-${k}`}>{t(SECURITY_LABELS[k])}</label>
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
          <ul className="sysadmin__settings">
            <li><span>{t('settings.passwordRule')}</span><strong>{t('settings.passwordRuleValue')}</strong></li>
          </ul>
          <p className="settings__note">{t('settings.securityNote')}</p>
        </section>

        <button type="submit" className="btn" disabled={busy}>
          {busy ? t('common.saving') : t('common.save')}
        </button>
      </form>

      {/* ---- APPLICATION: read-only state ---- */}
      <div className="settings__group">
        <h2 className="settings__h2">{t('settings.applicationTitle')}</h2>
        <ul className="sysadmin__settings">
          <li><span>{t('settings.appStatus')}</span><strong>{t('settings.appStatusValue')}</strong></li>
          <li><span>{t('settings.maintenance')}</span><strong>{t('settings.maintenanceValue')}</strong></li>
        </ul>
        <p className="settings__note">{t('settings.applicationNote')}</p>
      </div>
    </div>
  );
}
