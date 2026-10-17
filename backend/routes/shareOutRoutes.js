const router = require('express').Router();
const c = require('../controllers/shareOutController');
const { protect, requirePermission, blockSystemAdmin } = require('../middleware/auth');

router.use(protect, blockSystemAdmin);
router.get('/', requirePermission('shareout.view'), c.listShareOuts);
router.get('/mine', c.myShare);
router.get('/preview', requirePermission('shareout.view'), c.preview);
router.post('/', requirePermission('shareout.record'), c.createShareOut);
router.post('/:id/confirm', requirePermission('shareout.view'), c.confirmShareOut);
router.post('/:id/distribute', requirePermission('shareout.record'), c.distribute);
router.get('/:id', c.getShareOut);

module.exports = router;
