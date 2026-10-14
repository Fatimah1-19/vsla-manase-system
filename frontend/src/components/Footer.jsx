import { Link } from 'react-router-dom';
import { useLang } from '../context/LangContext.jsx';
import Icon from './Icon.jsx';
import Brand from './Brand.jsx';
import '../styles.css';

const PHONE = '+265 987 150 466';
const EMAIL = 'husseinfatima271@gmail.com';
const TEL = `tel:${PHONE.replace(/\s/g, '')}`;

/**
 * variant="public": the full footer on the front page.
 * variant="app":    one quiet line at the bottom of every logged-in page.
 */
export default function Footer({ variant = 'app' }) {
  const { t } = useLang();
  const year = new Date().getFullYear();

  if (variant === 'app') {
    return (
      <footer className="appfoot">
        <span>&copy; {year} {t('app.name')}</span>
        <span className="appfoot__dot" aria-hidden="true">&middot;</span>
        <span className="appfoot__item"><Icon name="lock" size={15} />{t('footer.private')}</span>
        <span className="appfoot__dot" aria-hidden="true">&middot;</span>
        <a href={TEL} className="appfoot__item"><Icon name="phone" size={15} />{t('footer.help')} {PHONE}</a>
      </footer>
    );
  }

  return (
    <footer className="sitefoot" id="contact">
      <div className="sitefoot__grid">
        <div>
          <Brand light size={44} className="sitefoot__brand" />
          <p className="sitefoot__text">{t('footer.about')}</p>
        </div>

        <nav aria-label={t('footer.explore')}>
          <h2 className="sitefoot__h">{t('footer.explore')}</h2>
          <ul className="sitefoot__list">
            <li><a href="#about"><Icon name="info" size={18} />{t('home.navAbout')}</a></li>
            <li><a href="#rules"><Icon name="rules" size={18} />{t('home.navRules')}</a></li>
            <li><a href="#faq"><Icon name="faq" size={18} />{t('home.navFaq')}</a></li>
            <li><a href="#join"><Icon name="requests" size={18} />{t('home.navJoin')}</a></li>
            <li><Link to="/login"><Icon name="login" size={18} />{t('home.login')}</Link></li>
          </ul>
        </nav>

        <div>
          <h2 className="sitefoot__h">{t('footer.contact')}</h2>
          <ul className="sitefoot__list">
            <li><span className="sitefoot__row"><Icon name="pin" size={18} />{t('footer.location')}</span></li>
            <li><a href={TEL}><Icon name="phone" size={18} />{PHONE}</a></li>
            <li><a href={`mailto:${EMAIL}`}><Icon name="mail" size={18} />{EMAIL}</a></li>
          </ul>
        </div>

        <div>
          <h2 className="sitefoot__h">{t('footer.trust')}</h2>
          <ul className="sitefoot__list">
            <li><span className="sitefoot__row"><Icon name="lock" size={18} />{t('footer.private')}</span></li>
            <li><span className="sitefoot__row"><Icon name="audit" size={18} />{t('footer.audit')}</span></li>
            <li><span className="sitefoot__row"><Icon name="messages" size={18} />{t('footer.sms')}</span></li>
          </ul>
        </div>
      </div>

      <div className="sitefoot__base">
        <span>&copy; {year} {t('app.name')}. {t('footer.rights')}</span>
        <span>{t('footer.built')}</span>
      </div>
    </footer>
  );
}