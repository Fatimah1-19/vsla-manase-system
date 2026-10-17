/**
 * One list of pages, filtered by role.
 * `icon` is a name from components/Icon.jsx.
 * `label` (optional) overrides the menu wording; `key` stays short for the phone bar.
 * `phone` marks the four that appear in the bottom bar on a small screen.
 */
export const NAV_ITEMS = [
  { to: '/app',            key: 'nav.dashboard', icon: 'dashboard', roles: ['admin', 'treasurer', 'secretary', 'member', 'system_admin'], phone: true, end: true },
  { to: '/app/admin/users',    key: 'nav.accounts',       label: 'nav.accounts',       icon: 'members',  roles: ['system_admin'], phone: true },
  { to: '/app/admin/settings', key: 'nav.systemSettings', label: 'nav.systemSettings', icon: 'settings', roles: ['system_admin'] },
  { to: '/app/analytics',  key: 'nav.analytics', label: 'nav.analyticsReports', icon: 'analytics', roles: ['admin', 'treasurer', 'secretary'] },
  { to: '/app/savings',    key: 'nav.savings',   label: 'nav.savingsManagement', icon: 'savings', roles: ['admin', 'treasurer', 'secretary'], phone: true },
  { to: '/app/loans',      key: 'nav.loans',     label: 'nav.loanManagement',    icon: 'loans',   roles: ['admin', 'treasurer', 'secretary', 'member'], phone: true },
  { to: '/app/members',    key: 'nav.members',   label: 'nav.memberManagement',  icon: 'members', roles: ['admin', 'treasurer', 'secretary'] },
  { to: '/app/meetings',   key: 'nav.meetings',  label: 'nav.meetingsManagement', icon: 'meetings',  roles: ['admin', 'treasurer', 'secretary', 'member'] },
  { to: '/app/welfare',    key: 'nav.welfare',   label: 'nav.welfareManagement', icon: 'welfare', roles: ['admin', 'treasurer', 'secretary', 'member'] },
  { to: '/app/fines',      key: 'nav.fines',     label: 'nav.finesManagement',  icon: 'fines',     roles: ['admin', 'treasurer', 'secretary', 'member'] },
  { to: '/app/shareout',   key: 'nav.shareout',  label: 'nav.shareoutManagement', icon: 'shareout',  roles: ['admin', 'treasurer', 'secretary', 'member'] },
  { to: '/app/requests',   key: 'nav.requests',  label: 'nav.requestsManagement', icon: 'requests',  roles: ['admin', 'treasurer', 'secretary', 'member', 'system_admin'] },
  { to: '/app/cases',      key: 'nav.cases',     icon: 'cases',     roles: ['admin', 'treasurer', 'secretary', 'member'] },
  { to: '/app/leadership', key: 'nav.leadership', icon: 'leadership', roles: ['admin', 'treasurer', 'secretary', 'member'] },
  { to: '/app/messages',   key: 'nav.messages',  icon: 'messages',  roles: ['admin', 'treasurer', 'secretary'] },
  { to: '/app/cycles',     key: 'nav.cycles',    icon: 'cycles',    roles: ['admin'] },
  { to: '/app/approvals',  key: 'nav.approvals', label: 'nav.approvals', icon: 'requests', roles: ['admin', 'treasurer'] },
  { to: '/app/activity',   key: 'nav.activity',  icon: 'activity',  roles: ['admin', 'treasurer', 'secretary', 'system_admin'] },
  { to: '/app/profile',    key: 'nav.profile',   icon: 'profile',   roles: ['admin', 'treasurer', 'secretary', 'member', 'system_admin'], phone: true },
  { to: '/app/wrappers',   key: 'nav.wrappers',  icon: 'wrappers',  roles: ['admin', 'treasurer', 'secretary', 'member'] },
];

export const navFor = (role) => NAV_ITEMS.filter((i) => i.roles.includes(role));