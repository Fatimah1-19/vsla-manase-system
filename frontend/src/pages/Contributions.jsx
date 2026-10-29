import { Link, useSearchParams } from 'react-router-dom';
import { useLang } from '../context/LangContext.jsx';
import Welfare from './Welfare.jsx';
import Wrappers from './Wrappers.jsx';
import '../styles.css';

/** The treasurer's contribution book: welfare fund and monthly groceries. */
export default function Contributions() {
  const { t } = useLang();
  const [params] = useSearchParams();
  const tab = params.get('tab') === 'groceries' ? 'groceries' : 'welfare';

  return (
    <div className="contributions">
      <div className="section__tabs contributions__tabs" role="tablist" aria-label={t('nav.contributions')}>
        <Link
          to="/app/contributions"
          replace
          role="tab"
          aria-selected={tab === 'welfare'}
          className={tab === 'welfare' ? 'section__tab is-on' : 'section__tab'}
        >
          {t('nav.welfare')}
        </Link>
        <Link
          to="/app/contributions?tab=groceries"
          replace
          role="tab"
          aria-selected={tab === 'groceries'}
          className={tab === 'groceries' ? 'section__tab is-on' : 'section__tab'}
        >
          {t('nav.groceries')}
        </Link>
      </div>

      {tab === 'groceries' ? <Wrappers /> : <Welfare />}
    </div>
  );
}
