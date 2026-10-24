const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../config/permissions');
const c = require('../controllers/settingsRequestsController');

const router = express.Router();

router.use(authenticate);

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
// Complete
router.post('/:id/complete', requirePermission('settingsRequests.manage'), c.completeRequest);
// Reject
router.post('/:id/reject', requirePermission('settingsRequests.manage'), c.rejectRequest);

module.exports = router;
