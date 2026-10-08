const router = require('express').Router();
const c = require('../controllers/meetingController');
const { protect, recorders } = require('../middleware/auth');

router.use(protect);
router.get('/', c.listMeetings);
router.get('/:id', c.getMeeting);
router.post('/', recorders(), c.createMeeting);
router.patch('/:id', recorders(), c.updateMinutes);
router.put('/:id/attendance', recorders(), c.saveAttendance);

module.exports = router;
