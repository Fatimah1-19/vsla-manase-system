// Run once from the project folder (the one that contains "backend" and "frontend"):
//     node fix-wording.cjs
// Makes the wording suit a group of women AND men: "they/their" instead of "she/her",
// "Chairperson" instead of "Chairlady", "People" instead of "Women". It also adds the
// "Back to home" text used by the new back button on the log-in page.
// Safe to run twice: anything already changed is skipped.
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const RULES = [
  ["frontend/src/i18n/en.js", "subtitle: 'Use the username the chairlady gave you.',", "subtitle: 'Use the username the chairperson gave you.', backHome: 'Back to home',"],
  ["frontend/src/i18n/en.js", "'Women waiting to join'", "'People waiting to join'"],
  ["frontend/src/i18n/en.js", "'She gets a text message confirming the amount.'", "'They get a text message confirming the amount.'"],
  ["frontend/src/i18n/en.js", "'Interest is shared out with the group. If she chooses not to pay interest, she repays only what she borrowed.'", "'Interest goes back to you at the share-out. If you choose not to pay interest, you repay only what you borrowed.'"],
  ["frontend/src/i18n/en.js", "maxAllowed: 'The most she can borrow'", "maxAllowed: 'The most they can borrow'"],
  ["frontend/src/i18n/en.js", "share: 'Her share', deductions: 'Less what she owes'", "share: 'Share', deductions: 'Less what is owed'"],
  ["frontend/src/i18n/en.js", "This texts every member her figure.", "This texts every member their own figure."],
  ["frontend/src/i18n/en.js", "voteYes: 'Accept her'", "voteYes: 'Accept'"],
  ["frontend/src/i18n/en.js", "whyJoin: 'Why she wants to join'", "whyJoin: 'Why they want to join'"],
  ["frontend/src/i18n/en.js", "A member may borrow this many times her savings", "A member may borrow this many times their savings"],
  ["frontend/src/i18n/en.js", "she borrows from the box and pays it back", "they borrow from the box and pay it back"],
  ["frontend/src/i18n/en.js", "statMembers: 'women saving'", "statMembers: 'members saving'"],
  ["frontend/src/i18n/en.js", "Each woman buys shares at every meeting.", "Each member buys shares at every meeting."],
  ["frontend/src/i18n/en.js", "A member may borrow up to three times what she has saved. She chooses whether to pay interest, and she agrees a date to pay it back before the year ends.", "A member may borrow up to two times what they have saved. They choose whether to pay interest, and agree a date to pay it back before the year ends."],
  ["frontend/src/i18n/en.js", "At the end of the cycle the box is emptied. Each woman gets back what she saved plus her part of the profit, and everyone is texted her amount.", "At the end of the cycle the box is opened. Each member gets back what they saved, and each borrower gets back the interest they paid. Everyone is texted their amount."],
  ["frontend/src/i18n/ny.js", "subtitle: 'Gwiritsani ntchito dzina limene mtsogoleri anakupatsani.',", "subtitle: 'Gwiritsani ntchito dzina limene mtsogoleri anakupatsani.', backHome: 'Bwererani ku tsamba loyamba',"],
  ["frontend/src/i18n/ny.js", "'Amayi odikira kulowa'", "'Anthu odikira kulowa'"],
  ["frontend/src/i18n/ny.js", "'amayi akusunga'", "'mamembala akusunga'"],
  ["frontend/src/i18n/ny.js", "Mayi aliyense amagula magawo", "Membala aliyense amagula magawo"],
  ["frontend/src/i18n/ny.js", "Mayi aliyense amalandira zomwe anasunga", "Membala aliyense amalandira zomwe anasunga"],
  ["frontend/src/i18n/en.extra.js", "${n} woman/women are waiting for the group to decide.", "${n} ${n === 1 ? 'person is' : 'people are'} waiting for the group to decide."],
  ["frontend/src/i18n/en.extra.js", "The borrower will see it in her text message.", "The borrower will see it in their text message."],
  ["frontend/src/i18n/en.extra.js", "She is texted the reason, so write it plainly.", "The reason is texted to them, so write it plainly."],
  ["frontend/src/i18n/en.extra.js", "alreadyPaid: 'She has already paid it'", "alreadyPaid: 'Already paid'"],
  ["frontend/src/i18n/en.extra.js", "'Her username and password are texted here.'", "'Their username and password are texted here.'"],
  ["frontend/src/i18n/en.extra.js", "one is made from her name.", "one is made from their name."],
  ["frontend/src/i18n/en.extra.js", "These have also been texted to her phone.", "These have also been texted to their phone."],
  ["frontend/src/i18n/en.extra.js", "Give her these details yourself.", "Give them these details yourself."],
  ["frontend/src/i18n/en.extra.js", "every member gets back her own savings. Each borrower gets back only the interest she paid herself.", "every member gets back their own savings. Each borrower gets back only the interest they paid themselves."],
  ["frontend/src/i18n/en.extra.js", "What a member still owes is taken from her payout.", "What a member still owes is taken from their payout."],
  ["frontend/src/i18n/en.extra.js", "texted: 'She has been texted.'", "texted: 'They have been texted.'"],
  ["frontend/src/i18n/en.extra.js", "she borrows from the box and pays it back", "they borrow from the box and pay it back"],
  ["frontend/src/i18n/en.extra.js", "everyone gets her savings back, and each borrower gets back the interest she paid.", "everyone gets their savings back, and each borrower gets back the interest they paid."],
  ["frontend/src/i18n/en.extra.js", "Every member can see her own savings", "Every member can see their own savings"],
  ["frontend/src/i18n/en.extra.js", "what she has saved. She chooses whether to pay interest, and she agrees a date", "what they have saved. They choose whether to pay interest, and agree a date"],
  ["frontend/src/i18n/en.extra.js", "gets back what she saved, and each borrower gets back the interest she paid. Fines and the welfare fund are not shared. Everyone is texted her amount.", "gets back what they saved, and each borrower gets back the interest they paid. Fines and the welfare fund are not shared. Everyone is texted their amount."],
  ["frontend/src/i18n/en.extra.js", "'Women apply online, members vote", "'People apply online, members vote"],
  ["frontend/src/i18n/en.extra.js", "rules and texted to her.", "rules and texted to them."],
  ["frontend/src/i18n/en.extra.js", "sees her own full record at any time.", "sees their own full record at any time."],
  ["frontend/src/i18n/en.extra.js", "So a member who borrowed and repaid gets her savings plus the interest she paid; a member who never borrowed gets her savings.", "So a member who borrowed and repaid gets their savings plus the interest they paid; a member who never borrowed gets their savings."],
  ["frontend/src/i18n/ny.extra.js", "Amayi ${n} akudikira chigamulo cha gulu.", "Anthu ${n} akudikira chigamulo cha gulu."],
  ["frontend/src/i18n/ny.extra.js", "'Amayi amapempha pa intaneti", "'Anthu amapempha pa intaneti"],
  ["frontend/src/pages/JoinRequests.jsx", "'These have been texted to her phone.'", "'These have been texted to their phone.'"],
  ["frontend/src/pages/JoinRequests.jsx", "Give her these details yourself.", "Give them these details yourself."],
  ["frontend/src/pages/Savings.jsx", "${res.message} She has been texted.", "${res.message} They have been texted."],
  ["backend/controllers/loanController.js", "'She has not saved anything yet, so she cannot borrow.'", "'This member has not saved anything yet, so a loan is not possible.'"],
  ["backend/controllers/loanController.js", "The most she can borrow is ", "The most that can be borrowed is "],
  ["backend/controllers/loanController.js", "times her savings of", "times the savings of"],
  ["backend/controllers/loanController.js", "That is more than she owes.", "That is more than is owed."],
  ["backend/controllers/userController.js", "the admin adds a woman to the group", "the admin adds a member to the group"],
  ["backend/controllers/userController.js", "'Enter her full name.'", "'Enter their full name.'"],
  ["backend/controllers/userController.js", "'She still has an open loan. Settle it first.'", "'This member still has an open loan. Settle it first.'"],
  ["backend/controllers/contributionController.js", "She has paid ${already.paid", "Already paid ${already.paid"],
  ["backend/controllers/joinRequestController.js", "could not take her this cycle.", "could not take them this cycle."],
  ["backend/controllers/settingsController.js", "How many times her savings a member may borrow", "How many times their savings a member may borrow"],
  ["backend/utils/messages.js", "Please remember her.", "Please remember them."]
];

function read(file) {
  const raw = fs.readFileSync(file, 'utf8');
  return { text: raw.replace(/\r\n/g, '\n'), crlf: raw.includes('\r\n') };
}
function write(file, text, crlf) {
  fs.writeFileSync(file, crlf ? text.replace(/\n/g, '\r\n') : text, 'utf8');
}

let changed = 0, skipped = 0, missing = 0;

// 1. exact phrase changes
const byFile = {};
for (const [f, from, to] of RULES) (byFile[f] = byFile[f] || []).push([from, to]);

for (const [rel, rules] of Object.entries(byFile)) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) { console.log('  !! file not found:', rel); missing += rules.length; continue; }
  const { text, crlf } = read(file);
  let out = text;
  for (const [from, to] of rules) {
    if (out.includes(to)) { skipped++; }                                   // already done
    else if (out.includes(from)) { out = out.split(from).join(to); changed++; }
    else { console.log('  !! not found in', rel + ':', from.slice(0, 60)); missing++; }
  }
  if (out !== text) write(file, out, crlf);
}

// 2. "chairlady" -> "chairperson" everywhere in the code, texts and README
function walk(dir, hit) {
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, hit);
    else if (/\.(js|jsx|cjs|md|sql)$/.test(name)) hit(p);
  }
}
let renamed = 0;
const visit = (p) => {
  const { text, crlf } = read(p);
  if (!/chairlady/i.test(text)) return;
  write(p, text.replace(/chairlady/g, 'chairperson').replace(/Chairlady/g, 'Chairperson'), crlf);
  renamed++;
};
for (const d of ['backend', 'frontend/src']) if (fs.existsSync(path.join(ROOT, d))) walk(path.join(ROOT, d), visit);
if (fs.existsSync(path.join(ROOT, 'README.md'))) visit(path.join(ROOT, 'README.md'));

console.log(`\nDone. ${changed} phrase(s) changed, ${skipped} already done, ${renamed} file(s) updated for "chairperson".`);
if (missing) console.log(`${missing} phrase(s) were not found. Those files may have been edited by hand; paste them to me and I will fix them.`);