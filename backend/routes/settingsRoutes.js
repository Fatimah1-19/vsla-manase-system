const router = require('express').Router();
const c = require('../controllers/settingsController');
const { protect, authorize, systemAdmin } = require('../middleware/auth');

router.use(protect);

// The rules of the group: the chairperson proposes, the treasurer confirms.
// The treasurer reads them here to check what is being confirmed.
router.get('/group-rules', authorize('admin', 'treasurer'), c.listGroupRules);
router.put('/group-rules', authorize('admin'), c.proposeGroupRules);

// How the system behaves: the administrator's alone.
router.get('/system', systemAdmin(), c.listSystemSettings);
router.put('/system', systemAdmin(), c.updateSystemSettings);

module.exports = router;
