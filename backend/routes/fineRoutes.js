const router = require('express').Router();
const c = require('../controllers/fineController');
const { protect, authorize, committee, recorders, blockSystemAdmin } = require('../middleware/auth');

router.use(protect, blockSystemAdmin);
router.get('/', c.listFines);
router.get('/summary', committee(), c.finesSummary);
router.post('/', recorders(), c.recordFine);
router.patch('/:id/pay', recorders(), c.markPaid);
router.delete('/:id', authorize('admin'), c.deleteFine);

module.exports = router;
