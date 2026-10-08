/**
 * Every member pays a fixed amount each month for the group's wrappers.
 * These helpers work out which months are due and who is behind.
 */
const { query, one } = require('../config/db');
const { getActiveCycle, getSetting } = require('./helpers');

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** ['2026-01','2026-02',...] from startYm to endYm inclusive. */
function monthsBetween(startYm, endYm) {
  const out = [];
  let [y, m] = startYm.split('-').map(Number);
  const [ey, em] = endYm.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

const getLevy = async () => Number(await getSetting('monthly_levy', '3000'));

/**
 * Who owes what for the months that have started in the current cycle.
 * A member only owes from the month they joined.
 */
async function arrears() {
  const [cycle, levy] = await Promise.all([getActiveCycle(), getLevy()]);
  if (!cycle) return { cycle: null, levy, rows: [], total_owed: 0 };

  // Three independent questions, asked together instead of one after another.
  const [span, members, paidRows] = await Promise.all([
    one(
      `SELECT to_char(start_date,'YYYY-MM') AS s, to_char(end_date,'YYYY-MM') AS e FROM cycles WHERE id = $1`,
      [cycle.id]
    ),
    query(
      `SELECT m.id AS member_id, m.membership_number, u.full_name, u.phone,
              to_char(m.date_joined,'YYYY-MM') AS joined
         FROM members m JOIN users u ON u.id = m.user_id
        WHERE m.status = 'active' ORDER BY u.full_name`
    ),
    query(
      `SELECT member_id, COALESCE(SUM(amount),0)::float AS paid
         FROM monthly_contributions WHERE cycle_id = $1 GROUP BY member_id`,
      [cycle.id]
    ),
  ]);

  const now = currentMonth();
  const last = now < span.e ? now : span.e;
  const paidBy = Object.fromEntries(paidRows.map((r) => [r.member_id, r.paid]));

  const rows = members.map((m) => {
    const from = m.joined > span.s ? m.joined : span.s;
    const months_due = from <= last ? monthsBetween(from, last).length : 0;
    const expected = months_due * levy;
    const paid = paidBy[m.member_id] || 0;
    return { ...m, months_due, expected, paid, owed: Math.max(0, +(expected - paid).toFixed(2)) };
  });

  return {
    cycle, levy,
    rows: rows.filter((r) => r.owed > 0).sort((a, b) => b.owed - a.owed),
    all: rows,
    total_owed: +rows.reduce((a, r) => a + r.owed, 0).toFixed(2),
  };
}

module.exports = { MONTH_RE, currentMonth, monthsBetween, getLevy, arrears };