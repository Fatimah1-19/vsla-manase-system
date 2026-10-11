// English text for the Votes page, the member standing notices and the voting rules.
const plural = (n, one, many) => (n === 1 ? one : many);

export default {
  nav: { votes: 'Votes' },

  votes: {
    title: 'Votes',
    subtitle: 'Decisions the group makes together. Every member has one vote, and votes are secret.',
    chairSubtitle: 'You open a vote. The members decide. You carry out the result.',
    openTitle: 'Open votes',
    finishedTitle: 'Finished votes',
    none: 'There are no votes yet.',
    noneOpen: 'No votes are open right now.',

    titles: {
      suspend: (n) => `Suspend ${n}`,
      dismiss: (n) => `Dismiss ${n}`,
      reinstate: (n) => `Bring back ${n}`,
    },
    status: {
      open: 'Open', passed: 'Passed', rejected: 'Not passed', lapsed: 'Not enough votes', withdrawn: 'Withdrawn',
    },
    closesIn: (d) => (d <= 0 ? 'Closes today' : `Closes in ${d} ${plural(d, 'day', 'days')}`),
    openedBy: (name, date) => `Opened ${date} by ${name}`,
    reasonLabel: 'Reason given',
    replyLabel: (name) => `${name}'s reply`,
    turnout: (n, total) => `${n} of ${total} members have voted`,
    quorumNote: (q) => `At least ${q} votes are needed for the result to count.`,
    ruleSimple: 'It passes if more members vote yes than no.',
    ruleDismiss: (p) => `A dismissal needs at least ${p}% of the votes to be yes.`,
    hiddenNote: 'The yes and no totals stay hidden until voting ends.',

    yes: { suspend: 'Yes, suspend', dismiss: 'Yes, dismiss', reinstate: 'Yes, bring back' },
    no: { suspend: 'No, do not suspend', dismiss: 'No, do not dismiss', reinstate: 'No, do not bring back' },
    once: 'You can vote once and cannot change it afterwards.',
    voted: 'You voted',
    thanks: 'Thank you for voting.',

    aboutYou: 'This vote is about you',
    aboutYouNote: 'You cannot vote on this, but you can write your side below. Every voter will read it.',
    replyPlaceholder: 'Write your reply here',
    saveReply: 'Save my reply',

    result: (yes, no) => `${yes} voted yes and ${no} voted no.`,
    carriedOut: 'Carried out',
    waitingChair: 'Passed · waiting for the chairperson',
    waitingYou: 'Passed · waiting for you',

    // The chairperson
    propose: 'Propose a vote',
    proposeTitle: 'Propose a vote',
    member: 'Member',
    chooseMember: 'Choose a member',
    decision: 'Decision',
    decisions: { suspend: 'Suspend', dismiss: 'Dismiss', reinstate: 'Bring back' },
    reason: 'Reason (everyone will read this)',
    notify: 'Tell all members by text message',
    proposeNote: (days) => `Voting stays open for ${days} ${plural(days, 'day', 'days')}. The member will be told in private and can write a reply that voters will see.`,
    openVote: 'Open the vote',
    carryOut: 'Carry out the decision',
    carryNote: {
      suspend: (n) => `Carrying this out suspends ${n}. They can still log in and see their own records, but cannot borrow or vote. Their savings stay safe.`,
      dismiss: (n) => `Carrying this out ends ${n}'s membership. They can no longer log in. What they are owed is worked out for the treasurer to pay.`,
      reinstate: (n) => `Carrying this out brings ${n} back as an active member.`,
    },
    confirmCarry: 'Carry out this decision now?',
    withdraw: 'Withdraw this proposal',
    confirmWithdraw: 'Withdraw this proposal? The vote will be closed.',

    settlementOwed: (amount) => `Owed back to the member: ${amount}`,
    settlementStill: (amount) => `They still owe ${amount} beyond this.`,
    markPaid: 'Mark as paid',
    settlementPaid: (date) => `Settlement paid on ${date}`,
    confirmPaid: 'Record that this settlement has been paid?',
  },

  membership: {
    active: 'Active', suspended: 'Suspended', dismissed: 'Dismissed', inactive: 'Inactive',
    voteOpen: 'Vote open', votePassed: 'Vote passed',
    seeVote: 'See the vote',
    proposeVote: 'Propose a vote',
    proposeBack: 'Propose bringing back',
    proposeDismiss: 'Propose dismissal',
    meaning: 'What each status means',
    meaningSuspended: 'can log in and see their own records, but cannot borrow or vote. Their savings stay safe.',
    meaningDismissed: 'cannot log in. The treasurer pays back what they are owed and marks it paid.',
    meaningVote: 'the members are deciding, or have decided and the chairperson has not yet acted.',
    onlyVote: 'Only a vote can change a membership.',
    owedBack: (amount) => `Owed back ${amount}`,
  },

  notice: {
    suspended: 'Your membership is suspended. You cannot borrow or vote. Your savings are safe. Please speak to the chairperson.',
    votesWaiting: (n) => (n === 1 ? '1 vote is waiting for you.' : `${n} votes are waiting for you.`),
    goVote: 'Go to Votes',
    aboutYou: 'A vote about your membership is open. You can read it and write your reply.',
    readIt: 'Read it',
  },

  settings: {
    votingDays: 'Days a vote stays open',
    quorumPercent: 'Share of members who must vote for a result to count (%)',
    dismissPercent: 'Share of yes votes needed to dismiss someone (%)',
    votesGroup: 'Votes about members',
  },
};