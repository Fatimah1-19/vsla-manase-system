/**
 * The rules for a member case: a proposal to suspend, dismiss or bring back a
 * member, decided by a vote of the members.
 *
 * Nothing here touches the database, so every rule can be tested on its own
 * (see test/cases.test.js). The controller asks these functions and acts on the answer.
 */

const ACTIONS = ['suspend', 'dismiss', 'reinstate'];

// The status a member must have for each kind of case.
const ALLOWED_FROM = {
  suspend: ['active'],
  dismiss: ['active', 'suspended'],
  reinstate: ['suspended', 'dismissed', 'inactive'],
};

const ACTION_WORD = { suspend: 'suspended', dismiss: 'dismissed', reinstate: 'reinstated' };

/**
 * May a case of this kind be opened about this member right now?
 * Returns { ok: true } or { ok: false, message }.
 */
function canOpen({ action, memberStatus, role, hasOpenCase, lastRejectedAt, now = new Date(), cooldownDays = 30 }) {
  if (!ACTIONS.includes(action)) {
    return { ok: false, message: 'Choose suspend, dismiss or reinstate.' };
  }
  if (role && role !== 'member') {
    return {
      ok: false,
      message: `This person holds an office (${role}). Their office has to be dealt with first; this vote is for ordinary members.`,
    };
  }
  if (!ALLOWED_FROM[action].includes(memberStatus)) {
    return { ok: false, message: `A member who is ${memberStatus} cannot be ${ACTION_WORD[action]}.` };
  }
  if (hasOpenCase) {
    return { ok: false, message: 'There is already a vote open about this member. Wait for it to finish.' };
  }
  // A vote the members turned down cannot be brought straight back, or it could be
  // repeated until it finally passes. (A vote that simply did not get enough voters can.)
  if (lastRejectedAt) {
    const reopenOn = new Date(new Date(lastRejectedAt).getTime() + cooldownDays * 86400000);
    if (now < reopenOn) {
      return {
        ok: false,
        message: `The members turned down this proposal recently. It can be opened again after ${reopenOn.toISOString().slice(0, 10)}.`,
        reopenOn,
      };
    }
  }
  return { ok: true };
}

/** May this member vote on this case? */
function canVote({ memberStatus, userActive = true, memberId, subjectMemberId }) {
  if (memberId === subjectMemberId) return { ok: false, message: 'You cannot vote on a case about yourself.' };
  if (!userActive || memberStatus !== 'active') {
    return { ok: false, message: 'Only active members can vote.' };
  }
  return { ok: true };
}

/** How many votes must be cast for the result to count. Always at least one. */
function quorumNeeded(eligible, quorumPercent) {
  if (eligible <= 0) return 0;
  return Math.max(1, Math.ceil((eligible * quorumPercent) / 100));
}

/**
 * Count the votes.
 *   'lapsed'   not enough members voted, so nothing was decided
 *   'passed'   enough voted and the vote went the way the case needs
 *   'rejected' enough voted and the members said no
 * A suspension or a reinstatement passes with more "yes" than "no".
 * A dismissal needs at least `dismissPercent` of the votes to be "yes".
 */
function tally({ action, eligible, yes, no, quorumPercent = 50, dismissPercent = 67 }) {
  const turnout = yes + no;
  const needed = quorumNeeded(eligible, quorumPercent);
  const yesPercent = turnout > 0 ? Math.round((yes / turnout) * 100) : 0;
  const base = { turnout, quorumNeeded: needed, yesPercent };

  if (eligible <= 0) return { ...base, outcome: 'lapsed', why: 'There were no members able to vote.' };
  if (turnout < needed) {
    return { ...base, outcome: 'lapsed', why: `Only ${turnout} of the ${needed} votes needed were cast.` };
  }

  if (action === 'dismiss') {
    // whole numbers only, so 67% means exactly 67% and no rounding can tip it
    const carried = yes * 100 >= dismissPercent * turnout;
    return {
      ...base,
      outcome: carried ? 'passed' : 'rejected',
      why: carried
        ? `${yes} of ${turnout} voted yes, which reaches the ${dismissPercent}% needed to dismiss.`
        : `${yes} of ${turnout} voted yes, which is below the ${dismissPercent}% needed to dismiss.`,
    };
  }

  const carried = yes > no;
  return {
    ...base,
    outcome: carried ? 'passed' : 'rejected',
    why: carried ? `${yes} voted yes and ${no} voted no.` : `${yes} voted yes and ${no} voted no, so it did not win.`,
  };
}

/** Is the voting over: the deadline has passed, or everyone who can vote has voted? */
function isFinished({ eligible, voted, closesAt, now = new Date() }) {
  if (new Date(closesAt) <= now) return true;
  return eligible <= 0 || voted >= eligible;
}

/** When the voting closes. */
function closingTime(votingDays = 7, now = new Date()) {
  return new Date(now.getTime() + votingDays * 86400000);
}

module.exports = { ACTIONS, ALLOWED_FROM, ACTION_WORD, canOpen, canVote, quorumNeeded, tally, isFinished, closingTime };