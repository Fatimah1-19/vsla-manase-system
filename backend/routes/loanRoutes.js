const router = require('express').Router();
const c = require('../controllers/loanController');
const { protect, requirePermission, blockSystemAdmin } = require('../middleware/auth');

router.use(protect, blockSystemAdmin);
router.get('/', c.listLoans);                                   // members see their own
router.get('/overdue', requirePermission('loans.viewAll'), c.overdueLoans);
router.get('/limit', c.borrowingLimit);                         // savings x multiplier
router.get('/repayments', c.listRepayments);                    // committee: anyone; member: herself
router.post('/', c.applyLoan);                                  // a member may apply for herself
router.post('/remind', requirePermission('loans.record'), c.sendReminders);
router.get('/:id', c.getLoan);
// The ID filed with the application, for the offices that sit on a loan. Every
// opening by an office is written in the audit trail.
router.get('/:id/id-document', c.getIdDocument);
// The chairperson settles the committee's decision (approve / reject).
router.patch('/:id/decision', requirePermission('loans.decide'), c.decideLoan);
// The treasurer records the money leaving the box; the secretary verifies it.
router.patch('/:id/record', requirePermission('loans.record'), c.recordLoan);
router.patch('/:id/verify', requirePermission('loans.verify'), c.verifyLoan);
router.patch('/:id/reject-verification', requirePermission('loans.verify'), c.rejectLoanVerification);
router.post('/:id/repayments', requirePermission('loans.record'), c.recordRepayment);

module.exports = router;
