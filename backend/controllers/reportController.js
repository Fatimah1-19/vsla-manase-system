const { query } = require('../config/db');
const { wrap } = require('../middleware/errorHandler');

// The register only ever shows one status at a time: someone who missed the
// meeting, or someone who said beforehand that they could not come.
const wantedStatus = (v) => (v === 'excused' ? 'excused' : 'absent');

/**
 * One line for every meeting somebody missed.
 * GET /api/reports/absentees?status=&from=&to=&cycleId=&memberId=
 */
const listAbsentees = wrap(async (req, res) => {
  const params = [wantedStatus(req.query.status)];
  const where = ['a.status = $1'];
  let idx = 2;

  if (req.query.cycleId) { params.push(req.query.cycleId); where.push(`mt.cycle_id = $${idx++}`); }
  if (req.query.memberId) { params.push(req.query.memberId); where.push(`a.member_id = $${idx++}`); }
  if (req.query.from) { params.push(req.query.from); where.push(`mt.meeting_date >= $${idx++}`); }
  if (req.query.to) { params.push(req.query.to); where.push(`mt.meeting_date <= $${idx++}`); }

  const rows = await query(
    `SELECT a.id, a.status, a.meeting_id, a.member_id,
            mt.meeting_date, mt.agenda,
            m.membership_number, u.full_name,
            c.id AS cycle_id, c.cycle_name,
            (SELECT COUNT(1)::int
               FROM fines f
              WHERE f.member_id = a.member_id
                AND f.date = mt.meeting_date
                AND f.paid = FALSE) AS unpaid_fines_on_date
       FROM attendance a
       JOIN meetings mt ON mt.id = a.meeting_id
       JOIN members  m  ON m.id  = a.member_id
       JOIN users    u  ON u.id  = m.user_id
       LEFT JOIN cycles c ON c.id = mt.cycle_id
      WHERE ${where.join(' AND ')}
      ORDER BY mt.meeting_date DESC, u.full_name`,
    params
  );
  res.json(rows);
});

/**
 * The same absences rolled up per member: how often, how often lately, last time.
 * GET /api/reports/absentee-register?status=&from=&to=&cycleId=&memberId=
 */
const listAbsenteeRegister = wrap(async (req, res) => {
  const params = [wantedStatus(req.query.status)];
  const where = ['a.status = $1'];
  let idx = 2;

  if (req.query.cycleId) { params.push(req.query.cycleId); where.push(`mt.cycle_id = $${idx++}`); }
  if (req.query.memberId) { params.push(req.query.memberId); where.push(`a.member_id = $${idx++}`); }
  if (req.query.from) { params.push(req.query.from); where.push(`mt.meeting_date >= $${idx++}`); }
  if (req.query.to) { params.push(req.query.to); where.push(`mt.meeting_date <= $${idx++}`); }

  const rows = await query(
    `SELECT m.id AS member_id, m.membership_number, u.full_name,
            COUNT(1)::int AS total_absences,
            (COUNT(1) FILTER (WHERE mt.meeting_date >= CURRENT_DATE - INTERVAL '30 days'))::int AS absences_last_30,
            MAX(mt.meeting_date) AS last_absence_date
       FROM attendance a
       JOIN meetings mt ON mt.id = a.meeting_id
       JOIN members  m  ON m.id  = a.member_id
       JOIN users    u  ON u.id  = m.user_id
      WHERE ${where.join(' AND ')}
      GROUP BY m.id, m.membership_number, u.full_name
      ORDER BY total_absences DESC, u.full_name`,
    params
  );
  res.json(rows);
});

module.exports = { listAbsentees, listAbsenteeRegister };
