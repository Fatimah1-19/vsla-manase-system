const router = require('express').Router();
const c = require('../controllers/settingsController');
const { protect, requirePermission } = require('../middleware/auth');

router.use(protect);

// The rules of the group. The chairperson and treasurer read them here; the
// system administrator applies the configuration the chairperson has sent.
router.get('/group-rules', requirePermission('groupRules.view'), c.listGroupRules);
router.put('/group-rules/apply', requirePermission('groupRules.configure'), c.applyGroupRulesDirect);

// How the system behaves: the administrator's alone.
router.get('/system', requirePermission('system.settings'), c.listSystemSettings);
router.put('/system', requirePermission('system.settings'), c.updateSystemSettings);

module.exports = router;
