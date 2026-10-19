import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useLang } from '../context/LangContext.jsx';
import { sectionLinksFor } from './navItems.js';
import '../styles.css';

const normalize = (s) => s.replace(/\?$/, '').replace(/^\?/, '');

/**
 * The small tabs at the top of a section page. Every extra view of the section
 * (its history, its summary, the record form…) sits here, so the side menu can
 * stay short and clean. Built from the same nav list as the menu.
 */
export default function SectionTabs() {
  const { user } = useAuth();
  const { t } = useLang();
  const location = useLocation();
  if (!user) return null;

  const links = sectionLinksFor(user.role, location.pathname);
  if (links.length < 2) return null;

  // A tab is on when it names the same page and the same query string.
  const isOn = (to) => to.split('?')[0] === location.pathname
    && normalize(to.split('?')[1] || '') === normalize(location.search);

  return (
    <div className="section__tabs" role="tablist">
      {links.map((item) => (
        <Link
          key={item.key}
          to={item.to}
          className={isOn(item.to) ? 'section__tab is-on' : 'section__tab'}
        >
          {t(item.label || item.key)}
        </Link>
      ))}
    </div>
  );
}
