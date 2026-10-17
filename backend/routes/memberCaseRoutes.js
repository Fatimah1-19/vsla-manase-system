const router = require('express').Router();
const c = require('../controllers/memberCaseController');
const { protect, requirePermission } = require('../middleware/auth');

// Votes about members: suspending, dismissing, bringing back.
router.use(protect);

router.get('/', c.list);                                              // everyone may read every case
router.get('/status', c.status);                                      // my status and votes waiting for me
router.post('/', requirePermission('cases.manage'), c.open);          // the chairperson opens a case
router.post('/:id/vote', c.castVote);                                 // any member votes
router.patch('/:id/response', c.respond);                             // the member concerned replies
router.patch('/:id/withdraw', requirePermission('cases.manage'), c.withdraw);        // the chairperson withdraws it
router.post('/:id/execute', requirePermission('cases.manage'), c.execute);           // the chairperson carries out a passed vote
router.post('/:id/settlement-paid', requirePermission('cases.settlement'), c.settlementPaid);   // the treasurer or secretary records the payment

module.exports = router;