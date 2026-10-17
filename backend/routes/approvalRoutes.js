const router = require('express').Router();
const c = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/auth');

// What is waiting to be confirmed: the chairperson confirms account changes the
// administrator asked for; the treasurer confirms group-rule changes the
// chairperson asked for.
router.use(protect, authorize('admin', 'treasurer'));
router.get('/', c.listPending);
router.post('/:id/decide', c.decideChangeRequest);

module.exports = router;
