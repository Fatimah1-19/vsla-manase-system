import { Fragment } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useLang } from '../context/LangContext.jsx';
import { navFor } from './navItems.js';
import Brand from './Brand.jsx';
import Icon from './Icon.jsx';
import Avatar from './Avatar.jsx';
import '../styles.css';

export default function Sidebar({ open, onNavigate }) {
  const { user, logout, avatar } = useAuth();
  const { t } = useLang();
  const { pathname } = useLocation();
  if (!user) return null;

  // The sidebar shows only the main entry of each section. The extra views
  // (history, summary, record, change password…) live inside the page itself.
  const items = navFor(user.role).filter((i) => !i.sub);
  // How many visible entries share each group. A heading is only worth showing
  // when a group actually holds more than one entry, otherwise it just repeats
  // the entry directly below it.
  const groupCount = items.reduce((acc, i) => {
    if (i.group) acc[i.group] = (acc[i.group] || 0) + 1;
    return acc;
  }, {});
  const icon = (name) => <Icon name={name} size={22} className="sidebar__icon" />;
  // A main entry is on whenever its page is open, even if its own address
  // carries a query (e.g. the treasurer's loan applications).
  const on = (to) => to.split('?')[0] === pathname;

  return (
    <nav className={open ? 'sidebar is-open' : 'sidebar'} aria-label={t('nav.menu')}>
      <div className="sidebar__brand">
        <Brand to="/app" light size={44} />
      </div>

      <ul className="sidebar__list">
        {items.map((item, i) => (
          <Fragment key={`${item.to}-${i}`}>
             {item.group && item.group !== items[i - 1]?.group && groupCount[item.group] > 1 && (
               <li className="sidebar__group">{t(item.group)}</li>
             )}
            <li>
              {item.to.includes('?') ? (
                /* A link with a tab query is a plain link, but its page still lights up. */
                <Link
                  to={item.to}
                  onClick={onNavigate}
                  className={on(item.to) ? 'sidebar__link is-on' : 'sidebar__link'}
                >
                  {icon(item.icon)}
                  <span>{t(item.key)}</span>
                </Link>
              ) : (
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  className={({ isActive }) => (isActive ? 'sidebar__link is-on' : 'sidebar__link')}
                >
                  {icon(item.icon)}
                  <span>{t(item.key)}</span>
                </NavLink>
              )}
            </li>
          </Fragment>
        ))}
      </ul>

      <NavLink to="/app/profile" onClick={onNavigate} className="sidebar__me">
        <Avatar name={user.full_name} size={40} src={avatar || null} />
        <span className="sidebar__meText">
          <span className="sidebar__meName">{user.full_name}</span>
          <span className="sidebar__meRole">{t(`roles.${user.role}`)}</span>
        </span>
      </NavLink>

      <button type="button" className="sidebar__logout" onClick={() => logout()}>
        <Icon name="logout" size={20} />
        {t('nav.logout')}
      </button>
    </nav>
  );
}
