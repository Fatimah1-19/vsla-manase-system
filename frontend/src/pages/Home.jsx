import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { useLang } from '../context/LangContext.jsx';
import LanguageToggle from '../components/LanguageToggle.jsx';
import Footer from '../components/Footer.jsx';
import Brand from '../components/Brand.jsx';
import Icon from '../components/Icon.jsx';
import { plainNumber, money } from '../utils/format.js';
import '../styles.css';

const asList = (v) => (Array.isArray(v) ? v : []);
const FEATURE_ICONS = ['savings', 'loans', 'cycles', 'cases', 'welfare', 'members', 'wrappers', 'meetings', 'requests', 'profile', 'analytics', 'audit', 'messages'];

export default function Home() {
  const { t } = useLang();
  const [stats, setStats] = useState(null);
  const [form, setForm] = useState({ full_name: '', phone: '', village: '', reason: '' });
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/public/impact', { auth: false }).then(setStats).catch(() => setStats(null));
  }, []);

  const change = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      await api.post('/join-requests', form, { auth: false });
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // The group's rules come from the settings, so this page can never drift
  // away from what the treasurer actually applies.
  const multiplier = stats?.loan_multiplier ?? 2;
  const rate = stats?.interest_rate ?? 10;
  const levy = money(stats?.monthly_levy ?? 3000);
  const fee = money(stats?.registration_fee ?? 1000);

  const weeks = stats?.weeks_total || 52;
  const done = stats?.weeks_elapsed || 0;

  const rules = asList(t('home.rules', multiplier, rate, levy));
  const features = asList(t('home.features'));
  const roles = asList(t('home.roles'));
  const meeting = asList(t('home.meetingSteps'));
  const faq = asList(t('faq.items', multiplier, rate, levy));

  return (
    <div className="home">
      <header className="home__bar">
        <Brand href="#top" light size={44} className="home__brandlink" />
        <nav className="home__nav" aria-label="Main">
          <a href="#about"><Icon name="info" size={20} /><span>{t('home.navAbout')}</span></a>
          <a href="#rules"><Icon name="rules" size={20} /><span>{t('home.navRules')}</span></a>
          <a href="#features"><Icon name="features" size={20} /><span>{t('home.navFeatures')}</span></a>
          <a href="#faq"><Icon name="faq" size={20} /><span>{t('home.navFaq')}</span></a>
          <a href="#join"><Icon name="requests" size={20} /><span>{t('home.navJoin')}</span></a>
        </nav>
        <div className="home__baractions">
          <LanguageToggle compact />
          <Link to="/login" className="btn btn--small home__loginbtn">
            <Icon name="login" size={18} />
            {t('home.login')}
          </Link>
        </div>
      </header>

      <section className="home__hero" id="top">
        <div className="home__heroText">
          <p className="home__eyebrow">{t('home.eyebrow')}</p>
          <h1 className="home__title">{t('home.heroTitle')}</h1>
          <p className="home__lead">{t('home.heroBody')}</p>
          <div className="home__cta">
            <a href="#join" className="btn btn--gold"><Icon name="requests" size={20} />{t('home.join')}</a>
            <Link to="/login" className="btn btn--ghost"><Icon name="login" size={20} />{t('home.login')}</Link>
          </div>
        </div>

        <div className="home__heroSide">
          <img className="home__photo" src="/images/hero-bg.jpg" width="1168" height="784"
            alt={t('home.photoAlt')} />
          <div className="home__clock" aria-hidden="true">
            <div className="home__weeks">
              {Array.from({ length: weeks }, (_, i) => (
                <span key={i} className={i < done ? 'home__week is-filled' : 'home__week'} />
              ))}
            </div>
            <p className="home__clockLabel">
              <strong>{done}</strong> {t('home.weeksOf', weeks)}
              {stats?.cycle_name ? ` — ${stats.cycle_name}` : ''}
            </p>
          </div>
        </div>
      </section>

      {stats && (
        <section className="home__stats" aria-label={t('home.statsLabel')}>
          <div className="home__stat"><span className="home__statNum">{plainNumber(stats.active_members)}</span><span className="home__statLabel">{t('home.statMembers')}</span></div>
          <div className="home__stat"><span className="home__statNum">{plainNumber(stats.loans_given)}</span><span className="home__statLabel">{t('home.statLoans')}</span></div>
          <div className="home__stat"><span className="home__statNum">{stats.recovery_rate}%</span><span className="home__statLabel">{t('home.statRepaid')}</span></div>
          <div className="home__stat"><span className="home__statNum">{plainNumber(stats.meetings_held)}</span><span className="home__statLabel">{t('home.statMeetings')}</span></div>
        </section>
      )}

      <section className="home__section" id="about">
        <h2 className="home__h2">{t('home.aboutTitle')}</h2>
        <div className="home__aboutGrid">
          <div>
            <p className="home__para">{t('home.aboutBody1')}</p>
            <p className="home__para">{t('home.aboutBody2')}</p>
          </div>
          <ul className="home__values">
            {asList(t('home.values')).map((v) => (
              <li key={v.title}><strong>{v.title}</strong><span>{v.body}</span></li>
            ))}
          </ul>
        </div>
      </section>

      <section className="home__section home__section--tint" id="how">
        <h2 className="home__h2">{t('home.howTitle')}</h2>
        {/* The year really is a sequence, so numbering it is honest here. */}
        <ol className="home__steps">
          {[1, 2, 3].map((n) => (
            <li key={n}>
              <h3>{t(`home.step${n}Title`)}</h3>
              <p>{t(`home.step${n}Body`, multiplier)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="home__section" id="rules">
        <h2 className="home__h2">{t('home.rulesTitle')}</h2>
        <p className="home__sub">{t('home.rulesSub')}</p>
        <div className="home__cards">
          {rules.map((r) => (
            <article key={r.title} className="home__card home__card--rule">
              <span className="home__cardBig">{r.big}</span>
              <h3>{r.title}</h3>
              <p>{r.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="home__section home__section--tint" id="meeting">
        <h2 className="home__h2">{t('home.meetingTitle')}</h2>
        <p className="home__sub">{t('home.meetingSub')}</p>
        <ol className="home__agenda">
          {meeting.map((m) => (
            <li key={m.title}><strong>{m.title}</strong><span>{m.body}</span></li>
          ))}
        </ol>
      </section>

      <section className="home__section" id="features">
        <h2 className="home__h2">{t('home.featuresTitle')}</h2>
        <p className="home__sub">{t('home.featuresSub')}</p>
        <ul className="home__features">
          {features.map((f, i) => (
            <li key={f.title} className="home__feat">
              <span className="home__featIcon"><Icon name={FEATURE_ICONS[i]} size={22} /></span>
              <div>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="home__section home__section--tint" id="roles">
        <h2 className="home__h2">{t('home.rolesTitle')}</h2>
        <div className="home__cards home__cards--small">
          {roles.map((r) => (
            <article key={r.title} className="home__card">
              <h3>{r.title}</h3>
              <p>{r.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="home__section" id="faq">
        <h2 className="home__h2">{t('home.faqTitle')}</h2>
        <p className="home__sub">{t('home.faqSub')}</p>
        <div className="home__faq">
          {faq.map((item) => (
            <details key={item.q} className="home__qa">
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="home__join" id="join">
        <div className="home__joinWrap">
          <img className="home__joinPhoto" src="/images/join-request.jpg" alt="" loading="lazy" width="1168" height="784" />
          <div className="home__joinInner">
            <h2 className="home__h2">{t('home.joinTitle')}</h2>
            <p className="home__joinLead">{t('home.joinBody')}</p>
            <p className="home__joinFee">{t('home.joinFeeNote', fee)}</p>

            {sent ? (
              <p className="notice notice--good">{t('home.joinDone')}</p>
            ) : (
              <form onSubmit={submit} className="home__form" noValidate>
                {error && <p className="notice notice--danger" role="alert">{error}</p>}

                <div className="home__field">
                  <label className="field-label" htmlFor="jname">{t('home.joinName')}</label>
                  <input id="jname" value={form.full_name} onChange={change('full_name')} required disabled={busy} />
                </div>
                <div className="home__field">
                  <label className="field-label" htmlFor="jphone">{t('home.joinPhone')}</label>
                  <input id="jphone" type="tel" inputMode="tel" placeholder="0995727978"
                    value={form.phone} onChange={change('phone')} required disabled={busy} />
                  <span className="field-hint">{t('home.joinPhoneHint')}</span>
                </div>
                <div className="home__field">
                  <label className="field-label" htmlFor="jvillage">{t('home.joinVillage')}</label>
                  <input id="jvillage" value={form.village} onChange={change('village')} disabled={busy} />
                </div>
                <div className="home__field">
                  <label className="field-label" htmlFor="jreason">{t('home.joinReason')}</label>
                  <textarea id="jreason" rows={3} value={form.reason} onChange={change('reason')} disabled={busy} />
                </div>
                <button type="submit" className="btn btn--full" disabled={busy}>
                  {busy ? t('common.sending') : t('home.joinSubmit')}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      <Footer variant="public" />
    </div>
  );
}