/**
 * Friendly names for the VSLA (group) settings, keyed by the setting key.
 * Shared by the settings page and the administrator's dashboard so a proposed
 * change reads the same wherever it is shown.
 */
export const GROUP_LABELS = {
  loan_multiplier: 'settings.loanMultiplier',
  default_interest_rate: 'settings.interestRate',
  weekly_share_value: 'settings.shareValue',
  welfare_contribution: 'settings.welfarePerMeeting',
  monthly_levy: 'settings.monthlyLevy',
  registration_fee: 'settings.registrationFee',
  absence_fine: 'settings.absenceFine',
  case_voting_days: 'settings.caseVotingDays',
  case_quorum_percent: 'settings.caseQuorum',
  case_dismiss_percent: 'settings.caseDismiss',
  office_voting_days: 'settings.officeVotingDays',
  office_quorum_percent: 'settings.officeQuorum',
  include_interest_in_shareout: 'settings.include_interest_in_shareout',
  include_fines_in_shareout: 'settings.include_fines_in_shareout',
  include_welfare_in_shareout: 'settings.include_welfare_in_shareout',
  join_screening_questions: 'settings.screeningTitle',
};

export const groupRuleLabel = (key) => GROUP_LABELS[key] || key;
