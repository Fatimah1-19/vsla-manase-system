const bcrypt = require('bcryptjs');
const { query, one, tx } = require('../config/db');
const { wrap } = require('../middleware/errorHandler');
const { sendSMS } = require('../utils/sms');
const { build } = require('../utils/messages');
const { audit } = require('../utils/audit');
const { normalisePhone } = require('../utils/sms');
const { generateUsername, nextMembershipNumber, tempPassword } = require('../utils/helpers');
const rules = require('../utils/cases');
const { getScreeningQuestions } = require('../utils/screening');

// POST /api/join-requests — public, no login
const submitRequest = wrap(async (req, res) => {
  const { full_name, phone, village, occupation, reason, screening } = req.body;
  if (!full_name || !phone) {
    return res.status(400).json({ message: 'Enter your name and phone number.' });
  }
  if (!normalisePhone(phone)) {
    return res.status(400).json({ message: 'Enter a phone number like 0995727978.' });
  }

  const duplicate = await one(
    `SELECT id FROM join_requests WHERE phone = $1 AND status = 'pending'`, [phone]
  );
  if (duplicate) {
    return res.status(409).json({ message: 'A request from this number is already waiting for the group.' });
  }

  // The applicant answers the background questions in the join form. Keep only
  // answers to the questions that are actually in force right now.
  const questions = await getScreeningQuestions();
  const answers = cleanScreening(screening, questions.map((q) => q.id));

  const row = await one(
    `INSERT INTO join_requests (full_name, phone, village, occupation, reason, screening) VALUES ($1,$2,$3,$4,$5,$6::jsonb) RETURNING id`,
    [String(full_name).trim(), phone, village || null,
     occupation ? String(occupation).trim().slice(0, 120) : null,
     reason || null, JSON.stringify(answers)]
  );

  await audit(null, 'SUBMIT_JOIN_REQUEST', 'join_requests', row.id, full_name);

  res.status(201).json({
    message: 'Your request has been sent. The group will talk about it at the next meeting.',
    request_id: row.id,
  });
});

// Keep only the group's current questions, each answered 'yes' or 'no'.
function cleanScreening(input, keys) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  for (const key of keys) {
    if (input[key] === 'yes' || input[key] === 'no') out[key] = input[key];
  }
  return out;
}

// GET /api/public/join-questions — the questions an applicant answers. No login.
const publicQuestions = wrap(async (req, res) => {
  const questions = await getScreeningQuestions();
  // Which answer counts in favour is hidden here, so answers are given honestly.
  res.json(questions.map((q) => ({ key: q.id, en: q.en, ny: q.ny })));
});

// GET /api/join-requests — with the group's votes so far
const listRequests = wrap(async (req, res) => {
  const questions = await getScreeningQuestions();

  const rows = await query(
    `SELECT jr.*, u.full_name AS decided_by_name,
            (SELECT COUNT(*)::int FROM join_request_votes v WHERE v.request_id = jr.id AND v.vote = 'yes') AS yes_votes,
            (SELECT COUNT(*)::int FROM join_request_votes v WHERE v.request_id = jr.id AND v.vote = 'no')  AS no_votes,
            (SELECT v.vote FROM join_request_votes v WHERE v.request_id = jr.id AND v.user_id = $1) AS my_vote
       FROM join_requests jr
       LEFT JOIN users u ON u.id = jr.decided_by
      ORDER BY CASE jr.status WHEN 'pending' THEN 0 ELSE 1 END, jr.created_at DESC`,
    [req.user.id]
  );

  // Each request already carries the applicant's own answers in jr.screening.

  const voters = await one(
    `SELECT COUNT(*)::int AS c FROM users WHERE is_active = TRUE`
  );
  const localised = questions.map((q) => ({
    key: q.id,
    good: q.good,
    q: req.user.language === 'en' ? q.en : q.ny,
  }));
  res.json({ requests: rows, eligible_voters: voters.c, screening_questions: localised });
});

// POST /api/join-requests/:id/vote — the group decides, not one person
const vote = wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { vote: choice, comment } = req.body;

  if (!['yes', 'no'].includes(choice)) {
    return res.status(400).json({ message: 'Vote yes or no.' });
  }

  // A vote belongs to a member. Someone with no member record (for example a
  // System Administrator who is not also a member) or a suspended member may not
  // vote; the same rule the member-case votes use.
  const me = req.user.member_id;
  if (!me) return res.status(403).json({ message: 'Only members can vote.' });
  const mine = await one(`SELECT status FROM members WHERE id = $1`, [me]);
  const verdict = rules.canVote({
    memberStatus: mine && mine.status, userActive: req.user.is_active, memberId: me, subjectMemberId: null,
  });
  if (!verdict.ok) return res.status(403).json({ message: verdict.message });

  const request = await one(`SELECT * FROM join_requests WHERE id = $1`, [id]);
  if (!request) return res.status(404).json({ message: 'That request does not exist.' });
  if (request.status !== 'pending') return res.status(400).json({ message: 'The group has already decided this one.' });

  await query(
    `INSERT INTO join_request_votes (request_id, user_id, vote, comment) VALUES ($1,$2,$3,$4)
     ON CONFLICT (request_id, user_id) DO UPDATE SET vote = EXCLUDED.vote, comment = EXCLUDED.comment, voted_at = NOW()`,
    [id, req.user.id, choice, comment || null]
  );

  const tally = await one(
    `SELECT COUNT(*) FILTER (WHERE vote = 'yes')::int AS yes,
            COUNT(*) FILTER (WHERE vote = 'no')::int  AS no
       FROM join_request_votes WHERE request_id = $1`, [id]
  );

  await audit(req.user.id, 'VOTE_JOIN_REQUEST', 'join_requests', id, request.full_name);
  res.json({ message: 'Your vote has been recorded.', tally });
});

/**
 * PATCH /api/join-requests/:id  { status: 'approved' | 'rejected' }
 * A committee member records what the group decided. On approval she gets an
 * account and her username and temporary password by SMS.
 */
const decideRequest = wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { status, language = 'ny' } = req.body;
  // Whoever joins from the public form is an ordinary member. The role is never
  // taken from the request body, so nobody can talk their way into an office.
  const role = 'member';

  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ message: 'The decision must be approved or rejected.' });
  }

  const request = await one(`SELECT * FROM join_requests WHERE id = $1`, [id]);
  if (!request) return res.status(404).json({ message: 'That request does not exist.' });
  if (request.status !== 'pending') return res.status(400).json({ message: 'That request was already decided.' });

  // The decision follows the group's vote; it never replaces it. Half the
  // eligible voters must have voted, and an approval needs a yes majority.
  const voters = await one(`SELECT COUNT(*)::int AS c FROM users WHERE is_active = TRUE`);
  const votes = await one(
    `SELECT COUNT(*) FILTER (WHERE vote = 'yes')::int AS yes,
            COUNT(*) FILTER (WHERE vote = 'no')::int  AS no
       FROM join_request_votes WHERE request_id = $1`, [id]
  );
  const turnout = votes.yes + votes.no;
  const needed = rules.quorumNeeded(voters.c, 50);
  if (turnout < needed) {
    return res.status(400).json({
      message: `The group is still voting: ${turnout} of ${needed} votes needed are in.`,
    });
  }
  if (status === 'approved' && votes.yes <= votes.no) {
    return res.status(400).json({
      message: 'The group did not approve this request. Record a rejection instead.',
    });
  }

  if (status === 'rejected') {
    await query(
      `UPDATE join_requests SET status = 'rejected', decided_by = $2, decided_at = NOW() WHERE id = $1`,
      [id, req.user.id]
    );
    await audit(req.user.id, 'REJECT_JOIN_REQUEST', 'join_requests', id, request.full_name);
    await sendSMS(request.phone, build('memberRejected', language, { name: request.full_name }),
      { name: request.full_name, category: 'join_request', sentBy: req.user.id });
    return res.json({ message: `${request.full_name} has been told the group could not take them this cycle.` });
  }

  const username = await generateUsername(request.full_name);
  const plain = tempPassword();
  const hashed = await bcrypt.hash(plain, 10);

  const created = await tx(async (client) => {
    const { rows: userRows } = await client.query(
      `INSERT INTO users (username, password, role, full_name, phone, language, must_change_password)
       VALUES ($1,$2,$3,$4,$5,$6,TRUE) RETURNING id, username, full_name, language`,
      [username, hashed, role, request.full_name, request.phone,
       language === 'en' ? 'en' : 'ny']
    );
    const user = userRows[0];

    const membershipNumber = await nextMembershipNumber();
    const { rows: memberRows } = await client.query(
      `INSERT INTO members (user_id, membership_number, village) VALUES ($1,$2,$3) RETURNING id, membership_number`,
      [user.id, membershipNumber, request.village]
    );

    await client.query(
      `UPDATE join_requests SET status = 'approved', decided_by = $2, decided_at = NOW() WHERE id = $1`,
      [id, req.user.id]
    );
    return { user, member: memberRows[0] };
  });

  await audit(req.user.id, 'APPROVE_JOIN_REQUEST', 'join_requests', id,
    `${request.full_name} joined as ${created.member.membership_number}`);

  const sms = await sendSMS(
    request.phone,
    build('memberApproved', created.user.language, {
      name: request.full_name, username: created.user.username, password: plain,
    }),
    { name: request.full_name, category: 'join_request', sentBy: req.user.id }
  );

  res.json({
    message: `${request.full_name} has joined the group.`,
    username: created.user.username,
    membership_number: created.member.membership_number,
    // The password was sent to them by text and is never returned here.
    sms_sent: sms.ok,
  });
});

module.exports = { submitRequest, publicQuestions, listRequests, vote, decideRequest };
