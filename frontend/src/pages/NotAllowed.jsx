import { Link } from 'react-router-dom';
import { useLang } from '../context/LangContext.jsx';
import '../styles.css';

/**
 * Shown when someone opens a page their role may not use. The menu hides those
 * pages already, so this only appears if the address is typed by hand.
 */
export default function NotAllowed() {
  const { t } = useLang();
  return (
    <main className="notfound">
      <div className="notfound__panel">
        <h1 className="notfound__title">{t('errors.notAllowed')}</h1>
        <p className="notfound__body">{t('errors.notAllowedBody')}</p>
        <Link to="/app" className="btn">{t('nav.dashboard')}</Link>
      </div>
    </main>
  );
}
