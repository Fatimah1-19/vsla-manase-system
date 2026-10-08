const router = require('express').Router();
const c = require('../controllers/contributionController');
const { protect, authorize, committee, recorders } = require('../middleware/auth');

router.use(protect);
router.get('/mine', c.mine);
router.get('/', committee(), c.listMonth);
router.get('/payments', committee(), c.listPayments);
router.get('/arrears', committee(), c.behind);
router.post('/', recorders(), c.record);
router.delete('/:id', authorize('admin'), c.remove);

module.exports = router;
