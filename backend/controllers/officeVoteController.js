const { query, one, tx } = require('../config/db');
const { wrap } = require('../middleware/errorHandler');
const { sendSMS } = require('../utils/sms');
const { build, templates, day, GROUP } = require('../utils/messages');
const { audit } = require('../utils/audit');
const { getSetting, activeMembersWithPhone } = require('../utils/helpers');
const rules = require('../utils/officeVotes');

/**
 * Filling an office (chairperson, treasurer or secretary) by a vote of all the
 * members. The chairperson opens the election and carries out the result. If the
 * chairperson is the one who is gone, the treasurer or secretary may act instead.
 * The counting rules live in utils/officeVotes.js (and are tested there).
 */

// ---------------------------------------------------------------- text messages
Object.assign(templates, {
  officeElectionOpened: {
    en: (p) => `Hello ${p.name}, a vote is open to choose the next ${p.office}. Candidates: ${p.candidates}. Please log in and vote before ${day(p.closes)}. — ${GROUP}`,
    ny: (p) => `Moni ${p.name}, voti yatsegulidwa kuti tisankhe ${p.office} watsopano. Oimira: ${p.candidates}. Lowani mukavote pofika ${day(p.closes)}. — ${GROUP}`,
  },
  officeElectionPassed: {
    en: (p) => `${GROUP}: the members have chosen ${p.winner} as the new ${p.office}. The chairperson will confirm it in the app.`,
    ny: (p) => `${GROUP}: mamembala asankha ${p.winner} kukhala ${p.office} watsopano. Mtsogoleri adzatsimikiza mu pulogalamu.`,
  },
  officeAssigned: {
    en: (p) => `Hello ${p.name}, the group has chosen you as the new ${p.office}. Congratulations. — ${GROUP}`,
    ny: (p) => `Moni ${p.name}, gulu lakusankha kukhala ${p.office} watsopano. Zabwino zonse. — ${GROUP}`,
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
    console.error('[office sms]', err.message);
  }
}

/** Text every member in the background, so the chairperson is not kept waiting. */
function broadcast(members, key, makeParams, sentBy) {
  (async () => {
    for (const m of members) {
      await text(m, key, makeParams(m), sentBy, true);
      await new Promise((r) => setTimeout(r, 350));
    }
  })().catch((err) => console.error('[office sms]', err.message));
}

// ---------------------------------------------------------------- who may do what
const countActiveAdmins = async () =>
  (await one(`SELECT COUNT(*)::int AS c FROM users WHERE role = 'admin' AND is_active = TRUE`)).c;

/**
 * May this person open, withdraw or carry out an election for this office?
 * The chairperson always may. If the chairperson's seat is empty, the treasurer
 * or secretary may act for that seat only. The routes also check roles; this is
 * repeated so a route mistake can never hand the power to someone else.
 */
async function mayRun(req, res, office) {
  if (req.user.role === 'admin') return true;
  if (office === 'admin' && ['treasurer', 'secretary'].includes(req.user.role)) {
    if ((await countActiveAdmins()) === 0) return true;
  }
  res.status(403).json({
    message: office === 'admin'
      ? 'Only the chairperson can do this. (If the chairperson is gone, the treasurer or secretary may.)'
      : 'Only the chairperson can open an election.',
  });
  return false;
}

// ---------------------------------------------------------------- settings
const number = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

async function getRules() {
  const [days, quorum] = await Promise.all([
    getSetting('office_voting_days', '2'),
    getSetting('office_quorum_percent', '50'),
  ]);
  return { days: number(days, 2), quorum: number(quorum, 50) };
}

const countEligible = () => one(
  `SELECT COUNT(*)::int AS c FROM members m JOIN users u ON u.id = m.user_id
    WHERE m.status = 'active' AND u.is_active = TRUE`
);

// ---------------------------------------------------------------- closing finished votes
let lastSettled = 0;

/**
 * Close every election whose time is up, or in which everyone has voted.
 * There is no background timer: this runs whenever the page is opened or a
 * ballot is cast (at most every 10 seconds unless `force` is true).
 */
async function settleDueVotes(force = false) {
  if (!force && Date.now() - lastSettled < 10 * 1000) return;
  lastSettled = Date.now();

  const open = await query(
    `SELECT v.id, v.office, v.reason, v.opened_by, v.eligible_voters, v.closes_at, v.round,
            COUNT(b.id)::int AS voted
       FROM office_votes v
       LEFT JOIN office_vote_ballots b ON b.vote_id = v.id
      WHERE v.status = 'open'
      GROUP BY v.id`
  );

  const finished = open.filter((v) =>
    rules.isFinished({ eligible: v.eligible_voters, voted: v.voted, closesAt: v.closes_at }));
  if (!finished.length) return;

  const r = await getRules();
  for (const v of finished) {
    const counts = await query(
      `SELECT candidate_user_id, COUNT(*)::int AS n FROM office_vote_ballots
        WHERE vote_id = $1 GROUP BY candidate_user_id`,
      [v.id]
    );
    const ballotsByCandidate = Object.fromEntries(counts.map((c) => [c.candidate_user_id, c.n]));
    const result = rules.tally({
      eligible: v.eligible_voters, voted: v.voted, ballotsByCandidate, quorumPercent: r.quorum,
    });

    // A tie in the first round opens a run-off among just the tied candidates.
    if (result.status === 'tie' && v.round < 2) {
      const closed = await one(
        `UPDATE office_votes SET status = 'tie', winner_ballots = $2, decided_at = NOW()
          WHERE id = $1 AND status = 'open' RETURNING id`,
        [v.id, result.top]
      );
      if (!closed) continue;

      const closes = rules.closingTime(r.days);
      try {
        const runoff = await one(
          `INSERT INTO office_votes (office, reason, opened_by, closes_at, eligible_voters, round, run_off_from)
           VALUES ($1,$2,$3,$4,$5,2,$6) RETURNING id`,
          [v.office, v.reason, v.opened_by, closes, v.eligible_voters, v.id]
        );
        for (const cid of result.tied) {
          await query(
            `INSERT INTO office_vote_candidates (vote_id, candidate_user_id, nominated_by) VALUES ($1,$2,$3)`,
            [runoff.id, cid, v.opened_by]
          );
        }
        await audit(null, 'CLOSE_OFFICE_VOTE', 'office_votes', v.id, `${v.office}: tie, run-off opened. ${result.why}`);
      } catch (err) {
        if (err.code !== '23505') throw err;  // an election is already open for this office
      }
      continue;
    }

    const closed = await one(
      `UPDATE office_votes SET status = $2, winner_user_id = $3, winner_ballots = $4, decided_at = NOW()
        WHERE id = $1 AND status = 'open' RETURNING id`,
      [v.id, result.status, result.winnerUserId, result.top]
    );
    if (!closed) continue;   // someone else closed it a moment ago

    await audit(null, 'CLOSE_OFFICE_VOTE', 'office_votes', v.id, `${v.office}: ${result.status}. ${result.why}`);

    if (result.status === 'passed') {
      const opener = await one(`SELECT full_name, phone, language FROM users WHERE id = $1`, [v.opened_by]);
      const winner = await one(`SELECT full_name FROM users WHERE id = $1`, [result.winnerUserId]);
      await text(opener, 'officeElectionPassed', {
        office: rules.OFFICE_WORD[v.office], winner: winner ? winner.full_name : '',
      }, null);
    }
  }
}

// ---------------------------------------------------------------- reading
// GET /api/office-votes — every member may read every election
const list = wrap(async (req, res) => {
  await settleDueVotes();
  const me = req.user.member_id || null;

  const [votes, r, myMember, admins, holders, candidatePool] = await Promise.all([
    query(
      `SELECT v.id, v.office, v.reason, v.status, v.opened_at, v.closes_at, v.decided_at,
              v.eligible_voters, v.winner_user_id, v.winner_ballots, v.round, v.run_off_from, v.executed_at,
              ou.full_name AS opened_by_name, wu.full_name AS winner_name, eu.full_name AS executed_by_name,
              (SELECT COUNT(*)::int FROM office_vote_ballots b WHERE b.vote_id = v.id) AS votes_cast
         FROM office_votes v
         JOIN users ou ON ou.id = v.opened_by
         LEFT JOIN users wu ON wu.id = v.winner_user_id
         LEFT JOIN users eu ON eu.id = v.executed_by
        ORDER BY (v.status = 'open') DESC, v.opened_at DESC
        LIMIT 100`
    ),
    getRules(),
    me ? one(`SELECT status FROM members WHERE id = $1`, [me]) : null,
    countActiveAdmins(),
    query(`SELECT DISTINCT role FROM users WHERE role IN ('admin','treasurer','secretary') AND is_active = TRUE`),
    query(
      `SELECT u.id AS user_id, u.full_name, m.id AS member_id, m.membership_number,
              (m.avatar IS NOT NULL) AS has_avatar
         FROM users u JOIN members m ON m.user_id = u.id
        WHERE u.role = 'member' AND u.is_active = TRUE AND m.status = 'active'
        ORDER BY u.full_name`
    ),
  ]);

  const ids = votes.map((v) => v.id);
  const [cands, counts, myBallots] = await Promise.all([
    ids.length ? query(
      `SELECT c.vote_id, c.candidate_user_id, u.full_name, m.id AS member_id, m.membership_number,
              (m.avatar IS NOT NULL) AS has_avatar
         FROM office_vote_candidates c
         JOIN users u ON u.id = c.candidate_user_id
         JOIN members m ON m.user_id = u.id
        WHERE c.vote_id = ANY($1::int[]) ORDER BY u.full_name`, [ids]
    ) : [],
    ids.length ? query(
      `SELECT vote_id, candidate_user_id, COUNT(*)::int AS n FROM office_vote_ballots
        WHERE vote_id = ANY($1::int[]) GROUP BY vote_id, candidate_user_id`, [ids]
    ) : [],
    me && ids.length ? query(
      `SELECT vote_id, candidate_user_id FROM office_vote_ballots
        WHERE voter_member_id = $1 AND vote_id = ANY($2::int[])`, [me, ids]
    ) : [],
  ]);

  const candByVote = {};
  for (const c of cands) (candByVote[c.vote_id] ||= []).push(c);
  const tallyByVote = {};
  for (const t of counts) (tallyByVote[t.vote_id] ||= {})[t.candidate_user_id] = t.n;
  const myByVote = {};
  for (const b of myBallots) myByVote[b.vote_id] = b.candidate_user_id;

  const now = new Date();
  const hasActiveAdmin = admins > 0;
  const held = new Set(holders.map((o) => o.role));
  const canVoteBase = !!me && myMember && myMember.status === 'active' && req.user.is_active;
  const canOpen = req.user.role === 'admin' || (!hasActiveAdmin && ['treasurer', 'secretary'].includes(req.user.role));

  const rows = votes.map((v) => {
    const isOpen = v.status === 'open';
    const stillVoting = isOpen && new Date(v.closes_at) > now;
    const finished = ['passed', 'lapsed', 'tie', 'withdrawn'].includes(v.status);
    const canExecute = ['passed', 'tie'].includes(v.status) && !v.executed_at
      && (req.user.role === 'admin' || (v.office === 'admin' && !hasActiveAdmin && ['treasurer', 'secretary'].includes(req.user.role)));
    return {
      ...v,
      office_word: rules.OFFICE_WORD[v.office],
      candidates: candByVote[v.id] || [],
      // While voting is open only the turnout is shown, never who is ahead.
      counts: finished ? (tallyByVote[v.id] || {}) : null,
      my_ballot: myByVote[v.id] || null,
      quorum_needed: rules.quorumNeeded(v.eligible_voters, r.quorum),
      can_vote: stillVoting && canVoteBase && !myByVote[v.id],
      can_execute: canExecute,
      result: finished
        ? rules.tally({ eligible: v.eligible_voters, voted: v.votes_cast, ballotsByCandidate: tallyByVote[v.id] || {}, quorumPercent: r.quorum })
        : null,
    };
  });

  res.json({
    rules: { voting_days: r.days, quorum_percent: r.quorum },
    can_open: canOpen,
    vacant_offices: rules.OFFICES.filter((o) => !held.has(o)),
    candidate_pool: candidatePool,
    votes: rows,
  });
});

// GET /api/office-votes/status — what the dashboard needs
const status = wrap(async (req, res) => {
  await settleDueVotes();
  const me = req.user.member_id;
  const officeOpen = await one(
    `SELECT id, office, closes_at FROM office_votes WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1`
  );
  if (!me) return res.json({ votes_waiting: 0, office_open: officeOpen });
  const waiting = await one(
    `SELECT COUNT(*)::int AS c FROM office_votes v
      WHERE v.status = 'open' AND v.closes_at > NOW()
        AND NOT EXISTS (SELECT 1 FROM office_vote_ballots b WHERE b.vote_id = v.id AND b.voter_member_id = $1)`,
    [me]
  );
  res.json({ votes_waiting: waiting.c, office_open: officeOpen });
});

// ---------------------------------------------------------------- opening an election
// POST /api/office-votes   { office, reason, candidate_user_ids, notify_members }
const open = wrap(async (req, res) => {
  const { office, reason, candidate_user_ids, notify_members = true } = req.body;
  const why = String(reason || '').trim();

  if (!rules.OFFICES.includes(office)) return res.status(400).json({ message: 'Choose the chairperson, treasurer or secretary.' });
  if (why.length < 10) return res.status(400).json({ message: 'Write the reason in a few words (at least 10 characters). Every member will read it.' });
  if (why.length > 1000) return res.status(400).json({ message: 'Keep the reason under 1000 characters.' });
  if (!(await mayRun(req, res, office))) return;

  const wanted = Array.isArray(candidate_user_ids)
    ? [...new Set(candidate_user_ids.map(Number).filter(Boolean))] : [];

  const [holder, existingOpen, r, eligible, candRows] = await Promise.all([
    one(`SELECT id, full_name FROM users WHERE role = $1 AND is_active = TRUE LIMIT 1`, [office]),
    one(`SELECT id FROM office_votes WHERE office = $1 AND status = 'open'`, [office]),
    getRules(),
    countEligible(),
    wanted.length ? query(
      `SELECT u.id, u.full_name, u.role, u.is_active, m.status AS member_status
         FROM users u JOIN members m ON m.user_id = u.id WHERE u.id = ANY($1::int[])`, [wanted]
    ) : [],
  ]);

  if (candRows.length !== wanted.length) {
    return res.status(400).json({ message: 'Someone on the list is not a member of the group.' });
  }
  const bad = candRows.find((u) => u.role !== 'member' || !u.is_active || u.member_status !== 'active');
  if (bad) {
    return res.status(400).json({ message: `${bad.full_name} cannot stand: only an active member who holds no office may be a candidate.` });
  }

  const verdict = rules.canOpen({
    office, hasActiveHolder: !!holder, hasOpenVote: !!existingOpen, candidateCount: candRows.length,
  });
  if (!verdict.ok) return res.status(400).json({ message: verdict.message });
  if (eligible.c < 1) return res.status(400).json({ message: 'There are no active members who could vote.' });

  const closes = rules.closingTime(r.days);
  let created;
  try {
    created = await one(
      `INSERT INTO office_votes (office, reason, opened_by, closes_at, eligible_voters)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [office, why, req.user.id, closes, eligible.c]
    );
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ message: `An election for ${rules.OFFICE_WORD[office]} is already open.` });
    throw err;
  }
  for (const c of candRows) {
    await query(
      `INSERT INTO office_vote_candidates (vote_id, candidate_user_id, nominated_by) VALUES ($1,$2,$3)`,
      [created.id, c.id, req.user.id]
    );
  }

  await audit(req.user.id, 'OPEN_OFFICE_VOTE', 'office_votes', created.id, `${office}: ${candRows.map((c) => c.full_name).join(', ')}`);

  if (notify_members) {
    const everyone = await activeMembersWithPhone();
    const names = candRows.map((c) => c.full_name).join(', ');
    broadcast(everyone, 'officeElectionOpened',
      (m) => ({ office: rules.OFFICE_WORD[office], candidates: names, closes, name: m.full_name }), req.user.id);
  }

  res.status(201).json({
    message: `The election for ${rules.OFFICE_WORD[office]} is open until ${day(closes)}. ${eligible.c} members can vote.`,
    vote_id: created.id,
  });
});

// ---------------------------------------------------------------- voting
// POST /api/office-votes/:id/ballot   { candidate_user_id }
const castBallot = wrap(async (req, res) => {
  const id = Number(req.params.id);
  const candidate = Number(req.body.candidate_user_id);
  const me = req.user.member_id;

  if (!candidate) return res.status(400).json({ message: 'Choose which candidate you are voting for.' });
  if (!me) return res.status(403).json({ message: 'Only members can vote.' });

  await settleDueVotes(true);

  const v = await one(`SELECT id, status, closes_at FROM office_votes WHERE id = $1`, [id]);
  if (!v) return res.status(404).json({ message: 'That election does not exist.' });
  if (v.status !== 'open' || new Date(v.closes_at) <= new Date()) {
    return res.status(400).json({ message: 'Voting on this has closed.' });
  }

  const standing = await one(
    `SELECT 1 FROM office_vote_candidates WHERE vote_id = $1 AND candidate_user_id = $2`, [id, candidate]
  );
  if (!standing) return res.status(400).json({ message: 'That person is not standing in this election.' });

  const mine = await one(`SELECT status FROM members WHERE id = $1`, [me]);
  const verdict = rules.canVote({ memberStatus: mine && mine.status, userActive: req.user.is_active });
  if (!verdict.ok) return res.status(403).json({ message: verdict.message });

  try {
    await query(
      `INSERT INTO office_vote_ballots (vote_id, voter_member_id, candidate_user_id) VALUES ($1,$2,$3)`,
      [id, me, candidate]
    );
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ message: 'You have already voted in this election.' });
    throw err;
  }

  // The log records that a ballot was cast, never which way.
  await audit(req.user.id, 'CAST_OFFICE_BALLOT', 'office_votes', id, null);
  await settleDueVotes(true);   // closes it straight away if that was the last vote

  res.json({ message: 'Your vote has been counted. Thank you.' });
});

// PATCH /api/office-votes/:id/withdraw — the chairperson calls off the election
const withdraw = wrap(async (req, res) => {
  const id = Number(req.params.id);
  const v = await one(`SELECT office FROM office_votes WHERE id = $1`, [id]);
  if (!v) return res.status(404).json({ message: 'That election does not exist.' });
  if (!(await mayRun(req, res, v.office))) return;

  const row = await one(
    `UPDATE office_votes SET status = 'withdrawn', decided_at = NOW()
      WHERE id = $1 AND status = 'open' RETURNING id`, [id]
  );
  if (!row) return res.status(400).json({ message: 'Only an election that is still open can be withdrawn.' });
  await audit(req.user.id, 'WITHDRAW_OFFICE_VOTE', 'office_votes', id, null);
  res.json({ message: 'The election has been withdrawn.' });
});

// ---------------------------------------------------------------- carrying out the result
// POST /api/office-votes/:id/execute   { chosen_user_id }  (only needed after a run-off tie)
const execute = wrap(async (req, res) => {
  const id = Number(req.params.id);
  await settleDueVotes(true);

  const v = await one(`SELECT * FROM office_votes WHERE id = $1`, [id]);
  if (!v) return res.status(404).json({ message: 'That election does not exist.' });
  if (!(await mayRun(req, res, v.office))) return;
  if (!['passed', 'tie'].includes(v.status)) {
    return res.status(400).json({ message: 'Only an election the members have finished can be carried out.' });
  }
  if (v.executed_at) return res.status(400).json({ message: 'This election has already been carried out.' });

  let winnerUserId = v.winner_user_id;
  if (v.status === 'tie') {
    const chosen = Number(req.body.chosen_user_id);
    if (!chosen) return res.status(400).json({ message: 'The members tied. Choose which candidate takes the office.' });
    const standing = await one(
      `SELECT 1 FROM office_vote_candidates WHERE vote_id = $1 AND candidate_user_id = $2`, [id, chosen]
    );
    if (!standing) return res.status(400).json({ message: 'That person is not standing in this election.' });
    winnerUserId = chosen;
  }
  if (!winnerUserId) return res.status(400).json({ message: 'There is no winner to carry out.' });

  const winner = await one(
    `SELECT u.id, u.full_name, u.phone, u.language, u.role, u.is_active, m.status AS member_status
       FROM users u JOIN members m ON m.user_id = u.id WHERE u.id = $1`, [winnerUserId]
  );
  if (!winner) return res.status(404).json({ message: 'That candidate is no longer in the group.' });
  if (winner.role !== 'member' || !winner.is_active || winner.member_status !== 'active') {
    return res.status(400).json({ message: `${winner.full_name} can no longer take the office.` });
  }

  const applied = await tx(async (client) => {
    const guard = await client.query(
      `UPDATE office_votes SET executed_by = $2, executed_at = NOW(), winner_user_id = $3
        WHERE id = $1 AND status IN ('passed','tie') AND executed_at IS NULL RETURNING id`,
      [id, req.user.id, winnerUserId]
    );
    if (!guard.rows.length) return false;

    // The old holder of the office is no longer an official. (They are already
    // suspended or dismissed; this only takes away the office label.)
    await client.query(`UPDATE users SET role = 'member' WHERE role = $1 AND is_active = FALSE`, [v.office]);
    // The winner takes the office.
    await client.query(`UPDATE users SET role = $1, is_active = TRUE WHERE id = $2`, [v.office, winnerUserId]);
    return true;
  });

  if (!applied) return res.status(400).json({ message: 'This election has already been carried out.' });

  await audit(req.user.id, 'EXECUTE_OFFICE_VOTE', 'office_votes', id, `${v.office} ${winner.full_name}`);
  await text(winner, 'officeAssigned', {
    office: rules.OFFICE_WORD[v.office], name: winner.full_name,
  }, req.user.id);

  res.json({ message: `${winner.full_name} is now the ${rules.OFFICE_WORD[v.office]}.` });
});

module.exports = { list, status, open, castBallot, withdraw, execute, settleDueVotes };
