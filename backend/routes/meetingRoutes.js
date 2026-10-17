const router = require('express').Router();
const c = require('../controllers/meetingController');
const { protect, requirePermission } = require('../middleware/auth');

router.use(protect);
router.get('/', c.listMeetings);
router.get('/:id', c.getMeeting);
router.post('/', requirePermission('meetings.record'), c.createMeeting);
router.patch('/:id', requirePermission('meetings.record'), c.updateMinutes);
router.put('/:id/attendance', requirePermission('meetings.record'), c.saveAttendance);

module.exports = router;
