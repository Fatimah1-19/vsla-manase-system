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
router.patch('/:id/decision', requirePermission('loans.decide'), c.decideLoan);
router.post('/:id/repayments', requirePermission('loans.record'), c.recordRepayment);

module.exports = router;
