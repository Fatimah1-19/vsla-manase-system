import { initials } from '../utils/format.js';
import Icon from './Icon.jsx';
import '../styles.css';

// Soft background / strong text pairs, taken from the app's own colours.
const COLOURS = [
  ['var(--leaf-wash)', 'var(--leaf-dark)'],
  ['var(--maize-wash)', 'var(--maize-deep)'],
  ['var(--sky-wash)', 'var(--sky)'],
  ['var(--flame-wash)', 'var(--flame)'],
];

const pick = (name) => {
  let sum = 0;
  for (const ch of String(name || '')) sum += ch.charCodeAt(0);
  return COLOURS[sum % COLOURS.length];
};

/** A round badge. With a photo (`src`) it shows the picture; otherwise the person's initials. */
export default function Avatar({ name, size = 38, className = '', src }) {
  if (src) {
    return (
      <img
        className={className ? `avatar avatar--img ${className}` : 'avatar avatar--img'}
        src={src}
        alt=""
        style={{ width: size, height: size, objectFit: 'cover' }}
      />
    );
  }
  const [bg, fg] = pick(name);
  return (
    <span
      className={className ? `avatar ${className}` : 'avatar'}
      style={{ width: size, height: size, background: bg, color: fg, fontSize: Math.round(size * 0.38) }}
      aria-hidden="true"
    >
      {name ? initials(name) : <Icon name="profile" size={Math.round(size * 0.55)} />}
    </span>
  );
}