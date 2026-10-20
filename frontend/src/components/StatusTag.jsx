import { useLang } from '../context/LangContext.jsx';
import '../styles.css';

/**
 * The group's status vocabulary, in one place.
 *
 * §24 of the specification names seven badges. Every one of them has a home
 * here, so a status looks the same everywhere it appears:
 *
 *   ACTIVE       green   — in force, running, healthy
 *   PAID         green   — a debt is settled
 *   COMPLETED    green   — a cycle or share-out is finished
 *   PENDING      gold    — waiting on a person or a vote
 *   OUTSTANDING  gold    — still owed, but not yet late
 *   OVERDUE      red     — past its date
 *   CANCELLED    grey    — withdrawn, turned down, or no longer standing
 *
 * The statuses the books actually store (pending, approved, repaid, draft,
 * confirmed, distributed, …) are mapped to the same seven tones. A status with
 * no mapping falls back to grey, so it is visible but never shouts.
 */
export const STATUS_TONE = {
  // --- the seven named badges ---
  active: 'green',
  paid: 'green',
  completed: 'green',
  pending: 'gold',
  outstanding: 'gold',
  overdue: 'red',
  cancelled: 'grey',
  canceled: 'grey',

  // --- money statuses as the books store them ---
  draft: 'gold',
  confirmed: 'blue',
  distributed: 'green',
  approved: 'green',
  pending_verification: 'gold',
  pendingVerification: 'gold',
  verified: 'green',
  running: 'green',
  repaid: 'green',
  cleared: 'green',
  settled: 'green',
  fullyPaid: 'green',
  absent: 'red',
  rejected: 'red',
  defaulted: 'red',
  failed: 'red',
  unpaid: 'gold',
  dueSoon: 'gold',
  due: 'gold',
  waiting: 'gold',
  open: 'gold',
  partial: 'gold',
  inactive: 'red',
  locked: 'gold',
  withdrawn: 'grey',
  closed: 'grey',
  excused: 'blue',
  sent: 'green',
  not_set: 'grey',
  off: 'grey',
};

/** The tone for a status, defaulting to grey. Case-insensitive. */
export function toneFor(status) {
  if (status == null) return 'grey';
  const key = String(status).trim();
  if (STATUS_TONE[key]) return STATUS_TONE[key];
  const lower = key.toLowerCase();
  return STATUS_TONE[lower] || 'grey';
}

/**
 * A status badge. Pass either a raw status (`status="overdue"`, tone looked
 * up automatically) or an explicit `tone`, and the text to show as children.
 * When no children are given, the status itself is translated from the
 * `status` i18n block, falling back to the raw words.
 */
export default function StatusTag({ status, tone, children, className = '' }) {
  const { t } = useLang();
  const resolved = tone || toneFor(status);
  const key = String(status == null ? '' : status).toLowerCase();
  const looked = t(`status.${key}`);
  // t() returns the key itself when the translation is missing.
  const label = children != null
    ? children
    : looked === `status.${key}` ? humanise(status) : looked;

  return <span className={`tag tag--${resolved} ${className}`.trim()}>{label}</span>;
}

/** `dueSoon` -> `Due soon`, so an unmapped status still reads cleanly. */
function humanise(status) {
  const s = String(status == null ? '' : status)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '—';
}
