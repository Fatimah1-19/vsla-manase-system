import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useLang } from '../context/LangContext.jsx';
import { sectionLinksFor, sectionHomeFor } from './navItems.js';
import Icon from './Icon.jsx';
import BackButton from './BackButton.jsx';
import '../styles.css';

const normalize = (s) => s.replace(/\?$/, '').replace(/^\?/, '');
const sameTarget = (a, b) => a.split('?')[0] === b.split('?')[0]
  && normalize(a.split('?')[1] || '') === normalize(b.split('?')[1] || '');

/**
 * The small tabs at the top of a section page. Every extra view of the section
 * (its history, its summary, the record form…) sits here, so the side menu can
 * stay short and clean. When someone has stepped into a sub-view, a back button
 * takes her home to the section's main entry.
 */
export default function SectionTabs() {
  const { user } = useAuth();
  const { t } = useLang();
  const location = useLocation();
  if (!user) return null;

  const links = sectionLinksFor(user.role, location.pathname);
  const home = sectionHomeFor(user.role, location.pathname);
  const here = `${location.pathname}${location.search}`;
  const onHome = home && sameTarget(home.to, here);

  const cameFrom = new URLSearchParams(location.search).get('from');
  if (links.length < 2) return cameFrom ? <BackButton /> : null;

  // A tab is on when it names the same page and the same query string.
  const isOn = (to) => to.split('?')[0] === location.pathname
    && normalize(to.split('?')[1] || '') === normalize(location.search);

  return (
    <div className="section__head">
      {!cameFrom && home && !onHome ? (
        <Link to={home.to} className="section__back">
          <Icon name="back" size={16} />
          <span>{t('common.back')}</span>
        </Link>
      ) : null}
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
    </div>
  );
}
