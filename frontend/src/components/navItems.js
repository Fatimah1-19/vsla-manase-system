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

  // ---- everyone else -----------------------------------------------------
  { to: '/app',            key: 'nav.dashboard', icon: 'dashboard', roles: ['treasurer', 'secretary', 'member'], phone: true, end: true },
  { to: '/app/analytics',  key: 'nav.analytics', label: 'nav.analyticsReports', icon: 'analytics', roles: ['treasurer', 'secretary'] },
  { to: '/app/savings',    key: 'nav.savings',   label: 'nav.savingsManagement', icon: 'savings', roles: ['treasurer', 'secretary'], phone: true },
  { to: '/app/loans',      key: 'nav.loans',     label: 'nav.loanManagement',    icon: 'loans',   roles: ['treasurer', 'secretary', 'member'], phone: true },
  { to: '/app/members',    key: 'nav.members',   label: 'nav.memberManagement',  icon: 'members', roles: ['treasurer', 'secretary'] },
  { to: '/app/meetings',   key: 'nav.meetings',  label: 'nav.meetingsManagement', icon: 'meetings',  roles: ['treasurer', 'secretary', 'member'] },
  { to: '/app/welfare',    key: 'nav.welfare',   label: 'nav.welfareManagement', icon: 'welfare', roles: ['treasurer', 'secretary', 'member'] },
  { to: '/app/fines',      key: 'nav.fines',     label: 'nav.finesManagement',  icon: 'fines',     roles: ['treasurer', 'secretary', 'member'] },
  { to: '/app/shareout',   key: 'nav.shareout',  label: 'nav.shareoutManagement', icon: 'shareout', roles: ['treasurer', 'secretary', 'member'] },
  { to: '/app/requests',   key: 'nav.requests',  label: 'nav.requestsManagement', icon: 'requests',  roles: ['treasurer', 'secretary', 'member'] },
  { to: '/app/cases',      key: 'nav.cases',     icon: 'cases',     roles: ['treasurer', 'secretary', 'member'] },
  { to: '/app/leadership', key: 'nav.leadership', icon: 'leadership', roles: ['treasurer', 'secretary', 'member'] },
  { to: '/app/messages',   key: 'nav.messages',  icon: 'messages',  roles: ['treasurer', 'secretary'] },
  { to: '/app/approvals',  key: 'nav.approvals', label: 'nav.approvals', icon: 'requests', roles: ['treasurer'] },
  { to: '/app/activity',   key: 'nav.activity',  icon: 'activity',  roles: ['treasurer', 'secretary'] },
  { to: '/app/profile',    key: 'nav.profile',   icon: 'profile',   roles: ['treasurer', 'secretary', 'member'], phone: true },
  { to: '/app/wrappers',   key: 'nav.wrappers',  icon: 'wrappers',  roles: ['treasurer', 'secretary', 'member'] },
];

export const navFor = (role) => NAV_ITEMS.filter((i) => i.roles.includes(role));
