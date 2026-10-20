import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useLang } from '../context/LangContext.jsx';
import { sectionHomeFor } from './navItems.js';
import Icon from './Icon.jsx';
import '../styles.css';

const normalize = (s) => s.replace(/\?$/, '').replace(/^\?/, '');
const sameTarget = (a, b) => a.split('?')[0] === b.split('?')[0]
  && normalize(a.split('?')[1] || '') === normalize(b.split('?')[1] || '');

/**
 * A small "Back" link that returns to the section's main entry. It appears only
 * when the current address is a sub-view (a history, a record form, an extra
 * tab), so every page that has sub-entries can offer an easy way home.
 */
export default function BackButton() {
  const { user } = useAuth();
  const { t } = useLang();
  const location = useLocation();
  if (!user) return null;

  const home = sectionHomeFor(user.role, location.pathname);
  const here = `${location.pathname}${location.search}`;
  if (!home || sameTarget(home.to, here)) return null;

  return (
    <Link to={home.to} className="section__back">
      <Icon name="back" size={16} />
      <span>{t('common.back')}</span>
    </Link>
  );
}
