const router = require('express').Router();
const c = require('../controllers/officeVoteController');
const { protect, committee } = require('../middleware/auth');

// Every member may read the elections (and status); opening, withdrawing and
// carrying out are for the committee. The controller repeats the finer check:
// opening a non-chairperson office is the chairperson's alone, and if the
// chairperson's seat is empty the treasurer or secretary may act for that seat.
router.use(protect);
router.get('/', c.list);
router.get('/status', c.status);
router.post('/', committee(), c.open);
router.post('/:id/ballot', c.castBallot);
router.patch('/:id/withdraw', committee(), c.withdraw);
router.post('/:id/execute', committee(), c.execute);

module.exports = router;
