import { Fragment, useEffect, useMemo, useState } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useLang } from '../context/LangContext.jsx';
import { sidebarFor } from './navItems.js';
import Brand from './Brand.jsx';
import Icon from './Icon.jsx';
import Avatar from './Avatar.jsx';
import '../styles.css';

export default function Sidebar({ open, onNavigate }) {
  const { user, logout, avatar } = useAuth();
  const { t } = useLang();
  const { pathname, search } = useLocation();
  const [openGroups, setOpenGroups] = useState({});

  const items = useMemo(() => (user ? sidebarFor(user.role) : []), [user]);

  // Start each page with the relevant group open and the others closed.
  useEffect(() => { setOpenGroups({}); }, [pathname, search]);

  if (!user) return null;

  // The flat menus still show a heading only when a group holds more than one
  // entry; the chairperson's grouped menu supplies its own headings.
  const groupCount = items.reduce((acc, i) => {
    if (i.group) acc[i.group] = (acc[i.group] || 0) + 1;
    return acc;
  }, {});
  const icon = (name, size = 22) => <Icon name={name} size={size} className="sidebar__icon" />;
  // A flat entry is on whenever its page is open, even if its own address
  // carries a query (e.g. the treasurer's loan applications).
  const on = (to) => to.split('?')[0] === pathname;

  // A grouped child is only on when its page and its own query match.
  const childOn = (to) => {
    const [path, query = ''] = to.split('?');
    if (path !== pathname) return false;
    const current = new URLSearchParams(search);
    for (const [key, value] of new URLSearchParams(query)) {
      if (current.get(key) !== value) return false;
    }
    return true;
  };
  const groupOn = (item) => item.children.some((child) => child.to.split('?')[0] === pathname);
  const expanded = (item) => openGroups[item.key] ?? groupOn(item);
  const toggleGroup = (item) => {
    setOpenGroups((prev) => ({ ...prev, [item.key]: !expanded(item) }));
  };

  return (
    <nav className={open ? 'sidebar is-open' : 'sidebar'} aria-label={t('nav.menu')}>
      <div className="sidebar__brand">
        <Brand to="/app" light size={44} />
      </div>

      <ul className="sidebar__list">
        {items.map((item, i) => (
          <Fragment key={item.children ? item.key : `${item.to}-${i}`}>
            {item.group && item.group !== items[i - 1]?.group && groupCount[item.group] > 1 && (
              <li className="sidebar__group">{t(item.group)}</li>
            )}
            <li>
              {item.children ? (
                <div className="sidebar__groupWrap">
                  <button
                    type="button"
                    className={[
                      'sidebar__groupToggle',
                      groupOn(item) ? 'is-active' : '',
                      expanded(item) ? 'is-open' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => toggleGroup(item)}
                    aria-expanded={expanded(item)}
                    aria-controls={`sidebar-${item.key}`}
                  >
                    {icon(item.icon)}
                    <span>{t(item.key)}</span>
                    <Icon name="chevron" size={16} className="sidebar__chevron" />
                  </button>
                  {expanded(item) && (
                    <ul className="sidebar__children" id={`sidebar-${item.key}`}>
                      {item.children.map((child) => {
                        const current = childOn(child.to);
                        return (
                          <li key={`${child.to}-${child.key}`}>
                            <Link
                              to={child.to}
                              onClick={onNavigate}
                              className={current ? 'sidebar__sublink is-on' : 'sidebar__sublink'}
                              aria-current={current ? 'page' : undefined}
                            >
                              {icon(child.icon, 18)}
                              <span>{t(child.key)}</span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              ) : item.to.includes('?') ? (
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
