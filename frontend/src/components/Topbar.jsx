import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useLang } from '../context/LangContext.jsx';
import LanguageToggle from './LanguageToggle.jsx';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import Brand from './Brand.jsx';
import '../styles.css';

export default function Topbar({ onMenu }) {
  const { user, avatar } = useAuth();
  const { t } = useLang();
  if (!user) return null;

  return (
    <header className="topbar">
      <button type="button" className="topbar__menu" onClick={onMenu} aria-label={t('nav.menu')}>
        <Icon name="menu" size={26} />
      </button>

      {/* The sidebar holds the logo on a big screen; on a phone it lives here. */}
      <Brand to="/app" showName={false} size={38} className="topbar__logo" />

      <LanguageToggle compact />

      <Link to="/app/profile" className="topbar__who" title={t('nav.profile')}>
        <Avatar name={user.full_name} size={40} src={avatar || null} />
        <span className="topbar__names">
          <span className="topbar__name">{user.full_name}</span>
          <span className="topbar__role">{t(`roles.${user.role}`)}</span>
        </span>
      </Link>
    </header>
  );
}