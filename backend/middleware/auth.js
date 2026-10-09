const jwt = require('jsonwebtoken');
const { one } = require('../config/db');
const { getCachedUser, cacheUser } = require('../utils/userCache');

/** Require a valid, unexpired token. */
async function protect(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Please log in to continue.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Who is asking? Remembered for a few seconds (and forgotten the moment any
    // user changes), because every request needs this and it costs a database trip.
    let user = getCachedUser(decoded.id);
    if (!user) {
      user = await one(
        `SELECT u.id, u.username, u.role, u.full_name, u.phone, u.language, u.is_active,
                u.must_change_password, m.id AS member_id, (m.avatar IS NOT NULL) AS has_avatar
           FROM users u
           LEFT JOIN members m ON m.user_id = u.id
          WHERE u.id = $1`,
        [decoded.id]
      );
      if (user) cacheUser(decoded.id, user);
    }

    if (!user) return res.status(401).json({ message: 'This account no longer exists.' });
    if (!user.is_active) return res.status(403).json({ message: 'This account has been suspended.' });

    req.user = user;

    // A sliding session: while someone is still working, give back a fresh token
    // once the one they hold is past half its life. Without this the token would
    // simply run out 30 minutes after log-in, even in the middle of work.
    // (A person who stops working is still logged out by the idle timer in the app.)
    const lifetime = decoded.exp - decoded.iat;
    const left = decoded.exp - Math.floor(Date.now() / 1000);
    if (lifetime > 0 && left < lifetime / 2) {
      res.setHeader(
        'X-Renewed-Token',
        jwt.sign(
          { id: user.id, username: user.username, role: user.role },
          process.env.JWT_SECRET,
          { expiresIn: lifetime }
        )
      );
    }

    next();
  } catch (err) {
    const expired = err.name === 'TokenExpiredError';
    return res.status(401).json({
      message: expired ? 'Your session has ended. Please log in again.' : 'Your session is not valid.',
      expired,
    });
  }
}

/** Restrict a route to certain roles. */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Please log in to continue.' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Your role cannot do this.' });
    }
    next();
  };
}

/** Anyone who keeps the books: admin, treasurer or secretary. */
const committee = () => authorize('admin', 'treasurer', 'secretary');

/**
 * The people who write in the books: the treasurer and the secretary.
 * The chairperson (admin) oversees, approves loans and manages members,
 * but the entries themselves are made by these two.
 */
const recorders = () => authorize('treasurer', 'secretary');

module.exports = { protect, authorize, committee, recorders };