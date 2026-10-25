const router = require('express').Router();
const c = require('../controllers/joinRequestController');
const { protect, requirePermission } = require('../middleware/auth');

router.post('/', c.submitRequest);                  // public: no login
router.post('/check-eligibility', c.checkEligibility); // public: eligibility screening
router.get('/', protect, c.listRequests);
router.post('/:id/vote', protect, c.vote);          // every member gets a say
router.patch('/:id', protect, requirePermission('joinRequests.decide'), c.decideRequest);

module.exports = router;
