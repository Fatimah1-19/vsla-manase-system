const assert = require('assert');
const { calcShares, totalsOf } = require('../utils/shareout.js');

const rows = [
  { member_id: 1, member_savings: 50000, interest_paid: 5000, unpaid_loan: 0, unpaid_fines: 0 },        // borrower who repaid
  { member_id: 2, member_savings: 30000, interest_paid: 0, unpaid_loan: 0, unpaid_fines: 0 },           // never borrowed
  { member_id: 3, member_savings: 20000, interest_paid: 1000, unpaid_loan: 15000, unpaid_fines: 500 },  // still owes a bit
  { member_id: 4, member_savings: 10000, interest_paid: 0, unpaid_loan: 40000, unpaid_fines: 0 },       // owes more than savings
  { member_id: 5, member_savings: 0, interest_paid: 0, unpaid_loan: 0, unpaid_fines: 0 },               // nothing
  { member_id: 6, member_savings: 10000.10, interest_paid: 0.2, unpaid_loan: 0, unpaid_fines: 0 },       // float traps
];
const s = calcShares(rows);
const by = (id) => s.find((x) => x.member_id === id);

assert.strictEqual(s.length, 5, 'member with nothing is left out');
assert.strictEqual(by(1).share_amount, 55000, 'borrower gets savings + her own interest');
assert.strictEqual(by(2).share_amount, 30000, 'non-borrower gets only savings, no one elses interest');
assert.strictEqual(by(2).profit_share, 0);
assert.strictEqual(by(3).share_amount, 20000 + 1000 - 15000 - 500, 'debts taken from payout');
assert.strictEqual(by(3).deductions, 15500);
assert.strictEqual(by(4).share_amount, 0, 'payout never negative');
assert.strictEqual(by(4).deductions, 10000);
assert.strictEqual(by(4).unrecovered, 30000, 'leftover debt is reported, not erased');
assert.strictEqual(by(6).share_amount, 10000.3, 'cents add up exactly');

const t = totalsOf(s);
// Interest of member 1 must NOT show up in member 2's share:
assert.strictEqual(t.interest_returned, 5000 + 1000 + 0.2);
assert.strictEqual(+(t.total_payout).toFixed(2), 55000 + 30000 + 5500 + 0 + 10000.3);
console.log('share-out rules OK', t);
