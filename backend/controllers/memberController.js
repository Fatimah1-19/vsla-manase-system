const { query, one } = require('../config/db');
const { wrap } = require('../middleware/errorHandler');

const MEMBER_SUMMARY = `
  SELECT m.id, m.membership_number, m.date_joined, m.status, m.village, m.address,
         m.next_of_kin, m.next_of_kin_phone, m.gender, m.marital_status, m.date_of_birth, m.occupation,
         u.id AS user_id, u.full_name, u.phone, u.username, u.role, u.language, u.is_active,
         (m.avatar IS NOT NULL) AS has_avatar,
         COALESCE((SELECT SUM(s.amount) FROM savings s WHERE s.member_id = m.id), 0)::float AS total_savings,
         COALESCE((SELECT SUM(s.shares) FROM savings s WHERE s.member_id = m.id), 0)::int   AS total_shares,
         COALESCE((SELECT SUM(f.amount) FROM fines f WHERE f.member_id = m.id AND f.paid = FALSE), 0)::float AS unpaid_fines,
         (SELECT COUNT(*)::int FROM loans l WHERE l.member_id = m.id AND l.status = 'approved') AS active_loans
    FROM members m
    JOIN users u ON u.id = m.user_id
`;

// GET /api/members
const listMembers = wrap(async (req, res) => {
  const includeInactive = String(req.query.all) === 'true';
  const rows = await query(
    `${MEMBER_SUMMARY} ${includeInactive ? '' : "WHERE m.status = 'active'"} ORDER BY u.full_name`
  );
  res.json(rows);
});

// GET /api/members/:id
const getMember = wrap(async (req, res) => {
  const id = Number(req.params.id);

  // A plain member may only look at her own record.
  if (req.user.role === 'member' && req.user.member_id !== id) {
    return res.status(403).json({ message: 'You can only view your own record.' });
  }

  const member = await one(`${MEMBER_SUMMARY} WHERE m.id = $1`, [id]);
  if (!member) return res.status(404).json({ message: 'That member is not on the list.' });

  const [savings, loans, fines, attendance, documents, wrappers] = await Promise.all([
    query(`SELECT id, amount::float, shares, date, note FROM savings WHERE member_id = $1 ORDER BY date DESC, id DESC`, [id]),
    query(
      `SELECT l.id, l.amount::float, l.with_interest, l.interest_rate::float, l.status, l.due_date, l.purpose,
              COALESCE((SELECT SUM(r.amount) FROM loan_repayments r WHERE r.loan_id = l.id), 0)::float AS total_repaid
         FROM loans l WHERE l.member_id = $1 ORDER BY l.id DESC`, [id]),
    query(`SELECT id, amount::float, reason, paid, date FROM fines WHERE member_id = $1 ORDER BY date DESC`, [id]),
    query(
      `SELECT a.status, mt.meeting_date FROM attendance a
         JOIN meetings mt ON mt.id = a.meeting_id
        WHERE a.member_id = $1 ORDER BY mt.meeting_date DESC LIMIT 12`, [id]),
    query(`SELECT id, document_type, original_name, mime_type, size_bytes, uploaded_at
             FROM member_documents WHERE member_id = $1 ORDER BY id DESC`, [id]),
    one(`SELECT COALESCE(SUM(amount),0)::float AS total_paid, COUNT(*)::int AS payments
           FROM monthly_contributions WHERE member_id = $1`, [id]),
  ]);

  const loansWithBalance = loans.map((l) => {
    const interest = l.with_interest ? +((l.amount * l.interest_rate) / 100).toFixed(2) : 0;
    const totalDue = +(l.amount + interest).toFixed(2);
    return { ...l, interest_amount: interest, total_due: totalDue,
             outstanding: Math.max(0, +(totalDue - l.total_repaid).toFixed(2)) };
  });

  res.json({ member, savings, loans: loansWithBalance, fines, attendance, documents, wrappers });
});

// GET /api/members/me — shortcut for the logged-in woman
const getMyRecord = wrap(async (req, res) => {
  if (!req.user.member_id) return res.status(404).json({ message: 'You do not have a member record yet.' });
  req.params.id = String(req.user.member_id);
  return getMember(req, res);
});

// GET /api/members/:id/avatar — the picture that shows next to names on the screens
const getMemberAvatar = wrap(async (req, res) => {
  const id = Number(req.params.id);
  // A plain member may only pull up her own picture.
  if (req.user.role === 'member' && req.user.member_id !== id) {
    return res.status(403).json({ message: 'You can only view your own picture.' });
  }
  const row = await one(`SELECT avatar, avatar_mime FROM members WHERE id = $1`, [id]);
  if (!row || !row.avatar) return res.status(404).json({ message: 'No profile picture yet.' });

  res.setHeader('Content-Type', row.avatar_mime || 'image/jpeg');
  res.setHeader('Cache-Control', 'private, max-age=300, immutable');
  res.send(row.avatar);
});

module.exports = { listMembers, getMember, getMyRecord, getMemberAvatar };
