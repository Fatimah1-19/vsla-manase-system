const { query, one, tx } = require('../config/db');
const { wrap } = require('../middleware/errorHandler');
const { sendSMS } = require('../utils/sms');
const { build, templates, money, day, GROUP } = require('../utils/messages');
const { audit } = require('../utils/audit');
const { getSetting, getActiveCycle, activeMembersWithPhone } = require('../utils/helpers');
const rules = require('../utils/cases');
const { computeShareOut } = require('./shareOutController');

/**
 * Suspending, dismissing or bringing back a member.
 * The chairperson opens a case, the members vote, and the chairperson carries
 * out the result. The counting rules live in utils/cases.js (and are tested there).
 */

// ---------------------------------------------------------------- text messages
const VERB = {
  suspend: { en: 'suspend', ny: 'kuyimitsa' },
  dismiss: { en: 'dismiss', ny: 'kuchotsa m\'gulu' },
  reinstate: { en: 'bring back', ny: 'kubwezera m\'gulu' },
};

// Added to the shared message list, so build() can find them like every other text.
Object.assign(templates, {
  caseOpened: {
    en: (p) => `Hello ${p.name}, the group is voting on a proposal to ${VERB[p.action].en} ${p.subject}. Please log in and vote before ${day(p.closes)}. — ${GROUP}`,
    ny: (p) => `Moni ${p.name}, gulu likuvota pa pempho la ${VERB[p.action].ny} ${p.subject}. Lowani mukavote pofika ${day(p.closes)}. — ${GROUP}`,
  },
  caseOpenedSubject: {
    en: (p) => `Hello ${p.name}, a vote has been opened about your membership (${VERB[p.action].en}). You can read the reason and write your reply in the app. — ${GROUP}`,
    ny: (p) => `Moni ${p.name}, kuvota kwatsegulidwa pa umembala wanu (${VERB[p.action].ny}). Mutha kuwerenga chifukwa ndi kulemba yankho lanu mu pulogalamu. — ${GROUP}`,
  },
  casePassed: {
    en: (p) => `${GROUP}: the vote to ${VERB[p.action].en} ${p.subject} has passed (${p.yes} yes, ${p.no} no). You can now carry it out in the app.`,
    ny: (p) => `${GROUP}: kuvota kwa ${VERB[p.action].ny} ${p.subject} kwapambana (${p.yes} inde, ${p.no} ayi). Tsopano mutha kukwaniritsa mu pulogalamu.`,
  },
  caseExecuted: {
    en: (p) => ({
      suspend: `Hello ${p.name}, the group has decided to suspend your membership. You cannot borrow or vote until you are brought back. Your savings are safe. Please speak to the chairperson. — ${GROUP}`,
      dismiss: `Hello ${p.name}, the group has decided to end your membership. The treasurer will arrange what you are owed${p.owed > 0 ? ` (${money(p.owed)})` : ''}. — ${GROUP}`,
      reinstate: `Hello ${p.name}, you are a member again. You can log in. — ${GROUP}`,
    })[p.action],
    ny: (p) => ({
      suspend: `Moni ${p.name}, gulu lagamula kuyimitsa umembala wanu. Simungakongole kapena kuvota mpaka mubwezeredwe. Zosunga zanu zili bwino. Chonde lankhulani ndi mtsogoleri. — ${GROUP}`,
      dismiss: `Moni ${p.name}, gulu lagamula kuthetsa umembala wanu. Wosunga ndalama adzakonza zomwe mukuyenera kulandira${p.owed > 0 ? ` (${money(p.owed)})` : ''}. — ${GROUP}`,
      reinstate: `Moni ${p.name}, ndinu membala kachiwiri. Mutha kulowa. — ${GROUP}`,
    })[p.action],
  },
});

/** Send one text without ever breaking the action that triggered it. */
async function text(user, key, params, sentBy, isBroadcast = false) {
  if (!user || !user.phone) return;
  try {
    await sendSMS(user.phone, build(key, user.language, params), {
      name: user.full_name, category: 'vote', isBroadcast, sentBy,
    });
  } catch (err) {
    console.error('[vote sms]', err.message);
  }
}

/** Text every member in the background, so the chairperson is not kept waiting. */
function broadcast(members, key, makeParams, sentBy) {
  (async () => {
    for (const m of members) {
      await text(m, key, makeParams(m), sentBy, true);
      await new Promise((r) => setTimeout(r, 350));
    }
  })().catch((err) => console.error('[vote sms]', err.message));
}

// ---------------------------------------------------------------- who may do what
// The routes already check roles. These checks repeat it inside, so a mistake in a
// route can never hand the chairperson's powers to someone else.
const chairOnly = (req, res) => {
  if (req.user.role === 'admin') return false;
  res.status(403).json({ message: 'Only the chairperson can do this.' });
  return true;
};

// ---------------------------------------------------------------- settings
const number = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

async function getRules() {
  const [days, quorum, dismiss] = await Promise.all([
    getSetting('case_voting_days', '1'),
    getSetting('case_quorum_percent', '50'),
    getSetting('case_dismiss_percent', '67'),
  ]);
  return { days: number(days, 1), quorum: number(quorum, 50), dismiss: number(dismiss, 67) };
}

// ---------------------------------------------------------------- closing finished votes
let lastSettled = 0;

/**
 * Close every vote whose time is up, or in which everyone has voted.
 * There is no background timer: this runs whenever the Votes page is opened or
 * a vote is cast (at most every 10 seconds unless `force` is true).
 */
async function settleDueCases(force = false) {
  if (!force && Date.now() - lastSettled < 10 * 1000) return;
  lastSettled = Date.now();

  const open = await query(
    `SELECT c.id, c.action, c.opened_by, c.eligible_voters, c.closes_at, su.full_name AS subject_name,
            COUNT(v.id)::int AS voted,
            COUNT(v.id) FILTER (WHERE v.vote = 'yes')::int AS yes,
            COUNT(v.id) FILTER (WHERE v.vote = 'no')::int AS no
       FROM member_cases c
       JOIN members sm ON sm.id = c.member_id
       JOIN users su ON su.id = sm.user_id
       LEFT JOIN member_case_votes v ON v.case_id = c.id
      WHERE c.status = 'open'
      GROUP BY c.id, su.full_name`
  );

  const finished = open.filter((c) =>
    rules.isFinished({ eligible: c.eligible_voters, voted: c.voted, closesAt: c.closes_at }));
  if (!finished.length) return;

  const r = await getRules();
  for (const c of finished) {
    const result = rules.tally({
      action: c.action, eligible: c.eligible_voters, yes: c.yes, no: c.no,
      quorumPercent: r.quorum, dismissPercent: r.dismiss,
    });
    const closed = await one(
      `UPDATE member_cases SET status = $2, yes_votes = $3, no_votes = $4, decided_at = NOW()
        WHERE id = $1 AND status = 'open' RETURNING id`,
      [c.id, result.outcome, c.yes, c.no]
    );
    if (!closed) continue;   // someone else closed it a moment ago

    await audit(null, 'CLOSE_MEMBER_VOTE', 'member_cases', c.id, `${c.action} ${c.subject_name}: ${result.outcome}. ${result.why}`);

    if (result.outcome === 'passed') {
      const opener = await one(`SELECT full_name, phone, language FROM users WHERE id = $1`, [c.opened_by]);
      await text(opener, 'casePassed', { action: c.action, subject: c.subject_name, yes: c.yes, no: c.no }, null);
    }
  }
}

// ---------------------------------------------------------------- reading
const countEligible = (exceptMemberId) => one(
  `SELECT COUNT(*)::int AS c FROM members m JOIN users u ON u.id = m.user_id
    WHERE m.status = 'active' AND u.is_active = TRUE AND m.id <> $1`,
  [exceptMemberId]
);

// GET /api/member-cases — every member may read every case
const list = wrap(async (req, res) => {
  await settleDueCases();
  const me = req.user.member_id || null;

  const [rows, myMember, r] = await Promise.all([
    query(
      `SELECT c.id, c.member_id, c.action, c.reason, c.member_response, c.status,
              c.opened_at, c.closes_at, c.decided_at, c.eligible_voters, c.yes_votes, c.no_votes, c.executed_at,
              c.settlement_amount::float AS settlement_amount,
              c.settlement_unrecovered::float AS settlement_unrecovered, c.settlement_paid_on,
              su.full_name AS subject_name, sm.membership_number, sm.status AS subject_status,
              ou.full_name AS opened_by_name,
              (SELECT COUNT(*)::int FROM member_case_votes v WHERE v.case_id = c.id) AS votes_cast,
              EXISTS (SELECT 1 FROM member_case_votes v WHERE v.case_id = c.id AND v.member_id = $1) AS voted
         FROM member_cases c
         JOIN members sm ON sm.id = c.member_id
         JOIN users su ON su.id = sm.user_id
         JOIN users ou ON ou.id = c.opened_by
        ORDER BY (c.status = 'open') DESC, c.opened_at DESC
        LIMIT 100`,
      [me]
    ),
    me ? one(`SELECT status FROM members WHERE id = $1`, [me]) : null,
    getRules(),
  ]);

  const now = new Date();
  const cases = rows.map((c) => {
    const isOpen = c.status === 'open';
    const stillVoting = isOpen && new Date(c.closes_at) > now;
    const canVote = stillVoting && !c.voted && !!me && rules.canVote({
      memberStatus: myMember && myMember.status, userActive: req.user.is_active,
      memberId: me, subjectMemberId: c.member_id,
    }).ok;
    const finished = ['passed', 'rejected', 'lapsed'].includes(c.status);
    return {
      ...c,
      // While voting is open only the turnout is shown, never the yes and no totals.
      yes_votes: finished ? c.yes_votes : null,
      no_votes: finished ? c.no_votes : null,
      quorum_needed: rules.quorumNeeded(c.eligible_voters, r.quorum),
      is_about_me: c.member_id === me,
      can_vote: canVote,
      result: finished
        ? rules.tally({ action: c.action, eligible: c.eligible_voters, yes: c.yes_votes, no: c.no_votes,
                        quorumPercent: r.quorum, dismissPercent: r.dismiss })
        : null,
    };
  });

  res.json({
    rules: { voting_days: r.days, quorum_percent: r.quorum, dismiss_percent: r.dismiss },
    cases,
  });
});

// GET /api/member-cases/status — what the dashboard needs: my status, votes waiting for me
const status = wrap(async (req, res) => {
  const me = req.user.member_id;
  if (!me) return res.json({ member_status: null, votes_waiting: 0, about_me: null });
  await settleDueCases();

  const [member, waiting, about] = await Promise.all([
    one(`SELECT status FROM members WHERE id = $1`, [me]),
    one(
      `SELECT COUNT(*)::int AS c FROM member_cases c
        WHERE c.status = 'open' AND c.closes_at > NOW() AND c.member_id <> $1
          AND NOT EXISTS (SELECT 1 FROM member_case_votes v WHERE v.case_id = c.id AND v.member_id = $1)`,
      [me]
    ),
    one(`SELECT id, action, closes_at FROM member_cases WHERE member_id = $1 AND status = 'open' LIMIT 1`, [me]),
  ]);

  const canVote = !!member && member.status === 'active';
  res.json({
    member_status: member ? member.status : null,
    votes_waiting: canVote ? waiting.c : 0,
    about_me: about,
  });
});

// ---------------------------------------------------------------- opening a case
// POST /api/member-cases   { member_id, action, reason, notify_members }
const open = wrap(async (req, res) => {
  if (chairOnly(req, res)) return;
  const { member_id, action, reason, notify_members = true } = req.body;
  const why = String(reason || '').trim();

  if (!member_id) return res.status(400).json({ message: 'Choose the member this is about.' });
  if (why.length < 10) return res.status(400).json({ message: 'Write the reason in a few words (at least 10 characters). Every member will read it.' });
  if (why.length > 1000) return res.status(400).json({ message: 'Keep the reason under 1000 characters.' });

  const subject = await one(
    `SELECT m.id, m.status, u.id AS user_id, u.full_name, u.phone, u.language, u.role
       FROM members m JOIN users u ON u.id = m.user_id WHERE m.id = $1`,
    [member_id]
  );
  if (!subject) return res.status(404).json({ message: 'That member does not exist.' });

  const [openCase, lastRejected, r, eligible] = await Promise.all([
    one(`SELECT id FROM member_cases WHERE member_id = $1 AND status = 'open'`, [member_id]),
    one(
      `SELECT MAX(decided_at) AS rejected_at FROM member_cases
        WHERE member_id = $1 AND action = $2 AND status = 'rejected'`,
      [member_id, action]
    ),
    getRules(),
    countEligible(member_id),
  ]);

  const verdict = rules.canOpen({
    action, memberStatus: subject.status, role: subject.role, hasOpenCase: !!openCase,
    lastRejectedAt: lastRejected && lastRejected.rejected_at,
  });
  if (!verdict.ok) return res.status(400).json({ message: verdict.message });
  if (eligible.c < 1) return res.status(400).json({ message: 'There are no other active members who could vote.' });

  const closes = rules.closingTime(r.days);
  let created;
  try {
    created = await one(
      `INSERT INTO member_cases (member_id, action, reason, opened_by, closes_at, eligible_voters)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [member_id, action, why, req.user.id, closes, eligible.c]
    );
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ message: 'There is already a vote open about this member.' });
    throw err;
  }

  await audit(req.user.id, 'OPEN_MEMBER_VOTE', 'member_cases', created.id, `${action} ${subject.full_name}`);

  // The member concerned is told in private; everyone else only if asked.
  await text(subject, 'caseOpenedSubject', { action, name: subject.full_name }, req.user.id);
  if (notify_members) {
    const everyone = (await activeMembersWithPhone()).filter((m) => m.member_id !== subject.id);
    broadcast(everyone, 'caseOpened', (m) => ({ action, subject: subject.full_name, closes, name: m.full_name }), req.user.id);
  }

  res.status(201).json({
    message: `The vote is open until ${day(closes)}. ${eligible.c} members can vote.`,
    case_id: created.id,
  });
});

// ---------------------------------------------------------------- voting
// POST /api/member-cases/:id/vote   { vote: 'yes' | 'no' }
const castVote = wrap(async (req, res) => {
  const id = Number(req.params.id);
  const choice = req.body.vote;
  const me = req.user.member_id;

  if (!['yes', 'no'].includes(choice)) return res.status(400).json({ message: 'Vote yes or no.' });
  if (!me) return res.status(403).json({ message: 'Only members can vote.' });

  await settleDueCases(true);   // close anything that has run out of time first

  const c = await one(`SELECT id, member_id, status, closes_at FROM member_cases WHERE id = $1`, [id]);
  if (!c) return res.status(404).json({ message: 'That vote does not exist.' });
  if (c.status !== 'open' || new Date(c.closes_at) <= new Date()) {
    return res.status(400).json({ message: 'Voting on this has closed.' });
  }

  const mine = await one(`SELECT status FROM members WHERE id = $1`, [me]);
  const verdict = rules.canVote({
    memberStatus: mine && mine.status, userActive: req.user.is_active, memberId: me, subjectMemberId: c.member_id,
  });
  if (!verdict.ok) return res.status(403).json({ message: verdict.message });

  try {
    await query(`INSERT INTO member_case_votes (case_id, member_id, vote) VALUES ($1,$2,$3)`, [id, me, choice]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ message: 'You have already voted on this.' });
    throw err;
  }

  // The log records that a vote was cast, never which way.
  await audit(req.user.id, 'CAST_MEMBER_VOTE', 'member_cases', id, null);
  await settleDueCases(true);   // closes it straight away if that was the last vote

  res.json({ message: 'Your vote has been counted. Thank you.' });
});

// PATCH /api/member-cases/:id/response   { text } — the member's own side
const respond = wrap(async (req, res) => {
  const id = Number(req.params.id);
  const reply = String(req.body.text || '').trim();
  if (!reply) return res.status(400).json({ message: 'Write your reply first.' });
  if (reply.length > 1000) return res.status(400).json({ message: 'Keep the reply under 1000 characters.' });

  const c = await one(`SELECT member_id, status FROM member_cases WHERE id = $1`, [id]);
  if (!c) return res.status(404).json({ message: 'That vote does not exist.' });
  if (!req.user.member_id || c.member_id !== req.user.member_id) {
    return res.status(403).json({ message: 'Only the member this is about can write a reply.' });
  }
  if (c.status !== 'open') return res.status(400).json({ message: 'Voting on this has finished.' });

  await query(`UPDATE member_cases SET member_response = $2 WHERE id = $1`, [id, reply]);
  await audit(req.user.id, 'REPLY_MEMBER_VOTE', 'member_cases', id, null);
  res.json({ message: 'Your reply has been saved. Voters can read it.' });
});

// PATCH /api/member-cases/:id/withdraw — the chairperson takes a proposal back
const withdraw = wrap(async (req, res) => {
  if (chairOnly(req, res)) return;
  const id = Number(req.params.id);
  const done = await one(
    `UPDATE member_cases SET status = 'withdrawn', decided_at = NOW()
      WHERE id = $1 AND status = 'open' RETURNING id`,
    [id]
  );
  if (!done) return res.status(400).json({ message: 'Only a vote that is still open can be withdrawn.' });
  await audit(req.user.id, 'WITHDRAW_MEMBER_VOTE', 'member_cases', id, null);
  res.json({ message: 'The proposal has been withdrawn.' });
});

// ---------------------------------------------------------------- carrying out the result
// POST /api/member-cases/:id/execute — only after the members have voted yes
const execute = wrap(async (req, res) => {
  if (chairOnly(req, res)) return;
  const id = Number(req.params.id);
  await settleDueCases(true);

  const c = await one(
    `SELECT c.*, sm.status AS member_status, u.id AS user_id, u.full_name, u.phone, u.language
       FROM member_cases c
       JOIN members sm ON sm.id = c.member_id
       JOIN users u ON u.id = sm.user_id
      WHERE c.id = $1`,
    [id]
  );
  if (!c) return res.status(404).json({ message: 'That vote does not exist.' });
  if (c.status !== 'passed') return res.status(400).json({ message: 'Only a vote that the members have passed can be carried out.' });
  if (c.executed_at) return res.status(400).json({ message: 'This decision has already been carried out.' });
  if (!rules.ALLOWED_FROM[c.action].includes(c.member_status)) {
    return res.status(400).json({ message: `This member is now ${c.member_status}, so the decision no longer applies.` });
  }

  // For a dismissal: what the member is owed back (or still owes).
  let settlement = null;
  if (c.action === 'dismiss') {
    const cycle = await getActiveCycle();
    const sharing = cycle ? await computeShareOut(cycle.id) : { shares: [] };
    const mine = sharing.shares.find((s) => s.member_id === c.member_id);
    settlement = { amount: mine ? mine.share_amount : 0, unrecovered: mine ? mine.unrecovered : 0 };
  }

  const applied = await tx(async (client) => {
    // The guard makes sure two people pressing the button cannot carry it out twice.
    const guard = await client.query(
      `UPDATE member_cases SET executed_by = $2, executed_at = NOW(),
              settlement_amount = $3, settlement_unrecovered = $4
        WHERE id = $1 AND status = 'passed' AND executed_at IS NULL RETURNING id`,
      [id, req.user.id, settlement ? settlement.amount : null, settlement ? settlement.unrecovered : null]
    );
    if (!guard.rows.length) return false;

    if (c.action === 'reinstate') {
      await client.query(`UPDATE members SET status = 'active' WHERE id = $1`, [c.member_id]);
      await client.query(`UPDATE users SET is_active = TRUE WHERE id = $1`, [c.user_id]);
    } else {
      await client.query(`UPDATE members SET status = $2 WHERE id = $1`, [c.member_id, c.action === 'suspend' ? 'suspended' : 'dismissed']);
      if (c.action === 'dismiss') await client.query(`UPDATE users SET is_active = FALSE WHERE id = $1`, [c.user_id]);
      // A loan request that was still waiting cannot go ahead.
      await client.query(
        `UPDATE loans SET status = 'rejected', decision_note = 'Membership changed by a vote of the group', decided_at = NOW()
          WHERE member_id = $1 AND status = 'pending'`,
        [c.member_id]
      );
    }
    return true;
  });

  if (!applied) return res.status(400).json({ message: 'This decision has already been carried out.' });

  await audit(req.user.id, 'EXECUTE_MEMBER_VOTE', 'member_cases', id, `${c.action} ${c.full_name}`);
  await text(c, 'caseExecuted', { action: c.action, name: c.full_name, owed: settlement ? settlement.amount : 0 }, req.user.id);

  const word = { suspend: 'suspended', dismiss: 'dismissed', reinstate: 'brought back' }[c.action];
  res.json({
    message: `${c.full_name} has been ${word}.`,
    settlement,
  });
});

// POST /api/member-cases/:id/settlement-paid — the treasurer or secretary records the payment
const settlementPaid = wrap(async (req, res) => {
  if (!['treasurer', 'secretary'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Only the treasurer or the secretary can record a payment.' });
  }
  const id = Number(req.params.id);
  const row = await one(
    `UPDATE member_cases SET settlement_paid_on = CURRENT_DATE, settlement_paid_by = $2
      WHERE id = $1 AND action = 'dismiss' AND status = 'passed' AND executed_at IS NOT NULL
        AND settlement_amount IS NOT NULL AND settlement_paid_on IS NULL
      RETURNING id, settlement_amount::float AS amount`,
    [id, req.user.id]
  );
  if (!row) return res.status(400).json({ message: 'There is no unpaid settlement for this case.' });
  await audit(req.user.id, 'PAY_MEMBER_SETTLEMENT', 'member_cases', id, `${row.amount}`);
  res.json({ message: `Recorded: ${money(row.amount)} paid back to the member.` });
});

module.exports = { list, status, open, castVote, respond, withdraw, execute, settlementPaid, settleDueCases };