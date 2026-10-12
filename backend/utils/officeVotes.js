/**
 * Rules for filling an office (chairperson, treasurer, secretary) by a vote
 * of all the members. No database here: the controller asks these questions
 * and acts on the answers. Tested in test/officeVotes.test.js.
 */

const OFFICES = ['admin', 'treasurer', 'secretary'];
const OFFICE_WORD = { admin: 'chairperson', treasurer: 'treasurer', secretary: 'secretary' };

/**
 * May an election for this office be opened right now?
 * Returns { ok: true } or { ok: false, message }.
 */
function canOpen({ office, hasActiveHolder, hasOpenVote, candidateCount }) {
  if (!OFFICES.includes(office)) {
    return { ok: false, message: 'Choose the chairperson, treasurer or secretary.' };
  }
  if (hasActiveHolder) {
    return { ok: false, message: `There is still an active ${OFFICE_WORD[office]}. The office has to be empty first.` };
  }
  if (hasOpenVote) {
    return { ok: false, message: `An election for ${OFFICE_WORD[office]} is already open.` };
  }
  if (!candidateCount || candidateCount < 2) {
    return { ok: false, message: 'Choose at least two candidates to stand.' };
  }
  return { ok: true };
}

/** May this member cast a ballot? */
function canVote({ memberStatus, userActive = true }) {
  if (!userActive || memberStatus !== 'active') {
    return { ok: false, message: 'Only active members can vote.' };
  }
  return { ok: true };
}

/** How many ballots must be cast for the result to count. Always at least one. */
function quorumNeeded(eligible, quorumPercent) {
  if (eligible <= 0) return 0;
  return Math.max(1, Math.ceil((eligible * quorumPercent) / 100));
}

/**
 * Count the ballots.
 *   'lapsed'  not enough members voted, so nothing was decided
 *   'passed'  enough voted and one candidate is clearly ahead
 *   'tie'     enough voted but the leaders are level (a run-off is needed)
 * `ballotsByCandidate` is a plain map of candidate user id -> number of ballots.
 */
function tally({ eligible, voted, ballotsByCandidate = {}, quorumPercent = 50 }) {
  const needed = quorumNeeded(eligible, quorumPercent);
  const turnout = voted;
  const base = { turnout, quorumNeeded: needed, top: 0, tied: [] };

  if (eligible <= 0) {
    return { ...base, status: 'lapsed', winnerUserId: null, why: 'There were no members able to vote.' };
  }
  if (turnout < needed) {
    return { ...base, status: 'lapsed', winnerUserId: null, why: `Only ${turnout} of the ${needed} votes needed were cast.` };
  }

  const entries = Object.entries(ballotsByCandidate).map(([id, n]) => ({ id: Number(id), n: Number(n) || 0 }));
  const top = entries.reduce((m, e) => Math.max(m, e.n), 0);
  if (top <= 0) {
    return { ...base, status: 'lapsed', winnerUserId: null, why: 'No votes were cast for any candidate.' };
  }
  const leaders = entries.filter((e) => e.n === top).map((e) => e.id);
  if (leaders.length === 1) {
    return { ...base, top, status: 'passed', winnerUserId: leaders[0], why: `The winner had ${top} of the ${turnout} votes.` };
  }
  return { ...base, top, tied: leaders, status: 'tie', winnerUserId: null, why: `${leaders.length} candidates tied with ${top} votes each.` };
}

/** Is the election over: the deadline has passed, or everyone who can vote has voted? */
function isFinished({ eligible, voted, closesAt, now = new Date() }) {
  if (new Date(closesAt) <= now) return true;
  return eligible <= 0 || voted >= eligible;
}

/** When the election closes. */
function closingTime(votingDays = 2, now = new Date()) {
  return new Date(now.getTime() + votingDays * 86400000);
}

module.exports = { OFFICES, OFFICE_WORD, canOpen, canVote, quorumNeeded, tally, isFinished, closingTime };
