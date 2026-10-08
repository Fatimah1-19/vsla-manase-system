import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useLang } from '../context/LangContext.jsx';
import { navFor } from './navItems.js';
import Brand from './Brand.jsx';
import Icon from './Icon.jsx';
import Avatar from './Avatar.jsx';
import './Sidebar.css';

export default function Sidebar({ open, onNavigate }) {
  const { user, logout } = useAuth();
  const { t } = useLang();
  if (!user) return null;

  const items = navFor(user.role);

  return (
    <nav className={open ? 'sidebar is-open' : 'sidebar'} aria-label={t('nav.menu')}>
      <div className="sidebar__brand">
        <Brand to="/app" light size={44} />
      </div>

      <ul className="sidebar__list">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              className={({ isActive }) => (isActive ? 'sidebar__link is-on' : 'sidebar__link')}
            >
              <Icon name={item.icon} size={22} className="sidebar__icon" />
              <span>{t(item.key)}</span>
            </NavLink>
          </li>
        ))}
      </ul>

      <NavLink to="/app/profile" onClick={onNavigate} className="sidebar__me">
        <Avatar name={user.full_name} size={40} />
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