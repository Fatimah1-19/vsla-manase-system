const router = require('express').Router();
const c = require('../controllers/memberCaseController');
const { protect, authorize, recorders } = require('../middleware/auth');

// Votes about members: suspending, dismissing, bringing back.
router.use(protect);

router.get('/', c.list);                                              // everyone may read every case
router.get('/status', c.status);                                      // my status and votes waiting for me
router.post('/', authorize('admin'), c.open);                         // the chairperson opens a case
router.post('/:id/vote', c.castVote);                                 // any member votes
router.patch('/:id/response', c.respond);                             // the member concerned replies
router.patch('/:id/withdraw', authorize('admin'), c.withdraw);        // the chairperson withdraws it
router.post('/:id/execute', authorize('admin'), c.execute);           // the chairperson carries out a passed vote
router.post('/:id/settlement-paid', recorders(), c.settlementPaid);   // the treasurer or secretary records the payment

module.exports = router;