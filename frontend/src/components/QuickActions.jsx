import { Link } from 'react-router-dom';
import { useLang } from '../context/LangContext.jsx';
import Icon from './Icon.jsx';
import '../styles.css';

/**
 * Dashboard shortcuts drawn as symbols only. The label stays on the link for
 * screen readers and as the hover tooltip, but never appears on the button.
 */
export default function QuickActions({ actions }) {
  const { t } = useLang();

  return (
    <div className="quick-actions">
      {actions.map((a) => {
        const label = t(a.key);
        return (
          <Link
            key={a.to + a.key}
            to={a.to}
            className={`btn quick-actions__btn ${a.cls || ''}`.trim()}
            aria-label={label}
            title={label}
          >
            <Icon name={a.icon} size={22} />
          </Link>
        );
      })}
    </div>
  );
}
