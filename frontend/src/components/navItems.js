/**
 * One list of pages, filtered by role.
 * `icon` is a name from components/Icon.jsx.
 * `label` (optional) overrides the menu wording; `key` stays short for the phone bar.
 * `group` (optional) draws a heading above the item, used by the menus with headings.
 * `phone` marks the four that appear in the bottom bar on a small screen.
 */
export const NAV_ITEMS = [
  // ---- system administrator: mirror secretary/treasurer structure -------
  { to: '/app',            key: 'nav.dashboard', group: 'nav.gDashboard', icon: 'dashboard', roles: ['system_admin'], phone: true, end: true },

  { to: '/app/admin/users', key: 'nav.users',      group: 'nav.gUserMgmt', icon: 'members', roles: ['system_admin'], phone: true },
  { to: '/app/admin/roles', key: 'nav.roles',      icon: 'lock',    roles: ['system_admin'], sub: true },

  { to: '/app/admin/settings', key: 'nav.vslaSettings', group: 'nav.gSettings', icon: 'settings', roles: ['system_admin'] },
  { to: '/app/admin/system',   key: 'nav.systemSettings', icon: 'settings', roles: ['system_admin'], sub: true },

  { to: '/app/cases',      key: 'nav.cases',     group: 'nav.gParticipation', icon: 'cases',     roles: ['system_admin'], phone: true },
  { to: '/app/leadership', key: 'nav.leadership', icon: 'leadership', roles: ['system_admin'], sub: true },

  { to: '/app/activity',      key: 'nav.auditTrail',     group: 'nav.gReports', icon: 'audit',    roles: ['system_admin'] },
  { to: '/app/admin/activity', key: 'nav.systemActivity', icon: 'activity', roles: ['system_admin'], sub: true },

  { to: '/app/profile',            key: 'nav.profile',        group: 'nav.gProfile', icon: 'profile', roles: ['system_admin'], phone: true },
  { to: '/app/profile?tab=account', key: 'nav.changePassword', icon: 'lock',    roles: ['system_admin'], sub: true },

    // ---- chairperson: leadership menu, never the administrator's pages -----
  { to: '/app', key: 'nav.dashboard', group: 'nav.gDashboard', icon: 'dashboard', roles: ['admin'], phone: true, end: true },

  { to: '/app/approvals', key: 'nav.approvals', icon: 'requests', roles: ['admin'] },

  { to: '/app/members', key: 'nav.members', group: 'nav.gMembers', icon: 'members', roles: ['admin'] },
  { to: '/app/requests', key: 'nav.joinRequests', icon: 'requests', roles: ['admin'], sub: true },

  { to: '/app/cases', key: 'nav.cases', group: 'nav.gMembers', icon: 'cases', roles: ['admin'], sub: true },
  { to: '/app/leadership', key: 'nav.leadership', icon: 'leadership', roles: ['admin'], sub: true },

  { to: '/app/savings', key: 'nav.recordSavings', group: 'nav.gSavings', icon: 'savings', roles: ['admin'] },
  { to: '/app/financial-activity?type=savings', key: 'nav.savingsActivity', icon: 'activity', roles: ['admin'], sub: true },
  { to: '/app/analytics?tab=reports', key: 'nav.savingsReports', icon: 'analytics', roles: ['admin'], sub: true },

  { to: '/app/loans?filter=pending', key: 'nav.loanApplications', group: 'nav.gLoans', icon: 'loans', roles: ['admin'] },
  { to: '/app/loans', key: 'nav.loans', icon: 'loans', roles: ['admin'], sub: true },
  { to: '/app/financial-activity?type=loans', key: 'nav.loanActivity', icon: 'activity', roles: ['admin'], sub: true },

  { to: '/app/fines', key: 'nav.fines', group: 'nav.gContributions', icon: 'fines', roles: ['admin'] },
  { to: '/app/welfare', key: 'nav.welfare', icon: 'welfare', roles: ['admin'], sub: true },
  { to: '/app/wrappers', key: 'nav.groceries', icon: 'wrappers', roles: ['admin'], sub: true },

  { to: '/app/shareout', key: 'nav.shareout', group: 'nav.gShareout', icon: 'shareout', roles: ['admin'] },

  { to: '/app/cycles', key: 'nav.currentCycle', group: 'nav.gCycle', icon: 'cycles', roles: ['admin'] },
  { to: '/app/cycles?close=1', key: 'nav.closeCycle', icon: 'cycles', roles: ['admin'], sub: true },

  { to: '/app/meetings', key: 'nav.meetings', group: 'nav.gMeetings', icon: 'meetings', roles: ['admin'] },

  { to: '/app/analytics?tab=reports', key: 'nav.financialReports', icon: 'analytics', roles: ['admin'], sub: true },
  { to: '/app/analytics?tab=reports&scope=member', key: 'nav.memberReports', icon: 'analytics', roles: ['admin'], sub: true },

  { to: '/app/profile', key: 'nav.profile', group: 'nav.gProfile', icon: 'profile', roles: ['admin'] },
  { to: '/app/profile?tab=account', key: 'nav.changePassword', icon: 'lock', roles: ['admin'], sub: true },

// ---- treasurer: the money menu, and only the money menu ----------------
  { to: '/app',            key: 'nav.dashboard', group: 'nav.gDashboard', icon: 'dashboard', roles: ['treasurer'], phone: true, end: true },

  { to: '/app/savings',                key: 'nav.savingsManagement', group: 'nav.gSavings', icon: 'savings', roles: ['treasurer'] },
  { to: '/app/financial-activity?type=savings', key: 'nav.savingsActivity', icon: 'activity', roles: ['treasurer'], sub: true },
  { to: '/app/analytics?tab=reports&report=savings', key: 'nav.savingsReports', icon: 'analytics', roles: ['treasurer'], sub: true },

  { to: '/app/loans',                  key: 'nav.loanManagement',   group: 'nav.gLoans', icon: 'loans', roles: ['treasurer'] },
  { to: '/app/loans?filter=pending',   key: 'nav.loanApplications', icon: 'loans', roles: ['treasurer'], sub: true },
  { to: '/app/loans?tab=repayments',   key: 'nav.repayments',       icon: 'loans', roles: ['treasurer'], sub: true },
  { to: '/app/financial-activity?type=loans', key: 'nav.loanActivity', icon: 'activity', roles: ['treasurer'], sub: true },

  { to: '/app/fines',                  key: 'nav.finesManagement',   group: 'nav.gFines', icon: 'fines', roles: ['treasurer'] },

  { to: '/app/contributions',          key: 'nav.contributions',     group: 'nav.gContributions', icon: 'welfare', roles: ['treasurer'] },
  { to: '/app/welfare',                key: 'nav.welfare',           group: 'nav.gContributions', icon: 'welfare', roles: ['treasurer'], sub: true },
  { to: '/app/wrappers',               key: 'nav.groceries',         group: 'nav.gContributions', icon: 'wrappers', roles: ['treasurer'], sub: true },

  { to: '/app/shareout',               key: 'nav.shareout',        group: 'nav.gShareout', icon: 'shareout', roles: ['treasurer'] },

  { to: '/app/financial-activity',     key: 'nav.financialReports', group: 'nav.gFinancialReports', icon: 'analytics', roles: ['treasurer'] },
  { to: '/app/analytics?tab=reports',  key: 'nav.financialReports', icon: 'analytics', roles: ['treasurer'], sub: true },

  { to: '/app/profile',            key: 'nav.profile',        group: 'nav.gProfile', icon: 'profile', roles: ['treasurer'] },
  { to: '/app/profile?tab=account', key: 'nav.changePassword', icon: 'lock', roles: ['treasurer'], sub: true },

  // ---- the ordinary member -------------------------------------------------
  { to: '/app',            key: 'nav.myDashboard', icon: 'dashboard', roles: ['member'], phone: true, end: true },
  { to: '/app/savings',    key: 'nav.mySavings',   icon: 'savings',   roles: ['member'], phone: true },
  { to: '/app/loans',      key: 'nav.myLoans',     icon: 'loans',     roles: ['member'], phone: true },
  { to: '/app/meetings',   key: 'nav.meetings',    icon: 'meetings',  roles: ['member'] },
  { to: '/app/welfare',    key: 'nav.myWelfare',   icon: 'welfare',   roles: ['member'] },
  { to: '/app/fines',      key: 'nav.myFines',     icon: 'fines',     roles: ['member'] },
  { to: '/app/shareout',   key: 'nav.myShareout',  icon: 'shareout',  roles: ['member'] },
  { to: '/app/requests',   key: 'nav.myRequests',  icon: 'requests',  roles: ['member'] },
  { to: '/app/cases',      key: 'nav.cases',       icon: 'cases',      roles: ['member'] },
  { to: '/app/leadership', key: 'nav.leadership',  icon: 'leadership', roles: ['member'] },
  { to: '/app/wrappers',   key: 'nav.myGroceries', icon: 'wrappers',   roles: ['member'] },
  { to: '/app/receipts',   key: 'nav.myReceipts',  icon: 'reports',    roles: ['member'], phone: true },
  { to: '/app/profile',            key: 'nav.profile',        icon: 'profile', roles: ['member'] },
  { to: '/app/profile?tab=account', key: 'nav.changePassword', icon: 'lock', roles: ['member'], sub: true },

  // ---- secretary: records, meetings, reports — never the admin's pages ---
  { to: '/app',            key: 'nav.dashboard', group: 'nav.gDashboard', icon: 'dashboard', roles: ['secretary'], phone: true, end: true },

  { to: '/app/members',    key: 'nav.members',   group: 'nav.gMembership', icon: 'members',  roles: ['secretary'], phone: true },
  { to: '/app/requests',   key: 'nav.requests',  icon: 'requests', roles: ['secretary'], phone: true, sub: true },
  { to: '/app/members?view=history', key: 'nav.membershipHistory', icon: 'members', roles: ['secretary'], sub: true },

  { to: '/app/meetings',   key: 'nav.meetings',  group: 'nav.gMeetings', icon: 'meetings', roles: ['secretary'], phone: true },
  { to: '/app/meetings?tab=attendance', key: 'nav.attendance',      icon: 'meetings', roles: ['secretary'], sub: true },
  { to: '/app/meetings?tab=records',    key: 'nav.meetingRecords', icon: 'meetings', roles: ['secretary'], sub: true },

  { to: '/app/members?view=details',   key: 'nav.memberRecords',       group: 'nav.gRecords', icon: 'members', roles: ['secretary'], sub: true },
  { to: '/app/members?view=documents', key: 'nav.membershipDocuments', icon: 'members', roles: ['secretary'], sub: true },
  { to: '/app/records',                key: 'nav.adminRecords',        icon: 'audit',   roles: ['secretary'], sub: true },

  { to: '/app/analytics?tab=reports', key: 'nav.reports', group: 'nav.gReports', icon: 'analytics', roles: ['secretary'] },
  { to: '/app/analytics?tab=reports', key: 'nav.attendanceReports', icon: 'analytics', roles: ['secretary'], sub: true },
  { to: '/app/analytics?tab=reports', key: 'nav.meetingReports',    icon: 'analytics', roles: ['secretary'], sub: true },

  { to: '/app/profile',    key: 'nav.profile',        group: 'nav.gProfile', icon: 'profile', roles: ['secretary'] },
  { to: '/app/profile?tab=account', key: 'nav.changePassword', icon: 'lock', roles: ['secretary'], sub: true },
];

export const navFor = (role) => NAV_ITEMS.filter((i) => i.roles.includes(role));

/**
 * The chairperson's menu keeps the major areas at the top and folds the busy
 * money pages under three collapsible headings. Every child is an existing
 * route; nothing new is created here.
 */
const CHAIR_SIDEBAR = [
  { to: '/app', key: 'nav.dashboard', icon: 'dashboard', end: true },
  { to: '/app/approvals', key: 'nav.approvals', icon: 'requests' },
  { to: '/app/members', key: 'nav.members', icon: 'members' },
  {
    key: 'nav.gSavings',
    icon: 'savings',
    children: [
      { to: '/app/savings', key: 'nav.recordSavings', icon: 'savings' },
      { to: '/app/cycles', key: 'nav.currentCycle', icon: 'cycles' },
      { to: '/app/analytics?tab=reports', key: 'nav.savingsReports', icon: 'analytics' },
    ],
  },
  {
    key: 'nav.gLoans',
    icon: 'loans',
    children: [
      { to: '/app/loans?filter=pending', key: 'nav.loanApplications', icon: 'loans' },
      { to: '/app/loans?tab=repayments', key: 'nav.loanRepayments', icon: 'loans' },
      { to: '/app/financial-activity?type=loans', key: 'nav.loanActivity', icon: 'activity' },
    ],
  },
  {
    key: 'nav.gContributions',
    icon: 'fines',
    children: [
      { to: '/app/fines', key: 'nav.fines', icon: 'fines' },
      { to: '/app/welfare', key: 'nav.welfare', icon: 'welfare' },
      { to: '/app/wrappers', key: 'nav.groceries', icon: 'wrappers' },
    ],
  },
  { to: '/app/shareout', key: 'nav.shareout', icon: 'shareout' },
  { to: '/app/meetings', key: 'nav.meetings', icon: 'meetings' },
  { to: '/app/profile', key: 'nav.profile', icon: 'profile' },
];

/** The ordinary member's compact menu: her money, her group, her account. */
const MEMBER_SIDEBAR = [
  { to: '/app', key: 'nav.myDashboard', icon: 'dashboard', end: true },
  {
    key: 'nav.gMyFinances',
    icon: 'savings',
    children: [
      { to: '/app/savings', key: 'nav.mySavings', icon: 'savings' },
      { to: '/app/loans', key: 'nav.myLoans', icon: 'loans' },
      { to: '/app/welfare', key: 'nav.myWelfare', icon: 'welfare' },
      { to: '/app/fines', key: 'nav.myFines', icon: 'fines' },
      { to: '/app/wrappers', key: 'nav.myGroceries', icon: 'wrappers' },
      { to: '/app/shareout', key: 'nav.myShareout', icon: 'shareout' },
    ],
  },
  {
    key: 'nav.gCommunity',
    icon: 'meetings',
    children: [
      { to: '/app/meetings', key: 'nav.meetings', icon: 'meetings' },
      { to: '/app/requests', key: 'nav.myRequests', icon: 'requests' },
      { to: '/app/cases', key: 'nav.cases', icon: 'cases' },
      { to: '/app/leadership', key: 'nav.leadership', icon: 'leadership' },
      { to: '/app/receipts', key: 'nav.myReceipts', icon: 'reports' },
    ],
  },
];

/** The sidebar menu for a role. Other roles keep their existing flat menu. */
export const sidebarFor = (role) => {
  if (role === 'admin') return CHAIR_SIDEBAR;
  if (role === 'member') return MEMBER_SIDEBAR;
  return navFor(role).filter((i) => !i.sub);
};

/** The path part of a nav target, without the query string. */
const pathOf = (to) => to.split('?')[0];

/**
 * Every link of the section a page belongs to — its main entry and the extra
 * views (history, summary, record…) that used to clutter the sidebar. Used to
 * draw the tabs at the top of a section page.
 */
export const sectionLinksFor = (role, pathname) => {
  const items = navFor(role).filter((i) => pathOf(i.to) === pathname);
  return items.length > 1 ? items : [];
};

/**
 * The section's main entry — the one that stays in the sidebar. The pages use
 * it for the back button, so someone who opened a sub-view (a history, a
 * record form) can step back to the section's home.
 */
export const sectionHomeFor = (role, pathname) => {
  const items = navFor(role).filter((i) => pathOf(i.to) === pathname);
  const home = items.find((i) => !i.sub);
  if (home) return home;
  // A sub-entry that lives alone on its pathname (e.g. the system activity log)
  // still needs a way home: fall back to the first main entry of its group.
  const sub = items.find((i) => i.sub && i.group);
  if (!sub) return null;
  return navFor(role).find((i) => i.group === sub.group && !i.sub) || null;
};
