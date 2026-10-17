const router = require('express').Router();
const c = require('../controllers/registrationController');
const { protect, authorize, committee, recorders, blockSystemAdmin } = require('../middleware/auth');

router.use(protect, blockSystemAdmin);
router.get('/', committee(), c.listFees);
router.post('/', recorders(), c.recordFee);
router.delete('/:id', authorize('admin'), c.remove);

module.exports = router;
