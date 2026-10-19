/**
 * One list of pages, filtered by role.
 * `icon` is a name from components/Icon.jsx.
 * `label` (optional) overrides the menu wording; `key` stays short for the phone bar.
 * `group` (optional) draws a heading above the item, used by the menus with headings.
 * `phone` marks the four that appear in the bottom bar on a small screen.
 */
export const NAV_ITEMS = [
  // ---- system administrator: her own grouped menu -----------------------
  { to: '/app',            key: 'nav.dashboard', group: 'nav.gDashboard', icon: 'dashboard', roles: ['system_admin'], phone: true, end: true },
  { to: '/app/admin/users',   key: 'nav.users',    group: 'nav.gUserMgmt', icon: 'members', roles: ['system_admin'], phone: true },
  { to: '/app/admin/roles',   key: 'nav.roles',    group: 'nav.gUserMgmt', icon: 'lock',    roles: ['system_admin'] },
  { to: '/app/admin/settings', key: 'nav.vslaSettings',   group: 'nav.gVsla',   icon: 'settings', roles: ['system_admin'] },
  { to: '/app/admin/system',  key: 'nav.systemSettings', group: 'nav.gSystem', icon: 'settings', roles: ['system_admin'] },
  { to: '/app/activity',      key: 'nav.auditTrail',     group: 'nav.gSystem', icon: 'audit',    roles: ['system_admin'] },
  { to: '/app/admin/activity', key: 'nav.systemActivity', group: 'nav.gSystem', icon: 'activity', roles: ['system_admin'] },
  { to: '/app/cases',      key: 'nav.cases',     group: 'nav.gParticipation', icon: 'cases',     roles: ['system_admin'] },
  { to: '/app/leadership', key: 'nav.leadership', group: 'nav.gParticipation', icon: 'leadership', roles: ['system_admin'] },
  { to: '/app/profile',            key: 'nav.myProfile',      group: 'nav.gProfile', icon: 'profile', roles: ['system_admin'] },
  { to: '/app/profile?tab=account', key: 'nav.changePassword', group: 'nav.gProfile', icon: 'lock',    roles: ['system_admin'] },

  // ---- chairperson: leadership menu, never the administrator's pages -----
  { to: '/app',            key: 'nav.dashboard', group: 'nav.gDashboard', icon: 'dashboard', roles: ['admin'], phone: true, end: true },

  { to: '/app/members',    key: 'nav.members',   group: 'nav.gMembership', icon: 'members',  roles: ['admin'] },
  { to: '/app/requests',   key: 'nav.requests',  icon: 'requests', roles: ['admin'], phone: true },
  { to: '/app/cases',      key: 'nav.cases',     label: 'nav.membershipVoting', icon: 'cases', roles: ['admin'] },
  { to: '/app/leadership', key: 'nav.leadership', label: 'nav.officeElections', icon: 'leadership', roles: ['admin'] },
  { to: '/app/members?view=details', key: 'nav.memberDetails', icon: 'members', roles: ['admin'] },

  { to: '/app/savings',    key: 'nav.savings',   label: 'nav.savingsManagement', group: 'nav.gFinancial', icon: 'savings', roles: ['admin'], phone: true },
  { to: '/app/loans',      key: 'nav.loans',     label: 'nav.loanManagement', icon: 'loans',  roles: ['admin'], phone: true },
  { to: '/app/loans?tab=repayments', key: 'nav.loanRepayments', icon: 'loans', roles: ['admin'] },
  { to: '/app/fines',      key: 'nav.fines',     label: 'nav.finesManagement', icon: 'fines', roles: ['admin'] },
  { to: '/app/welfare',    key: 'nav.welfare',   label: 'nav.welfareManagement', icon: 'welfare', roles: ['admin'] },
  { to: '/app/shareout',   key: 'nav.shareout',  label: 'nav.shareoutManagement', icon: 'shareout', roles: ['admin'] },

  { to: '/app/meetings',   key: 'nav.meetings',  group: 'nav.gGroup', icon: 'meetings', roles: ['admin'] },
  { to: '/app/meetings?tab=attendance', key: 'nav.attendance', icon: 'meetings', roles: ['admin'] },
  { to: '/app/cycles',     key: 'nav.cycles',    icon: 'cycles', roles: ['admin'] },
  { to: '/app/approvals',  key: 'nav.approvals', label: 'nav.settingsApproval', icon: 'requests', roles: ['admin'] },

  { to: '/app/analytics?tab=reports', key: 'nav.financialReports', group: 'nav.gReports', icon: 'analytics', roles: ['admin'] },
  { to: '/app/analytics?tab=reports', key: 'nav.membershipReports', icon: 'analytics', roles: ['admin'] },
  { to: '/app/analytics?tab=reports', key: 'nav.loanReports', icon: 'analytics', roles: ['admin'] },
  { to: '/app/analytics?tab=reports', key: 'nav.savingsReports', icon: 'analytics', roles: ['admin'] },
  { to: '/app/analytics?tab=reports', key: 'nav.shareoutReports', icon: 'analytics', roles: ['admin'] },
  { to: '/app/analytics',  key: 'nav.analytics', icon: 'analytics', roles: ['admin'] },

  { to: '/app/activity',   key: 'nav.activity',  label: 'nav.groupActivity', group: 'nav.gActivity', icon: 'activity', roles: ['admin'] },
  { to: '/app/activity?view=audit', key: 'nav.auditHistory', icon: 'audit', roles: ['admin'] },

  { to: '/app/profile',    key: 'nav.myProfile', group: 'nav.gProfile', icon: 'profile', roles: ['admin'] },
  { to: '/app/profile?tab=account', key: 'nav.changePassword', icon: 'lock', roles: ['admin'] },

  // ---- treasurer: the money menu, and only the money menu ----------------
  { to: '/app',            key: 'nav.dashboard', group: 'nav.gDashboard', icon: 'dashboard', roles: ['treasurer'], phone: true, end: true },

  { to: '/app/savings',                key: 'nav.recordSavings',   group: 'nav.gSavings', icon: 'savings', roles: ['treasurer'], phone: true },
  { to: '/app/savings?view=history',   key: 'nav.savingsHistory', icon: 'savings', roles: ['treasurer'] },
  { to: '/app/savings?view=summary',   key: 'nav.savingsSummary', icon: 'savings', roles: ['treasurer'] },

  { to: '/app/loans?filter=pending',   key: 'nav.loanApplications', group: 'nav.gLoans', icon: 'loans', roles: ['treasurer'], phone: true },
  { to: '/app/loans?action=record',    key: 'nav.recordLoan',       icon: 'loans', roles: ['treasurer'] },
  { to: '/app/loans?filter=approved',  key: 'nav.activeLoans',      icon: 'loans', roles: ['treasurer'] },
  { to: '/app/loans?tab=repayments',   key: 'nav.loanRepayments',   icon: 'loans', roles: ['treasurer'] },
  { to: '/app/loans?filter=overdue',   key: 'nav.overdueLoans',     icon: 'loans', roles: ['treasurer'] },

  { to: '/app/fines',                  key: 'nav.recordFine',        group: 'nav.gFines', icon: 'fines', roles: ['treasurer'], phone: true },
  { to: '/app/fines?view=history',     key: 'nav.fineHistory',       icon: 'fines', roles: ['treasurer'] },
  { to: '/app/fines?view=outstanding', key: 'nav.outstandingFines',  icon: 'fines', roles: ['treasurer'] },

  { to: '/app/welfare',                key: 'nav.recordWelfare',   group: 'nav.gWelfare', icon: 'welfare', roles: ['treasurer'], phone: true },
  { to: '/app/welfare?view=history',   key: 'nav.welfareHistory',  icon: 'welfare', roles: ['treasurer'] },
  { to: '/app/welfare?view=summary',   key: 'nav.welfareSummary',  icon: 'welfare', roles: ['treasurer'] },

  { to: '/app/shareout',               key: 'nav.currentCycle',    group: 'nav.gShareout', icon: 'shareout', roles: ['treasurer'], phone: true },
  { to: '/app/shareout?view=records',  key: 'nav.shareoutRecords', icon: 'shareout', roles: ['treasurer'] },
  { to: '/app/shareout?view=history',  key: 'nav.shareoutHistory', icon: 'shareout', roles: ['treasurer'] },

  { to: '/app/analytics?tab=reports&report=savings',    key: 'nav.savingsReports',   group: 'nav.gFinancialReports', icon: 'analytics', roles: ['treasurer'] },
  { to: '/app/analytics?tab=reports&report=loans',      key: 'nav.loanReports',      icon: 'analytics', roles: ['treasurer'] },
  { to: '/app/analytics?tab=reports&report=repayments', key: 'nav.repaymentReports', icon: 'analytics', roles: ['treasurer'] },
  { to: '/app/analytics?tab=reports&report=fines',      key: 'nav.fineReports',      icon: 'analytics', roles: ['treasurer'] },
  { to: '/app/analytics?tab=reports&report=welfare',    key: 'nav.welfareReports',   icon: 'analytics', roles: ['treasurer'] },
  { to: '/app/analytics?tab=reports&report=shareout',   key: 'nav.shareoutReports',  icon: 'analytics', roles: ['treasurer'] },
  { to: '/app/analytics?tab=reports&report=overview',   key: 'nav.financialSummary', icon: 'analytics', roles: ['treasurer'] },

  { to: '/app/activity',   key: 'nav.financialActivity', group: 'nav.gActivity', icon: 'activity', roles: ['treasurer'] },

  { to: '/app/profile',            key: 'nav.myProfile',      group: 'nav.gProfile', icon: 'profile', roles: ['treasurer'], phone: true },
  { to: '/app/profile?tab=account', key: 'nav.changePassword', icon: 'lock', roles: ['treasurer'] },

  // ---- the ordinary member -------------------------------------------------
  { to: '/app',            key: 'nav.dashboard', icon: 'dashboard', roles: ['member'], phone: true, end: true },
  { to: '/app/loans',      key: 'nav.loans',     label: 'nav.loanManagement',    icon: 'loans',   roles: ['member'], phone: true },
  { to: '/app/meetings',   key: 'nav.meetings',  label: 'nav.meetingsManagement', icon: 'meetings', roles: ['member'] },
  { to: '/app/welfare',    key: 'nav.welfare',   label: 'nav.welfareManagement', icon: 'welfare',  roles: ['member'] },
  { to: '/app/fines',      key: 'nav.fines',     label: 'nav.finesManagement',  icon: 'fines',    roles: ['member'] },
  { to: '/app/shareout',   key: 'nav.shareout',  label: 'nav.shareoutManagement', icon: 'shareout', roles: ['member'] },
  { to: '/app/requests',   key: 'nav.requests',  label: 'nav.requestsManagement', icon: 'requests', roles: ['member'] },
  { to: '/app/cases',      key: 'nav.cases',     icon: 'cases',      roles: ['member'] },
  { to: '/app/leadership', key: 'nav.leadership', icon: 'leadership', roles: ['member'] },
  { to: '/app/wrappers',   key: 'nav.wrappers',  icon: 'wrappers',   roles: ['member'] },
  { to: '/app/profile',    key: 'nav.profile',   icon: 'profile',    roles: ['member'], phone: true },

  // ---- secretary: records, meetings, reports — never the admin's pages ---
  { to: '/app',            key: 'nav.dashboard', group: 'nav.gDashboard', icon: 'dashboard', roles: ['secretary'], phone: true, end: true },

  { to: '/app/members',    key: 'nav.members',   group: 'nav.gMembership', icon: 'members',  roles: ['secretary'], phone: true },
  { to: '/app/requests',   key: 'nav.requests',  icon: 'requests', roles: ['secretary'], phone: true },
  { to: '/app/members?view=history', key: 'nav.membershipHistory', icon: 'members', roles: ['secretary'] },

  { to: '/app/meetings',   key: 'nav.meetings',  group: 'nav.gMeetings', icon: 'meetings', roles: ['secretary'], phone: true },
  { to: '/app/meetings?tab=attendance', key: 'nav.attendance',      icon: 'meetings', roles: ['secretary'] },
  { to: '/app/meetings?tab=records',    key: 'nav.meetingRecords', icon: 'meetings', roles: ['secretary'] },

  { to: '/app/members?view=details',   key: 'nav.memberRecords',       group: 'nav.gRecords', icon: 'members', roles: ['secretary'] },
  { to: '/app/members?view=documents', key: 'nav.membershipDocuments', icon: 'members', roles: ['secretary'] },
  { to: '/app/records',                key: 'nav.adminRecords',        icon: 'audit',   roles: ['secretary'] },

  { to: '/app/analytics?tab=reports', key: 'nav.membershipReports', group: 'nav.gReports', icon: 'analytics', roles: ['secretary'] },
  { to: '/app/analytics?tab=reports', key: 'nav.attendanceReports', icon: 'analytics', roles: ['secretary'] },
  { to: '/app/analytics?tab=reports', key: 'nav.meetingReports',    icon: 'analytics', roles: ['secretary'] },

  { to: '/app/activity/administrative', key: 'nav.adminActivity', group: 'nav.gActivity', icon: 'activity', roles: ['secretary'] },

  { to: '/app/profile',    key: 'nav.myProfile',      group: 'nav.gProfile', icon: 'profile', roles: ['secretary'] },
  { to: '/app/profile?tab=account', key: 'nav.changePassword', icon: 'lock', roles: ['secretary'] },
];

export const navFor = (role) => NAV_ITEMS.filter((i) => i.roles.includes(role));
