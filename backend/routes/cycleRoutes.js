const router = require('express').Router();
const c = require('../controllers/cycleController');
const { protect, requirePermission, blockSystemAdmin } = require('../middleware/auth');

router.use(protect, blockSystemAdmin);
router.get('/', c.listCycles);
router.get('/active', c.activeCycle);
router.post('/', requirePermission('cycles.manage'), c.createCycle);
router.patch('/:id/close', requirePermission('cycles.manage'), c.closeCycle);

module.exports = router;
