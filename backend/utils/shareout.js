/**
 * The group's share-out rules (agreed in the member interviews):
 *
 *   - Savings go back to the member who saved them.
 *   - Interest is NOT shared among everyone. Each borrower gets back only the
 *     interest she herself paid.
 *   - Fines and the welfare fund are NOT shared. They stay with the group.
 *   - Anything a member still owes (open loan, unpaid fines) is taken from
 *     her payout first. If she owes more than she is due, the rest is
 *     reported as "unrecovered" instead of silently disappearing.
 *
 * All sums are done in whole tambala (cents) so the totals always add up.
 */
const cents = (n) => Math.round(Number(n || 0) * 100);
const kwacha = (c) => c / 100;

function calcShares(rows) {
  return rows
    .map((r) => {
      const savings = cents(r.member_savings);
      const interest = cents(r.interest_paid);
      const owedLoan = Math.max(0, cents(r.unpaid_loan));
      const owedFines = Math.max(0, cents(r.unpaid_fines));
      const owed = owedLoan + owedFines;

      const gross = savings + interest;
      const deducted = Math.min(owed, gross);
      const unrecovered = owed - deducted;

      return {
        ...r,
        member_savings: kwacha(savings),
        profit_share: kwacha(interest),          // interest returned to her
        loan_deducted: kwacha(Math.min(owedLoan, deducted)),
        fines_deducted: kwacha(deducted - Math.min(owedLoan, deducted)),
        deductions: kwacha(deducted),
        unrecovered: kwacha(unrecovered),
        share_amount: kwacha(gross - deducted),
      };
    })
    // Leave out anyone with nothing to do with this cycle.
    .filter((s) => s.member_savings > 0 || s.profit_share > 0 || s.deductions > 0 || s.unrecovered > 0);
}

function totalsOf(shares) {
  const sum = (key) => kwacha(shares.reduce((a, s) => a + cents(s[key]), 0));
  return {
    total_savings: sum('member_savings'),
    interest_returned: sum('profit_share'),
    deductions: sum('deductions'),
    unrecovered: sum('unrecovered'),
    total_payout: sum('share_amount'),
  };
}

module.exports = { calcShares, totalsOf, cents, kwacha };
