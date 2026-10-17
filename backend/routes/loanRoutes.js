const router = require('express').Router();
const c = require('../controllers/loanController');
const { protect, authorize, committee, recorders, blockSystemAdmin } = require('../middleware/auth');

router.use(protect, blockSystemAdmin);
router.get('/', c.listLoans);                                   // members see their own
router.get('/overdue', committee(), c.overdueLoans);
router.get('/limit', c.borrowingLimit);                         // savings x multiplier
router.get('/repayments', c.listRepayments);                    // committee: anyone; member: herself
router.post('/', c.applyLoan);                                  // a member may apply for herself
router.post('/remind', recorders(), c.sendReminders);
router.get('/:id', c.getLoan);
router.patch('/:id/decision', authorize('admin', 'treasurer', 'secretary'), c.decideLoan);
router.post('/:id/repayments', recorders(), c.recordRepayment);

module.exports = router;
