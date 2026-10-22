// English text for the Leadership page: filling an empty office by a vote.
const plural = (n, one, many) => (n === 1 ? one : many);

export default {
  nav: { leadership: 'Leadership' },

  leaders: {
    title: 'Leadership',
    subtitle: 'When an office is empty, the members choose who fills it by a vote.',
    chairSubtitle: 'You open the election and carry out the result. Every active member votes.',
    actingNote: 'The chairperson is gone. As treasurer or secretary you may open and carry out the election for the chairperson.',

    vacantTitle: 'Offices that are empty',
    vacantNone: 'Every office has someone in it.',
    vacant: (office) => `${office} — no one holds this office`,
    startElection: 'Start an election',

    openTitle: 'Elections open now',
    noneOpen: 'No election is open right now.',
    historyTitle: 'Past elections',
    none: 'No election has been held yet.',

    office: 'Office',
    offices: { admin: 'chairperson', treasurer: 'treasurer', secretary: 'secretary' },
    reason: 'Why the office is empty',
    reasonPlaceholder: 'For example: the secretary has been deactivated. Everyone will read this.',
    candidates: 'Who is standing',
    candidatePool: 'Active members who hold no office',
    needTwo: 'Choose at least two candidates.',
    notify: 'Tell all members by text message',
    openNote: (days) => `Voting stays open for ${days} ${plural(days, 'day', 'days')}. Every active member gets one vote, and no one sees who is ahead until it closes.`,
    openVote: 'Open the election',

    turnout: (n, total) => `${n} of ${total} members have voted`,
    quorumNote: (q) => `At least ${q} votes are needed for the result to count.`,
    closesIn: (d) => (d <= 0 ? 'Closes today' : `Closes in ${d} ${plural(d, 'day', 'days')}`),
    hiddenNote: 'The running totals stay hidden until voting ends.',
    yourVote: 'Your vote',
    vote: 'Vote',
    voted: 'You voted',
    once: 'You can vote once and cannot change it afterwards.',
    cannotVote: 'You cannot vote in this election.',
    roundTwo: 'Run-off',

    status: { open: 'Open', passed: 'Decided', lapsed: 'Not enough votes', tie: 'Level', withdrawn: 'Withdrawn' },
    result: (top, turnout) => `Leading with ${top} of ${turnout} votes.`,
    winner: (name) => `Chosen: ${name}`,
    runOff: 'The leaders were level, so a run-off is being held among them.',
    carryOut: 'Carry out the result',
    chooseWinner: 'Choose who takes the office',
    confirmCarry: (name, office) => `Make ${name} the ${office} now? Their account is changed at once and everyone is told.`,
    inOfficeSince: 'In office since',
    withdraw: 'Withdraw the election',
    confirmWithdraw: 'Withdraw this election? It will be closed.',
    openedBy: (name, date) => `Opened ${date} by ${name}`,
    awaitingCarry: 'Decided · waiting for the chairperson',
    awaitingYou: 'Decided · waiting for you',
    tiePick: 'Level · the chairperson chooses',
    empty: 'Nothing to show yet.',
  },

  settings: {
    officeTitle: 'Filling an empty office',
    officeNote: 'These decide how a vote to fill the chairperson, treasurer or secretary seat is carried.',
    officeVotingDays: 'How many days an election stays open',
    officeQuorum: 'Share of members who must vote for an election result to count (%)',
  },

  notice: {
    officeVoteWaiting: (n) => (n === 1 ? '1 election is waiting for your vote.' : `${n} elections are waiting for your vote.`),
    officeVacant: 'An office in the committee is empty. Go to Leadership to fill it.',
    goLeadership: 'Go to Leadership',
  },

  membership: {
    officeVacant: 'Vacant',
    fillOffice: 'Fill this office',
  },
};
