const { query, one } = require('../config/db');
const { wrap } = require('../middleware/errorHandler');
const { sendSMS } = require('../utils/sms');
const { build } = require('../utils/messages');
const { audit } = require('../utils/audit');
const { getActiveCycle, getSetting } = require('../utils/helpers');

const getFee = async () => Number(await getSetting('registration_fee', '1000')) || 0;

// GET /api/registration-fees — every active member and whether the fee is in
const listFees = wrap(async (req, res) => {
  const fee = await getFee();

  const rows = await query(
    `SELECT m.id AS member_id, m.membership_number, m.date_joined, u.full_name, u.phone,
            (m.avatar IS NOT NULL) AS has_avatar,
            rf.id AS payment_id, rf.amount::float, rf.paid_on, rf.note,
            r.full_name AS recorded_by_name
       FROM members m
       JOIN users u ON u.id = m.user_id
       LEFT JOIN registration_fees rf ON rf.member_id = m.id
       LEFT JOIN users r ON r.id = rf.recorded_by
      WHERE m.status = 'active'
      ORDER BY (rf.id IS NULL) DESC, m.date_joined DESC, u.full_name`
  );

  const members = rows.map((r) => {
    const paid = r.payment_id != null;
    return {
      ...r,
      paid,
      amount: r.amount || 0,
      balance: paid ? 0 : fee,
    };
  });

  const paidCount = members.filter((m) => m.paid).length;
  const collected = +members.reduce((a, m) => a + (m.amount || 0), 0).toFixed(2);

  res.json({
    fee,
    members,
    totals: {
      expected: +(fee * members.length).toFixed(2),
      collected,
      outstanding: +(fee * (members.length - paidCount)).toFixed(2),
      paid_count: paidCount,
      member_count: members.length,
    },
  });
});

// POST /api/registration-fees — the treasurer or the secretary records the one-off fee
const recordFee = wrap(async (req, res) => {
  const { member_id, paid_on, note } = req.body;
  const amount = Number(req.body.amount) || (await getFee());

  if (!member_id || !amount || amount <= 0) {
    return res.status(400).json({ message: 'Choose a member and enter an amount above zero.' });
  }

  const member = await one(
    `SELECT m.id, u.full_name, u.phone, u.language FROM members m JOIN users u ON u.id = m.user_id
      WHERE m.id = $1 AND m.status = 'active'`, [member_id]
  );
  if (!member) return res.status(404).json({ message: 'That member is not active.' });

  const existing = await one(`SELECT id FROM registration_fees WHERE member_id = $1`, [member_id]);
  if (existing) {
    return res.status(409).json({ message: 'The registration fee for this member is already recorded.' });
  }

  const cycle = await getActiveCycle();
  const row = await one(
    `INSERT INTO registration_fees (member_id, cycle_id, amount, paid_on, note, recorded_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, amount::float, paid_on`,
    [member_id, cycle ? cycle.id : null, amount,
     paid_on || new Date().toISOString().slice(0, 10), note || null, req.user.id]
  );

  await audit(req.user.id, 'RECORD_REGISTRATION_FEE', 'registration_fees', row.id,
    `${member.full_name}: ${amount}`);

  const sms = await sendSMS(
    member.phone,
    build('registrationRecorded', member.language, { name: member.full_name, amount }),
    { name: member.full_name, category: 'registration', sentBy: req.user.id }
  );

  res.status(201).json({
    message: `Registration fee recorded for ${member.full_name}.`,
    payment: row, sms_sent: sms.ok,
  });
});

// DELETE /api/registration-fees/:id — admin removes a mistaken entry
const remove = wrap(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await one(`SELECT * FROM registration_fees WHERE id = $1`, [id]);
  if (!existing) return res.status(404).json({ message: 'That entry is not in the book.' });
  await query(`DELETE FROM registration_fees WHERE id = $1`, [id]);
  await audit(req.user.id, 'DELETE_REGISTRATION_FEE', 'registration_fees', id, `Removed ${existing.amount}`);
  res.json({ message: 'Entry removed.' });
});

module.exports = { listFees, recordFee, remove };
