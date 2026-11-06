import { translate } from './index.js';

const LANG_KEY = 'vb_lang';

function currentLang() {
  try {
    return localStorage.getItem(LANG_KEY) || 'ny';
  } catch {
    return 'ny';
  }
}

const CHICHEWA = {
  'Enter your username and password.': 'Lowetsani dzina lolowera ndi achinsinsi.',
  'That username and password do not match.': 'Dzina lolowera kapena achinsinsi sizikugwirizana.',
  'This account has been deactivated.': 'Akauntiyi yaimitsidwa.',
  'This account has been deactivated. Talk to the chairperson.': 'Akauntiyi yaimitsidwa.',
  'Enter your username.': 'Lowetsani dzina lolowera.',
  'If that username exists, a code has been sent to the phone on the account.':
    'Ngati dzina lolowera lilipo, khodi yatumizidwa pa foni ya akauntiyo.',
  'Enter your username, the code you were sent, and a new password.':
    'Lowetsani dzina lolowera, khodi yomwe mwatumizidwa, ndi achinsinsi atsopano.',
  'The new password needs at least 6 characters.':
    'Achinsinsi atsopano ayenera kukhala ndi zilembo zosachepera 6.',
  'That code is wrong or has expired.': 'Khodi imeneyo ndi yolakwika kapena yatha nthawi.',
  'That code is wrong or has expired. Ask for a new one.':
    'Khodi imeneyo ndi yolakwika kapena yatha nthawi. Pemphani khodi yatsopano.',
  'Too many wrong codes. Ask for a new code.':
    'Mwalemba ma khodi olakwika ambiri. Pemphani khodi yatsopano.',
  'That code is wrong.': 'Khodi imeneyo ndi yolakwika.',
  'Password changed. You can log in now.': 'Achinsinsi asinthidwa. Mutha kulowa tsopano.',
  'Enter your current password and the new one.': 'Lowetsani achinsinsi anu apano ndi atsopano.',
  'Your current password is not correct.': 'Achinsinsi anu apano sali olondola.',
  'Password changed.': 'Achinsinsi asinthidwa.',
  'Language saved.': 'Chilankhulo chasungidwa.',
  'Signed out.': 'Mwatuluka.',
  'Logged in.': 'Mwalowa.',
  'Please log in to continue.': 'Chonde lowani kuti mupitirize.',
  'Cannot reach the server. Check that the backend is running.':
    'Sitikufika pa seva. Onetsetsani kuti intaneti yanu ikugwira ntchito.',
  'Could not open that file.': 'Sitinatsegule fayilo imeneyo.',
  'Something went wrong on the server.': 'Pali vuto pa seva.',
  'That record already exists.': 'Zomwezo zilipo kale.',
  'That record is linked to something else and cannot be changed.':
    'Zomwezo zikugwirizana ndi zina ndipo sizingasinthidwe.',
  'That account does not exist.': 'Akaunti imeneyo kulibe.',
  'That account is already deactivated.': 'Akaunti imeneyo yaimitsidwa kale.',
  'That account is already active.': 'Akaunti imeneyo ikugwira ntchito kale.',
  'That member still has an open loan. It must be settled first.':
    'Membala imeneyo ali ndi ngongole yotseguka. Iyenera kubwezedwa kaye.',
  'A change to that account is already waiting for the chairperson.':
    'Kusintha kwa akaunti imeneyo kukudikira mtsogoleri kale.',
  'That request does not exist.': 'Pempho limenelo kulibe.',
  'That request has already been decided.': 'Pempho limenelo laganizidwa kale.',
  'That request was already decided.': 'Pempho limenelo laganizidwa kale.',
  'You cannot confirm your own request.': 'Simungatsimikize pempho lanu nokha.',
  'This request is not yours to confirm.': 'Pempho limeneli si lanu kuti mulitsimikize.',
  'That is not your request.': 'Pempho limenelo si lanu.',
  'Request withdrawn.': 'Pempho lachotsedwa.',
  'Request rejected.': 'Pempho lakanidwa.',
  'Change confirmed.': 'Kusintha kwatsimikizidwa.',
  'Details saved.': 'Zambiri zasungidwa.',
  'Account unlocked.': 'Akaunti yatsegulidwa.',
  'Choose the account.': 'Sankhani akaunti.',
  'You cannot change your own role here.': 'Simungasinthe udindo wanu kuchokera pano.',
  'Choose a valid role.': 'Sankhani udindo wolondola.',
  'That account already holds this role.': 'Akauntiyi ili kale ndi udindo uwu.',
  'Give a reason for this role change.': 'Perekani chifukwa cha kusintha kwa udindo uwu.',
  'Keep the reason under 500 characters.': 'Chifukwa chizikhala chosapitirira zilembo 500.',
  'This is the only administrator. Keep at least one.': 'Uyu ndi woyang\'anira yekhayo. Khalani ndi mmodzi osachepera.',
  'This is the only active administrator. Keep at least one.': 'Uyu ndi woyang\'anira yekhayo amene akugwira ntchito. Khalani ndi mmodzi osachepera.',
  'Make this account a member before giving it the system administrator role.':
    'Pangani akauntiyi kukhala membala musanayipatse udindo wa woyang\'anira wa dongosolo.',
  'Reactivate the account before giving it a committee office.':
    'Yambitsaninso akauntiyi musanayipatse udindo wa komiti.',
  'That office is already held.': 'Udindo umenewo wagwira kale wina.',
  'That change cannot be made.': 'Kusintha kumeneko sikungachitike.',
};

const PATTERNS = [
  [
    /^Too many wrong passwords\. Try again in (\d+) minute\(s\)\.$/,
    (m) => `Mwalemba achinsinsi olakwika ambiri. Yesaninso pambuyo pa mphindi ${m[1]}.`,
  ],
  [
    /^That is (\d+) wrong passwords\. This account is locked for (\d+) minutes\.$/,
    (m) => `Awa ndi achinsinsi olakwika ${m[1]}. Akauntiyi yatsekedwa kwa mphindi ${m[2]}.`,
  ],
  [
    /^(.+) already holds that office\. Remove that person first\.$/,
    (m) => `${m[1]} akugwira kale udindo umenewo. Chotsani munthu ameneyo kaye.`,
  ],
  [/^Request failed \(\d+\)$/, () => 'Pempho lalephera. Chonde yesaninso.'],
];

export function localizeApiMessage(message, status = 0) {
  if (currentLang() !== 'ny') return message;
  if (!message) return translate('ny', 'errors.generic');

  if (CHICHEWA[message]) return CHICHEWA[message];

  for (const [pattern, build] of PATTERNS) {
    const match = message.match(pattern);
    if (match) return build(match);
  }

  if (status === 401) return translate('ny', 'errors.sessionExpired');
  if (status === 403) return translate('ny', 'errors.forbidden');
  if (status === 404) return translate('ny', 'errors.notFoundRecord');
  if (status === 409) return translate('ny', 'errors.alreadyExists');
  if (status === 423 || status === 429) return translate('ny', 'errors.locked');
  if (status >= 500) return translate('ny', 'errors.server');
  return translate('ny', 'errors.request');
}
