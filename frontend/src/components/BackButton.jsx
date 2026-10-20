import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useLang } from '../context/LangContext.jsx';
import { sectionHomeFor, navFor } from './navItems.js';
import Icon from './Icon.jsx';
import '../styles.css';

const normalize = (s) => s.replace(/\?$/, '').replace(/^\?/, '');
const sameTarget = (a, b) => a.split('?')[0] === b.split('?')[0]
  && normalize(a.split('?')[1] || '') === normalize(b.split('?')[1] || '');

/**
 * A small "Back" link that returns to wherever the reader came from. When a link
 * carries an explicit "from" address (a quick jump from the meeting page into the
 * money books, say), that is used; otherwise it falls back to the section's main
 * entry. It is hidden when the current address is already that home.
 */
export default function BackButton() {
  const { user } = useAuth();
  const { t } = useLang();
  const location = useLocation();
  if (!user) return null;

  const from = new URLSearchParams(location.search).get('from');
  let target = from;
  let label = null;

  if (from) {
    const item = navFor(user.role).find((i) => i.to.split('?')[0] === from.split('?')[0]);
    label = item ? t(item.label || item.key) : null;
    const here = `${location.pathname}${location.search}`;
    if (sameTarget(from, here)) return null;
    if (!target) return null;
    return (
      <Link to={from} className="section__back">
        <Icon name="back" size={16} />
        <span>{label || t('common.back')}</span>
      </Link>
    );
  }

  const home = sectionHomeFor(user.role, location.pathname);
  if (!home) return null;
  const here = `${location.pathname}${location.search}`;
  if (sameTarget(home.to, here)) return null;

  return (
    <Link to={home.to} className="section__back">
      <Icon name="back" size={16} />
      <span>{t('common.back')}</span>
    </Link>
  );
}
