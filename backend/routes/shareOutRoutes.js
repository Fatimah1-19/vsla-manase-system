const router = require('express').Router();
const c = require('../controllers/shareOutController');
const { protect, committee, recorders, blockSystemAdmin } = require('../middleware/auth');

router.use(protect, blockSystemAdmin);
router.get('/', committee(), c.listShareOuts);
router.get('/mine', c.myShare);
router.get('/preview', committee(), c.preview);
router.post('/', recorders(), c.createShareOut);
router.post('/:id/confirm', committee(), c.confirmShareOut);
router.post('/:id/distribute', recorders(), c.distribute);
router.get('/:id', c.getShareOut);

module.exports = router;
