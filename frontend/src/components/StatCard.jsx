import Icon from './Icon.jsx';
import './StatCard.css';

/**
 * One figure with its label. `tone` tints the rule above the number:
 * gold for money, red for something that needs attention.
 * `icon` (an Icon name) puts a small badge in the corner.
 */
export default function StatCard({ label, value, hint, tone = 'plain', big = false, icon, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={`stat stat--${tone}${onClick ? ' stat--clickable' : ''}`}
      onClick={onClick}
    >
      {icon && <span className="stat__icon"><Icon name={icon} size={16} /></span>}
      <span className="stat__label">{label}</span>
      <span className={big ? 'stat__value stat__value--big money' : 'stat__value money'}>{value}</span>
      {hint && <span className="stat__hint">{hint}</span>}
    </Tag>
  );
}
