const router = require('express').Router();
const c = require('../controllers/reportController');
const { protect, requirePermission, blockSystemAdmin } = require('../middleware/auth');

router.use(protect, blockSystemAdmin);
router.get('/absentees', requirePermission('reports.view'), c.listAbsentees);
router.get('/absentee-register', requirePermission('reports.view'), c.listAbsenteeRegister);
router.get('/group', requirePermission('reports.view'), c.groupReport);
router.get('/member/:id', requirePermission('reports.view'), c.memberReport);

module.exports = router;
