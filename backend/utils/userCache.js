/**
 * Every request has to know who is asking. Looking that up in the database costs
 * a full trip (about a third of a second when the database is far away), and a
 * page makes several requests at once. So the answer is remembered for a few
 * seconds. config/db.js empties this the moment anything changes a user or
 * member row, so a suspension or a role change still takes effect immediately.
 */
const TTL_MS = 15 * 1000;
const users = new Map();

function getCachedUser(id) {
  const hit = users.get(id);
  if (hit && Date.now() - hit.at < TTL_MS) return { ...hit.user };   // a copy, so nobody edits the stored one
  users.delete(id);
  return null;
}

function cacheUser(id, user) {
  users.set(id, { at: Date.now(), user: { ...user } });
}

function forgetUsers() {
  users.clear();
}

module.exports = { getCachedUser, cacheUser, forgetUsers };