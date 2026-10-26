const express = require('express');
const { protect, requirePermission } = require('../middleware/auth');
const c = require('../controllers/settingsRequestsController');

const router = express.Router();

router.use(protect);

// Chairperson creates requests
router.post('/', requirePermission('settingsRequests.create'), c.createRequest);
// Chairperson views own
router.get('/mine', requirePermission('settingsRequests.viewOwn'), c.listMine);
// System admin views all
router.get('/', requirePermission('settingsRequests.viewAll'), c.listAll);
// System admin counts
router.get('/counts', requirePermission('settingsRequests.viewAll'), c.getCounts);
// Mark read
router.post('/:id/read', requirePermission('settingsRequests.manage'), c.markRead);
// Apply the requested values to the real setting, then close the request
router.post('/:id/configure', requirePermission('settingsRequests.manage'), c.configureRequest);
// Complete without re-applying values (the administrator configured them manually)
router.post('/:id/complete', requirePermission('settingsRequests.manage'), c.completeRequest);
// Reject
router.post('/:id/reject', requirePermission('settingsRequests.manage'), c.rejectRequest);

module.exports = router;
