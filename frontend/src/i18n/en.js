import extra from './en.extra.js';
import { deepMerge } from './merge.js';

const base = {
  code: 'en',
  name: 'English',

  app: { name: 'Manase Village Savings and Loan Association', tagline: 'Saving together, lending to each other' },

  nav: {
    dashboard: 'Dashboard', savings: 'Savings', loans: 'Loans', members: 'Members',
    people: 'People', meetings: 'Meetings', welfare: 'Welfare fund', fines: 'Fines',
    shareout: 'Share-out', requests: 'Join requests', messages: 'Messages',
    activity: 'Group Activity', settings: 'Settings', profile: 'My account',
    cycles: 'Saving cycles', logout: 'Log out', menu: 'Menu', more: 'More',
    savingsManagement: 'Savings management', loanManagement: 'Loan management',
    memberManagement: 'Member management', welfareManagement: 'Welfare fund management',
    analyticsReports: 'Analytics & Reports', meetingsManagement: 'Meetings management',
    finesManagement: 'Fines management', shareoutManagement: 'Share-out management',
    requestsManagement: 'Join request management',
  },

  activity: {
    subtitle: 'Requests, savings, loans, fines, welfare, share-outs, meetings and approvals, and who signed in to do what.',
    signedIn: 'Signed in',
    signedOut: 'Signed out',
    noSignOut: 'No sign-out was recorded',
    actionCount: (n) => `${n} ${n === 1 ? 'action' : 'actions'}`,
    noActions: 'Nothing else was done in this sitting.',
    otherTitle: 'Other events',
    system: 'System',
  },

  roles: { admin: 'Chairperson', treasurer: 'Treasurer', secretary: 'Secretary', member: 'Member' },

  common: {
    save: 'Save', cancel: 'Cancel', close: 'Close', add: 'Add', edit: 'Edit', del: 'Remove',
    search: 'Search', loading: 'Loading…', none: 'Nothing here yet', back: 'Back',
    amount: 'Amount', date: 'Date', name: 'Name', phone: 'Phone number', reason: 'Reason',
    status: 'Status', total: 'Total', actions: 'Actions', notes: 'Notes', yes: 'Yes', no: 'No',
    confirm: 'Are you sure?', sending: 'Sending…', saving: 'Saving…', all: 'All',
    village: 'Village', role: 'Role', language: 'Language', optional: 'optional',
    retry: 'Try again', view: 'View', today: 'Today',
  },

  login: {
    title: 'Log in', subtitle: 'Use the username the chairperson gave you.', backHome: 'Back to home',
    username: 'Username', password: 'Password', submit: 'Log in',
    forgot: 'I forgot my password', joinPrompt: 'Not in the group yet?', joinLink: 'Ask to join',
    attemptsLeft: (n) => `${n} more ${n === 1 ? 'try' : 'tries'} before this account locks.`,
  },

  forgot: {
    title: 'Reset your password',
    step1: 'Type your username. We will text a code to the phone on your account.',
    step2: 'Type the code from the text message and choose a new password.',
    sendCode: 'Send me a code', code: 'Code from the text message',
    newPassword: 'New password', confirmPassword: 'Type the new password again',
    submit: 'Change my password', resend: 'Send another code',
    backToLogin: 'Back to log in', mismatch: 'The two passwords are not the same.',
  },

  idle: {
    title: 'Still there?',
    body: (s) => `You have not touched the screen for a while. You will be logged out in ${s} seconds.`,
    stay: 'Keep me logged in', out: 'Log out now',
  },

  dashboard: {
    greeting: (name) => `Hello, ${name}`,
    cycleProgress: 'Saving cycle', weeksLeft: (n) => `${n} days until share-out`,
    mySavings: 'What I have saved', myShares: 'Shares', myLoan: 'My loan',
    outstanding: 'Still to repay', dueBy: 'Repay by', noLoan: 'You have no loan right now',
    unpaidFines: 'Unpaid fines', myShare: 'My share this cycle', shareReady: 'Your share is ready to collect',
    nextMeeting: 'Next meeting', noMeeting: 'No meeting has been set',
    totalSavings: 'Total savings', cashInBox: 'Cash in the box', loansOut: 'Money lent out',
    interestEarned: 'Interest earned', welfareBalance: 'Welfare fund', activeMembers: 'Active members',
    pendingLoans: 'Loans waiting for a decision', overdueLoans: 'Overdue loans',
    pendingRequests: 'People waiting to join', attendanceRate: 'Attendance',
    recentSavings: 'Money received lately', recentActivity: 'What happened lately',
    recentMeetings: 'Recent meetings', smsToday: 'Texts sent today', lockedAccounts: 'Locked accounts',
    finesOutstanding: 'Fines not yet paid',
  },

  savings: {
    title: 'Savings', record: 'Record a saving', member: 'Member', shares: 'Shares',
    recordedBy: 'Recorded by', note: 'Note', thisCycle: 'This cycle', cycle: 'Saving cycle',
    empty: 'No savings recorded yet. Record the first one.',
    smsNote: 'They get a text message confirming the amount.',
  },

  loans: {
    title: 'Loans', apply: 'Apply for a loan', request: 'Request a loan',
    borrower: 'Borrower', principal: 'Amount borrowed', interest: 'Interest',
    withInterest: 'Pay interest on this loan', withInterestHelp:
      'Interest goes back to you at the share-out. If you choose not to pay interest, you repay only what you borrowed.',
    noInterest: 'No interest', purpose: 'What is the money for?',
    dueDate: 'Repay by', totalDue: 'Total to repay', repaid: 'Repaid', outstanding: 'Still owing',
    termNote: 'A loan runs for up to three months from the day it is approved, but always ends by the close of the cycle. Repay in installments or all at once.',
    approve: 'Approve', reject: 'Turn down', decisionNote: 'Reason (the borrower will see this)',
    recordRepayment: 'Record a repayment', repayments: 'Repayments',
    statementFor: 'Loan statement', remind: 'Send repayment reminders',
    empty: 'No loans yet.', maxAllowed: 'The most they can borrow',
    overdue: 'Overdue', pending: 'Waiting', approved: 'Running', rejected: 'Turned down',
    repaidStatus: 'Cleared', defaulted: 'Not repaid',
  },

    members: {
      title: 'Members', number: 'Member number', joined: 'Joined', savings: 'Saved',
      historyTitle: 'Membership history',
      presentIn: (p, m) => `Present at ${p} of the last ${m} meetings`,
      welfarePaid: (amount, n) => `Welfare paid: ${amount} in ${n} contributions`,
      repaidOf: (paid, total) => `${paid} of ${total} repaid`,
    nextOfKin: 'Next of kin', addPerson: 'Add a person', empty: 'Nobody has been added yet.',
    suspend: 'Suspend', unlock: 'Unlock account', newPassword: 'Give a new password',
    tempPassword: 'Temporary password', writeItDown: 'Write this down. It is only shown once.',
    active: 'Active', inactive: 'Suspended', locked: 'Locked',
  },

  meetings: {
    title: 'Meetings', schedule: 'Set a meeting', when: 'Date', time: 'Time', place: 'Where',
    agenda: 'What will be discussed', minutes: 'What happened', attendance: 'Attendance',
    present: 'Present', absent: 'Absent', excused: 'Excused', markAttendance: 'Mark attendance',
    markedAttendance: 'Attendance marked',
    otherRecordings: 'Other recordings',
    notify: 'Text everyone about this meeting', empty: 'No meetings recorded yet.',
    presentCount: (n, t) => `${n} of ${t} present`,
    statusUpcoming: 'Upcoming', statusHeld: 'Held', viewRecord: 'View record',
  },

  welfare: {
    title: 'Welfare fund', balance: 'Money in the welfare fund',
    contribute: 'Record a contribution', help: 'Give help to a member',
    category: 'What is this for', sickness: 'Sickness', funeral: 'Funeral',
    emergency: 'Emergency', other: 'Something else',
    announce: 'Tell the whole group', announceHelp:
      'Everyone else gets a text so they can visit or attend.',
    contribution: 'Contribution', payout: 'Help given', empty: 'Nothing recorded yet.',
  },

  fines: {
    title: 'Fines', record: 'Record a fine', paid: 'Paid', unpaid: 'Not paid',
    markPaid: 'Mark as paid', collected: 'Collected', empty: 'No fines recorded.',
  },

  shareout: {
    title: 'Share-out', preview: 'Work out the shares', calculate: 'Calculate',
    distribute: 'Hand out and text everyone', breakdown: 'Where the money came from',
    savedByMembers: 'Saved by members', interestCollected: 'Interest collected',
    finesCollected: 'Fines collected', welfareLeft: 'Left in welfare fund',
    profitPot: 'Profit to share', totalFund: 'Total in the box',
    perMember: 'What each member gets', share: 'Share', deductions: 'Less what is owed',
    profitShare: 'Profit', notShared: 'not shared',
    draftSaved: 'Saved as a draft. Nothing has been handed out yet.',
    openLoans: (n) => `${n} loan(s) are still out. Settle them before sharing out.`,
    confirmDistribute: 'This texts every member their own figure. Do it once the money is ready.',
    empty: 'No share-out has been done yet.',
  },

    requests: {
      title: 'People waiting to join', vote: 'Your vote', voteYes: 'Accept',
      voteNo: 'Not this cycle', tally: 'Group votes', accept: 'Approve Membership',
      decline: 'Reject Membership', votingOpen: 'Voting open',
      acceptVotes: 'Accept votes', rejectVotes: 'Reject votes', whyJoin: 'Why they want to join',
      empty: 'No one is waiting to join.', decided: 'Decided',
      groupDecides: 'Every member can vote. A committee member records what the group decided.',
      background: 'Applicant background',
      backgroundHint: 'These are the answers the applicant gave in their join form. Read them before voting.',
      backgroundGroup: 'The applicant\'s answers',
      backgroundEmpty: 'No answers were provided.',
      screening: [
        { key: 'resident', good: 'yes', q: 'Are you a resident of this area?' },
        { key: 'goodCharacter', good: 'yes', q: 'Do you have good character?' },
        { key: 'trustworthy', good: 'yes', q: 'Are you trustworthy?' },
        { key: 'honest', good: 'yes', q: 'Are you honest in your dealings?' },
        { key: 'repaysLoans', good: 'yes', q: 'Do you repay loans on time without trouble?' },
        { key: 'formerMember', good: 'yes', q: 'If you belonged to another group, were you a good member there?' },
        { key: 'followsRules', good: 'yes', q: 'Are you willing to follow the group\'s rules?' },
        { key: 'reliableIncome', good: 'yes', q: 'Do you have a reliable source of income for regular savings?' },
        { key: 'noDebt', good: 'no', q: 'Do you have any unpaid loan or debt elsewhere?' },
        { key: 'notExpelled', good: 'no', q: 'Have you ever been expelled for dishonesty or default?' },
      ],
      topics: {
        resident: 'Lives in the area',
        goodCharacter: 'Good character',
        trustworthy: 'Trustworthy',
        honest: 'Honest',
        repaysLoans: 'Repays loans on time',
        formerMember: 'Good standing in another group',
        followsRules: 'Follows the group rules',
        reliableIncome: 'Reliable income',
        noDebt: 'Unpaid debt elsewhere',
        notExpelled: 'Ever expelled',
      },
    },

  messages: {
    title: 'Messages', send: 'Send a message', to: 'Send to',
    everyone: 'Everyone in the group', byRole: 'Everyone with one role',
    selected: 'Chosen people', oneNumber: 'One phone number',
    broadcast: 'This goes to the whole group', private: 'This goes to one person only',
    message: 'Message', charsLeft: (n) => `${n} characters left`,
    history: 'Messages sent', sent: 'Sent', failed: 'Did not send', skipped: 'Skipped',
    empty: 'No messages sent yet.', pickPeople: 'Choose who gets it',
    dryRun: 'Test mode is on — messages are written to the server screen, not sent.',
  },

  cycles: {
    title: 'Saving cycles', start: 'Start a new cycle', name: 'Cycle name',
    startDate: 'Starts', endDate: 'Ends', shareValue: 'Value of one share',
    close: 'Close this cycle', running: 'Running', completed: 'Finished',
    oneYear: 'A saving cycle runs for one year.',
  },

  settings: {
    title: 'Group rules',
    loanMultiplier: 'A member may borrow this many times their savings',
    interestRate: 'Interest rate on loans (%)',
    shareInterest: 'Share loan interest at share-out',
    shareFines: 'Share fine money at share-out',
    shareWelfare: 'Share what is left of the welfare fund',
    shareValue: 'Value of one share', welfarePerMeeting: 'Welfare contribution each meeting',
    saved: 'Rules saved.',
  },

  profile: {
    title: 'My account', changePassword: 'Change my password',
    current: 'Current password', newPass: 'New password', confirm: 'Type it again',
    languagePref: 'Language for the screen and for text messages',
    mustChange: 'You are using a temporary password. Please choose your own now.',
  },

  home: {
    heroTitle: 'Manase VSLA Management System',
    heroBody:
      'Manase Village Savings and Loan Association — Every week we put in what we can. When someone needs money for seed, school fees or medicine, they borrow from the box and pay it back. At the end of the year we open the box and share everything out.',
    join: 'Ask to join the group', login: 'Log in',
    statMembers: 'Active members', statLoans: 'Loans issued', statRepaid: 'loans repaid',
    statMeetings: 'meetings held',
    howTitle: 'How the VSLA works',
    step1Title: 'We save every week',
    step1Body: "Members contribute their savings at each weekly meeting. The committee records each contribution and member's savings balance is updated.",
    step2Title: 'We lend to each other',
    step2Body: "Members can apply for loans according to the group's rules. The committee records the loan, interest, repayment periods and repayments.",
    step3Title: 'We share out at the end of the cycle',
    step3Body: "At the end of the savings cycle, each member's share-out amount is calculated according to the VSLA's agreed rules.",
    joinTitle: 'How can I become a member',
    joinBody: 'Submit a request to join. The VSLA committee and members will assess the application. Approval is based on factors such as good character, being a trustworthy citizen of the area, repaying loans reliably, and a positive history if previously in another group. If approved, you must pay the agreed registration fee before the committee records you in the system and provides account access.',
    joinFeeNote: (fee) => `A one-off registration fee of ${fee} is paid when you join the group.`,
    joinName: 'Your full name', joinPhone: 'Your phone number',
    joinVillage: 'Your village', joinOccupation: 'Your occupation', joinReason: 'Why do you want to join?',
    joinBackground: 'A few questions about you',
    joinBackgroundHint: 'The group reads your answers before it votes. Please answer every question.',
    joinBackgroundRequired: 'Please answer every question before sending.',
    joinAnswerQuestions: 'Answer the background questions',
    joinAnswerDone: 'Done',
    joinAnswered: (n, total) => `${n} of ${total} answered`,
    joinAnsweredAll: 'All questions answered',
    joinSubmit: 'Send my request',
    joinDone: 'Your request has been sent. The committee and members will review it at the next meeting.',
  },

  errors: {
    generic: 'Something went wrong. Please try again.',
    offline: 'Cannot reach the server. Check that the backend is running.',
    sessionExpired: 'Your session ended. Please log in again.',
    notAllowed: 'Your role cannot open that page.',
    notAllowedBody: 'The menu only shows the pages your role may use. If you think you should have access, speak to the chairperson.',
    notFound: 'That page does not exist.',
  },
};

import votes from './en.votes.js';
import leaders from './en.leaders.js';
export default deepMerge(deepMerge(deepMerge(base, extra), votes), leaders);
