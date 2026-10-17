const router = require('express').Router();
const c = require('../controllers/settingsController');
const { protect, requirePermission } = require('../middleware/auth');

router.use(protect);

// The rules of the group: the chairperson proposes, the treasurer confirms.
// The treasurer reads them here to check what is being confirmed.
router.get('/group-rules', requirePermission('groupRules.view'), c.listGroupRules);
router.put('/group-rules', requirePermission('groupRules.propose'), c.proposeGroupRules);

// How the system behaves: the administrator's alone.
router.get('/system', requirePermission('system.settings'), c.listSystemSettings);
router.put('/system', requirePermission('system.settings'), c.updateSystemSettings);

module.exports = router;
