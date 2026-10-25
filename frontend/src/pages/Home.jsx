import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { useLang } from '../context/LangContext.jsx';
import LanguageToggle from '../components/LanguageToggle.jsx';
import Footer from '../components/Footer.jsx';
import Brand from '../components/Brand.jsx';
import Icon from '../components/Icon.jsx';
import Modal from '../components/Modal.jsx';
import { plainNumber, money } from '../utils/format.js';
import '../styles.css';

const asList = (v) => (Array.isArray(v) ? v : []);
const FEATURE_ICONS = ['savings', 'loans', 'cycles', 'cases', 'welfare', 'members', 'wrappers', 'meetings', 'requests', 'profile', 'analytics', 'audit', 'messages'];
const ROLE_ICONS = ['leadership', 'savings', 'reports', 'members'];

function checkEligibilityClient(form) {
  const checks = {
    age: false,
    identification: false,
    required_info: false,
    valid_phone: false,
    agrees_rules: false,
    no_existing_member: false,
    no_pending_request: false,
  };
  if (form.date_of_birth) {
    const d = new Date(form.date_of_birth);
    if (!Number.isNaN(d.getTime())) {
      const now = new Date();
      let age = now.getFullYear() - d.getFullYear();
      const m = now.getMonth() - d.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
      if (age >= 18) checks.age = true;
    }
  }
  if (form.national_id && String(form.national_id).trim()) checks.identification = true;
  if (String(form.full_name || '').trim() && form.phone && form.village) checks.required_info = true;
  if (/^\+?\d{8,15}$/.test(String(form.phone || '').replace(/\s+/g, ''))) checks.valid_phone = true;
  if (form.agreed_rules) checks.agrees_rules = true;
  checks.no_existing_member = true;
  checks.no_pending_request = true;
  const allPassed = Object.values(checks).every(Boolean);
  return { checks, allPassed };
}

export default function Home() {
  const { t, lang } = useLang();
  const [stats, setStats] = useState(null);
  const [form, setForm] = useState({ full_name: '', phone: '', village: '', occupation: '', reason: '', date_of_birth: '', national_id: '', agreed_rules: false });
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [qOpen, setQOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [elig, setElig] = useState(null);

  useEffect(() => {
    let alive = true;
    let tries = 0;
    // The hosted backend wakes slowly after a rest, so try a few times before
    // giving up rather than leaving the page without its numbers.
    const load = () => {
      api.get('/public/impact', { auth: false })
        .then((d) => { if (alive) setStats(d); })
        .catch(() => { if (alive && tries++ < 12) setTimeout(load, 8000); });
    };
    load();
    return () => { alive = false; };
  }, []);

  // The background questions the person answers when asking to join. These come
  // from the Settings page, so the public form always matches what the group set.
  useEffect(() => {
    let alive = true;
    let tries = 0;
    const ask = () => {
      api.get('/public/join-questions', { auth: false })
        .then((qs) => { if (alive) setQuestions(Array.isArray(qs) ? qs : []); })
        .catch(() => { if (alive && tries++ < 12) setTimeout(ask, 8000); });
    };
    ask();
    return () => { alive = false; };
  }, []);

  const change = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setAnswer = (key, value) => setAnswers((a) => ({ ...a, [key]: value }));

  const answered = questions.filter((q) => answers[q.key]).length;
  const allAnswered = questions.length === 0 || answered === questions.length;

  function runElig() {
    const e = checkEligibilityClient(form);
    setElig(e);
    return e;
  }

  async function submit(e) {
    e.preventDefault();
    if (questions.length && questions.some((q) => !answers[q.key])) {
      setError(t('home.joinBackgroundRequired'));
      return;
    }
    const e2 = runElig();
    if (!e2.allPassed) {
      setError('Not eligible to apply');
      return;
    }
    setError(''); setBusy(true);
    try {
      const res = await api.post('/join-requests', { ...form, screening: answers }, { auth: false });
      if (res.eligibility) setElig(res.eligibility);
      setSent(true);
    } catch (err) {
      setError(err.message);
      if (err?.response?.data?.eligibility) setElig(err.response.data.eligibility);
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

      <section className="home__stats" aria-label={t('home.statsLabel')}>
        <div className="home__stat"><span className="home__statNum">{stats ? plainNumber(stats.active_members) : '—'}</span><span className="home__statLabel">{t('home.statMembers')}</span></div>
        <div className="home__stat"><span className="home__statNum">{stats ? plainNumber(stats.loans_given) : '—'}</span><span className="home__statLabel">{t('home.statLoans')}</span></div>
        <div className="home__stat"><span className="home__statNum">{stats ? `${stats.recovery_rate}%` : '—'}</span><span className="home__statLabel">{t('home.statRepaid')}</span></div>
        <div className="home__stat"><span className="home__statNum">{stats ? plainNumber(stats.meetings_held) : '—'}</span><span className="home__statLabel">{t('home.statMeetings')}</span></div>
      </section>

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
        <ul className="home__rules">
          {rules.map((r) => (
            <li key={r.title} className="home__rule">
              <span className="home__ruleBadge">{r.icon ? <Icon name={r.icon} size={20} /> : r.big}</span>
              <div>
                <h3>{r.title}</h3>
                <p>{r.body}</p>
              </div>
            </li>
          ))}
        </ul>
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
        <ul className="home__features">
          {roles.map((r, i) => (
            <li key={r.title} className="home__feat">
              <span className="home__featIcon"><Icon name={ROLE_ICONS[i]} size={22} /></span>
              <div>
                <h3>{r.title}</h3>
                <p>{r.body}</p>
              </div>
            </li>
          ))}
        </ul>
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
                  <label className="field-label" htmlFor="jdob">Date of birth</label>
                  <input id="jdob" type="date" value={form.date_of_birth} onChange={change('date_of_birth')} disabled={busy} />
                </div>
                <div className="home__field">
                  <label className="field-label" htmlFor="jnid">National ID / Identification</label>
                  <input id="jnid" value={form.national_id} onChange={change('national_id')} disabled={busy} />
                </div>
                <div className="home__field">
                  <label className="field-label" htmlFor="joccupation">{t('home.joinOccupation')}</label>
                  <input id="joccupation" value={form.occupation} onChange={change('occupation')} disabled={busy} />
                </div>
                <div className="home__field">
                  <label className="field-label" htmlFor="jreason">{t('home.joinReason')}</label>
                  <textarea id="jreason" rows={3} value={form.reason} onChange={change('reason')} disabled={busy} />
                </div>
                <div className="home__field">
                  <label>
                    <input type="checkbox" checked={!!form.agreed_rules} onChange={(e) => setForm((f) => ({ ...f, agreed_rules: e.target.checked }))} disabled={busy} /> I agree to follow the VSLA rules and membership terms
                  </label>
                </div>

                {questions.length > 0 && (
                  <div className="home__field home__bg">
                    <span className="field-label">{t('home.joinBackground')}</span>
                    <button type="button" className="btn btn--ghost home__bgOpen"
                      onClick={() => setQOpen(true)} disabled={busy}>
                      <Icon name="faq" size={18} />
                      {t('home.joinAnswerQuestions')}
                    </button>
                    <span className={allAnswered ? 'field-hint is-good' : 'field-hint'}>
                      {allAnswered
                        ? t('home.joinAnsweredAll')
                        : t('home.joinAnswered', answered, questions.length)}
                    </span>
                  </div>
                )}

                <div className="home__field">
                  <span className="field-label">Eligibility screening</span>
                  <button type="button" className="btn btn--ghost" onClick={runElig} disabled={busy}>Check eligibility</button>
                  {elig && (
                    <ul>
                      <li>Age requirement (>=18): {elig.checks?.age ? '✓ Passed' : '✗ Failed'}</li>
                      <li>Identification provided: {elig.checks?.identification ? '✓ Passed' : '✗ Failed'}</li>
                      <li>Required information: {elig.checks?.required_info ? '✓ Passed' : '✗ Failed'}</li>
                      <li>Valid phone number: {elig.checks?.valid_phone ? '✓ Passed' : '✗ Failed'}</li>
                      <li>Agrees to VSLA rules: {elig.checks?.agrees_rules ? '✓ Passed' : '✗ Failed'}</li>
                      <li>Existing membership: {elig.checks?.no_existing_member ? '✓ Passed' : '✗ Failed'}</li>
                      <li>Existing pending request: {elig.checks?.no_pending_request ? '✓ Passed' : '✗ Failed'}</li>
                    </ul>
                  )}
                  {elig && (elig.allPassed ? <p className="notice notice--good">Eligible to apply</p> : <p className="notice notice--danger">Not eligible to apply</p>)}
                </div>

                <button type="submit" className="btn btn--full" disabled={busy || !allAnswered || !elig?.allPassed}>
                  {busy ? t('common.sending') : t('home.joinSubmit')}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      <Modal
        open={qOpen}
        title={t('home.joinBackground')}
        onClose={() => setQOpen(false)}
        footer={
          <button type="button" className="btn" onClick={() => setQOpen(false)}>
            {t('home.joinAnswerDone')}
          </button>
        }
      >
        <p className="field-hint">{t('home.joinBackgroundHint')}</p>
        <ul className="home__bgList">
          {questions.map((qq) => {
            const qtext = lang === 'en' ? qq.en : qq.ny;
            return (
              <li key={qq.key} className="home__bgItem">
                <span className="home__bgQ">{qtext}</span>
                <div className="home__bgBtns" role="group" aria-label={qtext}>
                  <button type="button"
                    className={answers[qq.key] === 'yes' ? 'home__bgBtn is-on' : 'home__bgBtn'}
                    onClick={() => setAnswer(qq.key, 'yes')} disabled={busy}
                    aria-pressed={answers[qq.key] === 'yes'}>{t('common.yes')}</button>
                  <button type="button"
                    className={answers[qq.key] === 'no' ? 'home__bgBtn is-on' : 'home__bgBtn'}
                    onClick={() => setAnswer(qq.key, 'no')} disabled={busy}
                    aria-pressed={answers[qq.key] === 'no'}>{t('common.no')}</button>
                </div>
              </li>
            );
          })}
        </ul>
      </Modal>

      <Footer variant="public" />
    </div>
  );
}