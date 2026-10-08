import { Link } from 'react-router-dom';
import { useLang } from '../context/LangContext.jsx';
import './Brand.css';

/**
 * The group's logo and name. One place, so it looks the same everywhere.
 *   to="/"        links to a page in the app
 *   href="#top"   links to a spot on the same page
 *   light         white text, for dark backgrounds
 *   showName={false}  logo only
 */
export default function Brand({ to, href, size = 40, light = false, showName = true, spaced = false, className = '' }) {
  const { t } = useLang();

  const classes = ['brand', light ? 'brand--light' : '', spaced ? 'brand--spaced' : '', className]
    .filter(Boolean).join(' ');

  const inner = (
    <>
      <img className="brand__logo" src="/images/favicon.png" width={size} height={size} alt="" />
      {showName && <span className="brand__name">{t('app.name')}</span>}
    </>
  );

  if (to) return <Link to={to} className={classes} aria-label={t('app.name')}>{inner}</Link>;
  if (href) return <a href={href} className={classes} aria-label={t('app.name')}>{inner}</a>;
  return <span className={classes}>{inner}</span>;
}