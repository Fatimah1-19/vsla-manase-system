const router = require('express').Router();
const c = require('../controllers/adminController');
const { protect, systemAdmin } = require('../middleware/auth');

// The system administrator looks after accounts. She never touches money and
// never holds an office, so this is the only door she opens.
router.use(protect, systemAdmin());

router.get('/members', c.listMembers);
router.post('/accounts', c.createAccount);

router.get('/change-requests', c.listMyChangeRequests);
router.post('/change-requests', c.proposeChange);
router.post('/change-requests/:id/withdraw', c.withdrawChangeRequest);

module.exports = router;
