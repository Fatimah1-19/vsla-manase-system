// Chichewa. Kept plain and spoken rather than formal, because most
// members will be reading this on a phone at a meeting.
import extra from './ny.extra.js';
import { deepMerge } from './merge.js';

const base = {
  code: 'ny',
  name: 'Chichewa',

  app: { name: 'Banki ya M\u2019mudzi wa Manase', tagline: 'Kusunga pamodzi, kukongozana' },

  nav: {
    dashboard: 'Chiyambi', savings: 'Zosunga', loans: 'Ngongole', members: 'Mamembala',
    people: 'Anthu', meetings: 'Misonkhano', welfare: 'Thumba la chithandizo', fines: 'Zindapusa',
    shareout: 'Kugawana', requests: 'Opempha kulowa', messages: 'Mauthenga',
    activity: 'Zomwe zachitika', settings: 'Malamulo', profile: 'Akaunti yanga',
    cycles: 'Nyengo zosunga', logout: 'Tulukani', menu: 'Menyu', more: 'Zina',
    savingsManagement: 'Kusamalira zosunga', loanManagement: 'Kusamalira ngongole',
    memberManagement: 'Kusamalira mamembala', welfareManagement: 'Kusamalira thumba la chithandizo',
    analyticsReports: 'Ziwerengero & Malipoti', meetingsManagement: 'Kusamalira misonkhano',
    finesManagement: 'Kusamalira zindapusa', shareoutManagement: 'Kusamalira kugawana',
    requestsManagement: 'Kusamalira opempha kulowa',
  },

  activity: {
    subtitle: 'Amene analowa, nthawi yomwe anatuluka, ndi zomwe anachita.',
    signedIn: 'Analowa',
    signedOut: 'Anatuluka',
    noSignOut: 'Sanalembedwe kutuluka',
    actionCount: (n) => `${n} ${n === 1 ? 'chochita' : 'zochita'}`,
    noActions: 'Palibe zina zomwe anachita.',
    otherTitle: 'Zochitika zina',
    system: 'Dongosolo',
  },

  roles: { admin: 'Mtsogoleri', treasurer: 'Wosunga ndalama', secretary: 'Mlembi', member: 'Membala' },

  common: {
    save: 'Sungani', cancel: 'Lekani', close: 'Tsekani', add: 'Onjezani', edit: 'Sinthani',
    del: 'Chotsani', search: 'Fufuzani', loading: 'Tikutenga\u2026', none: 'Palibe kanthu pano',
    back: 'Bwererani', amount: 'Ndalama', date: 'Tsiku', name: 'Dzina', phone: 'Nambala ya foni',
    reason: 'Chifukwa', status: 'Mkhalidwe', total: 'Zonse', actions: 'Zochita', notes: 'Zolemba',
    yes: 'Inde', no: 'Ayi', confirm: 'Mukutsimikiza?', sending: 'Tikutumiza\u2026',
    saving: 'Tikusunga\u2026', all: 'Zonse', village: 'Mudzi', role: 'Udindo', language: 'Chilankhulo',
    optional: 'mukafuna', retry: 'Yesaninso', view: 'Onani', today: 'Lero',
  },

  login: {
    title: 'Lowani', subtitle: 'Gwiritsani ntchito dzina limene mtsogoleri anakupatsani.', backHome: 'Bwererani ku tsamba loyamba',
    username: 'Dzina lolowera', password: 'Achinsinsi', submit: 'Lowani',
    forgot: 'Ndaiwala achinsinsi anga', joinPrompt: 'Simunalowe nawo?', joinLink: 'Pemphani kulowa',
    attemptsLeft: (n) => `Mwatsala ndi mayesero ${n} akaunti isanatsekedwe.`,
  },

  forgot: {
    title: 'Sinthani achinsinsi',
    step1: 'Lembani dzina lanu lolowera. Tikutumizirani nambala pa foni yanu.',
    step2: 'Lembani nambala imene tatumiza, ndipo sankhani achinsinsi atsopano.',
    sendCode: 'Nditumizireni nambala', code: 'Nambala yochokera pa uthenga',
    newPassword: 'Achinsinsi atsopano', confirmPassword: 'Lembaninso achinsinsi atsopano',
    submit: 'Sinthani achinsinsi anga', resend: 'Tumizani nambala inanso',
    backToLogin: 'Bwererani kokalowa', mismatch: 'Achinsinsi awiriwa sakufanana.',
  },

  idle: {
    title: 'Mukadalipo?',
    body: (s) => `Sanagwire chilichonse kwa kanthawi. Mutulutsidwa pakatha masekondi ${s}.`,
    stay: 'Ndikadalipo', out: 'Tulukani tsopano',
  },

  dashboard: {
    greeting: (name) => `Moni, ${name}`,
    cycleProgress: 'Nyengo yosunga', weeksLeft: (n) => `Masiku ${n} kugawana kutsala`,
    mySavings: 'Zomwe ndasunga', myShares: 'Magawo', myLoan: 'Ngongole yanga',
    outstanding: 'Zotsala kubweza', dueBy: 'Bwezani pofika', noLoan: 'Mulibe ngongole panopa',
    unpaidFines: 'Zindapusa zosalipira', myShare: 'Gawo langa nyengo ino',
    shareReady: 'Gawo lanu lakonzeka kutenga',
    nextMeeting: 'Msonkhano wotsatira', noMeeting: 'Palibe msonkhano womwe wakonzedwa',
    totalSavings: 'Zosunga zonse', cashInBox: 'Ndalama zili m\u2019bokosi',
    loansOut: 'Ndalama zomwe zakongozedwa', interestEarned: 'Phindu la chiwongola dzanja',
    welfareBalance: 'Thumba la chithandizo', activeMembers: 'Mamembala',
    pendingLoans: 'Ngongole zodikira chigamulo', overdueLoans: 'Ngongole zachedwa',
    pendingRequests: 'Anthu odikira kulowa', attendanceRate: 'Kupezeka',
    recentSavings: 'Ndalama zolandiridwa posachedwa', recentActivity: 'Zomwe zachitika posachedwa',
    recentMeetings: 'Misonkhano yaposachedwa', smsToday: 'Mauthenga otumizidwa lero',
    lockedAccounts: 'Maakaunti otsekedwa', finesOutstanding: 'Zindapusa zosalipidwa',
  },

  savings: {
    title: 'Zosunga', record: 'Lembani zosunga', member: 'Membala', shares: 'Magawo',
    recordedBy: 'Analemba', note: 'Zolemba', thisCycle: 'Nyengo ino', cycle: 'Nyengo yosunga',
    empty: 'Palibe zosunga zolembedwa. Lembani zoyamba.',
    smsNote: 'Alandira uthenga wotsimikizira ndalamazo.',
  },

  loans: {
    title: 'Ngongole', apply: 'Pemphani ngongole', request: 'Pemphani ngongole',
    borrower: 'Wokongola', principal: 'Ndalama zokongola', interest: 'Chiwongola dzanja',
    withInterest: 'Lipirani chiwongola dzanja',
    withInterestHelp:
      'Chiwongola dzanja chimagawidwa ndi gulu. Akasankha kusalipira, amabweza zomwe anakongola zokha.',
    noInterest: 'Palibe chiwongola dzanja', purpose: 'Ndalamazi ndi zachiyani?',
    dueDate: 'Bwezani pofika', totalDue: 'Zonse zobweza', repaid: 'Zabwezedwa',
    termNote: 'Ngongole imatha miyezi itatu kapena yochepera kuyambira tsiku lomwe yavomerezedwa, koma imatha nyengo isanatse. Mutha kubweza magawo magawo kapena zonse pamodzi.',
    outstanding: 'Zotsala', approve: 'Vomerezani', reject: 'Kanizani',
    decisionNote: 'Chifukwa (wokongola adzachiwona)',
    recordRepayment: 'Lembani kubweza', repayments: 'Kubweza',
    statementFor: 'Kalata ya ngongole', remind: 'Tumizani chikumbutso chobweza',
    empty: 'Palibe ngongole.', maxAllowed: 'Zochuluka zomwe angakongole',
    overdue: 'Zachedwa', pending: 'Zikudikira', approved: 'Ikuyenda', rejected: 'Yakanidwa',
    repaidStatus: 'Yatha', defaulted: 'Sinabwezedwe',
  },

    members: {
      title: 'Mamembala', number: 'Nambala ya membala', joined: 'Analowa', savings: 'Wasunga',
      historyTitle: 'Mbiri ya mumembala',
      presentIn: (p, m) => `Adawera ${p} mwa ${m} misonkhano yaposachedwa`,
    nextOfKin: 'Wachibale', addPerson: 'Onjezani munthu', empty: 'Palibe amene waonjezedwa.',
    suspend: 'Imitsani', unlock: 'Tsegulani akaunti', newPassword: 'Patsani achinsinsi atsopano',
    tempPassword: 'Achinsinsi a kanthawi', writeItDown: 'Lembani pansi. Zikuonetsedwa kamodzi kokha.',
    active: 'Akugwira ntchito', inactive: 'Waimitsidwa', locked: 'Yatsekedwa',
  },

  meetings: {
    title: 'Misonkhano', schedule: 'Konzani msonkhano', when: 'Tsiku', time: 'Nthawi',
    place: 'Kuti', agenda: 'Zomwe zikambidwa', minutes: 'Zomwe zachitika',
    attendance: 'Kupezeka', present: 'Analipo', absent: 'Sanabwere', excused: 'Anadziwitsa',
    markAttendance: 'Lembani opezeka', markedAttendance: 'Kupezeka kwalembedwa',
    otherRecordings: 'Zolemba zina', notify: 'Uzani onse za msonkhanowu',
    empty: 'Palibe misonkhano yolembedwa.',
    presentCount: (n, t) => `${n} mwa ${t} analipo`,
  },

  welfare: {
    title: 'Thumba la chithandizo', balance: 'Ndalama zili mu thumba',
    contribute: 'Lembani zoperekedwa', help: 'Thandizani membala',
    category: 'Ndi za chiyani', sickness: 'Matenda', funeral: 'Maliro',
    emergency: 'Mwadzidzidzi', other: 'Zina',
    announce: 'Uzani gulu lonse',
    announceHelp: 'Ena onse alandira uthenga kuti akhoza kucheza kapena kubwera.',
    contribution: 'Zoperekedwa', payout: 'Thandizo loperekedwa', empty: 'Palibe zolembedwa.',
  },

  fines: {
    title: 'Zindapusa', record: 'Lembani chindapusa', paid: 'Zalipidwa', unpaid: 'Sizinalipidwe',
    markPaid: 'Lembani kuti zalipidwa', collected: 'Zolandiridwa', empty: 'Palibe zindapusa.',
  },

  shareout: {
    title: 'Kugawana', preview: 'Werengetsani magawo', calculate: 'Werengetsani',
    distribute: 'Gawani ndi kuuza onse', breakdown: 'Ndalama zachokera kuti',
    savedByMembers: 'Zosungidwa ndi mamembala', interestCollected: 'Chiwongola dzanja cholandiridwa',
    finesCollected: 'Zindapusa zolandiridwa', welfareLeft: 'Zotsala mu thumba la chithandizo',
    profitPot: 'Phindu logawana', totalFund: 'Zonse zili m\u2019bokosi',
    perMember: 'Zomwe membala aliyense alandira', share: 'Gawo lake',
    deductions: 'Kuchotsera zomwe ali nazo ngongole', profitShare: 'Phindu',
    notShared: 'sizigawidwa',
    draftSaved: 'Zasungidwa. Palibe chomwe chagawidwa panobe.',
    openLoans: (n) => `Ngongole ${n} zikadali panja. Zithetseni musanagawane.`,
    confirmDistribute: 'Izi zitumiza uthenga kwa membala aliyense. Chitani ndalama zikakonzeka.',
    empty: 'Kugawana sikunachitike.',
  },

    requests: {
      title: 'Anthu odikira kulowa', vote: 'Voti yanu', voteYes: 'Mumvomereze',
      voteNo: 'Osati nyengo ino', tally: 'Mavoti a gulu', accept: 'Lembani: gulu lavomereza',
      decline: 'Lembani: gulu lakana', whyJoin: 'Chifukwa chake akufuna kulowa',
      empty: 'Palibe amene akudikira.', decided: 'Zagamulidwa',
      groupDecides: 'Membala aliyense akhoza kuvota. Wa komiti alemba chomwe gulu lagamula.',
      background: 'Mbiri ya wopempha',
      backgroundHint: 'Awa ndi mayankho omwe wopempha anapereka mu fomu yofunsira kulowa. Werengani musanavote.',
      backgroundGroup: 'Mayankho a wopempha',
      backgroundEmpty: 'Wopempha sanayankhe mafunso awa.',
      screening: [
        { key: 'resident', good: 'yes', q: 'Kodi ndinu wokhala m\'derali?' },
        { key: 'goodCharacter', good: 'yes', q: 'Kodi muli ndi makhalidwe abwino?' },
        { key: 'trustworthy', good: 'yes', q: 'Kodi ndinu wodalirika?' },
        { key: 'honest', good: 'yes', q: 'Kodi ndinu woona mtima pa zochita zanu?' },
        { key: 'repaysLoans', good: 'yes', q: 'Kodi mumabweza ngongole pa nthawi popanda mavuto?' },
        { key: 'formerMember', good: 'yes', q: 'Ngati munali mu gulu lina, kodi munali membala wabwino kumeneko?' },
        { key: 'followsRules', good: 'yes', q: 'Kodi mukufuna kutsatira malamulo a gulu?' },
        { key: 'reliableIncome', good: 'yes', q: 'Kodi muli ndi ndalama zodalirika zosungira nthawi zonse?' },
        { key: 'noDebt', good: 'no', q: 'Kodi muli ndi ngongole ina iliyonse yosabwezedwa?' },
        { key: 'notExpelled', good: 'no', q: 'Kodi munachotsedwapo chifukwa cha chinyengo kapena kulephera kubweza ngongole?' },
      ],
      topics: {
        resident: "Wokhala m'derali",
        goodCharacter: 'Makhalidwe abwino',
        trustworthy: 'Wodalirika',
        honest: 'Woona mtima',
        repaysLoans: 'Amabweza ngongole pa nthawi',
        formerMember: 'Munali membala wabwino ku gulu lina',
        followsRules: 'Amatsatira malamulo a gulu',
        reliableIncome: 'Ndalama zodalirika',
        noDebt: 'Ngongole ina yosabwezedwa',
        notExpelled: 'Anachotsedwapo kale',
      },
    },

  messages: {
    title: 'Mauthenga', send: 'Tumizani uthenga', to: 'Tumizani kwa',
    everyone: 'Aliyense mu gulu', byRole: 'Onse a udindo umodzi',
    selected: 'Anthu osankhidwa', oneNumber: 'Nambala imodzi',
    broadcast: 'Izi zipita kwa gulu lonse', private: 'Izi zipita kwa munthu mmodzi yekha',
    message: 'Uthenga', charsLeft: (n) => `Zilembo ${n} zatsala`,
    history: 'Mauthenga otumizidwa', sent: 'Zatumizidwa', failed: 'Sizinatumizidwe',
    skipped: 'Zadumphidwa', empty: 'Palibe mauthenga otumizidwa.',
    pickPeople: 'Sankhani amene alandire',
    dryRun: 'Mayeso ali pa \u2014 mauthenga akulembedwa pa seva, osatumizidwa.',
  },

  cycles: {
    title: 'Nyengo zosunga', start: 'Yambitsani nyengo yatsopano', name: 'Dzina la nyengo',
    startDate: 'Iyamba', endDate: 'Ithera', shareValue: 'Mtengo wa gawo limodzi',
    close: 'Tsekani nyengo iyi', running: 'Ikuyenda', completed: 'Yatha',
    oneYear: 'Nyengo yosunga imakhala chaka chimodzi.',
  },

  settings: {
    title: 'Malamulo a gulu',
    loanMultiplier: 'Membala akhoza kukongola kuwirikiza zosunga zake',
    interestRate: 'Chiwongola dzanja pa ngongole (%)',
    shareInterest: 'Gawani chiwongola dzanja pa kugawana',
    shareFines: 'Gawani ndalama za zindapusa pa kugawana',
    shareWelfare: 'Gawani zotsala mu thumba la chithandizo',
    shareValue: 'Mtengo wa gawo limodzi',
    welfarePerMeeting: 'Zoperekedwa ku thumba pa msonkhano uliwonse',
    saved: 'Malamulo asungidwa.',
  },

  profile: {
    title: 'Akaunti yanga', changePassword: 'Sinthani achinsinsi anga',
    current: 'Achinsinsi apano', newPass: 'Achinsinsi atsopano', confirm: 'Lembaninso',
    languagePref: 'Chilankhulo cha pa skirini ndi cha mauthenga',
    mustChange: 'Mukugwiritsa ntchito achinsinsi a kanthawi. Chonde sankhani anu tsopano.',
  },

  home: {
    heroTitle: 'Bokosi ndi lathu tonse',
    heroBody:
      'Sabata iliyonse timaika zomwe tingathe. Wina akafuna ndalama za mbewu, sukulu kapena mankhwala, amakongola m\u2019bokosi ndi kubweza. Kumapeto kwa chaka timatsegula bokosi ndi kugawana zonse.',
    join: 'Pemphani kulowa m\u2019gulu', login: 'Lowani',
    statMembers: 'Mamembala akugwira ntchito', statLoans: 'Ngongole zoperekedwa',
    statRepaid: 'ngongole zabwezedwa', statMeetings: 'misonkhano yochitika',
    howTitle: 'Momwe VSLA imagwirira ntchito',
    step1Title: 'Timasunga sabata iliyonse',
    step1Body: "Mamembala amapereka zosungira zawo pa msonkhano wa sabata iliyonse. Komiti imalemba zopereka iliyonse ndipo kuchuluka kwa zosungira kwa membala kumasinthidwa.",
    step2Title: 'Timakongozana',
    step2Body: "Mamembala akhoza kupempha ngongole malinga ndi malamulo a gulu. Komiti imalemba ngongole, chiwongola dzanja, nthawi yobweza komanso kubweza kwake.",
    step3Title: 'Timagawana kumapeto kwa nyengo',
    step3Body: "Kumapeto kwa nyengo yosunga, ndalama zomwe membala aliyense adzalandire zimawerengedwa malinga ndi malamulo omwe gulu lagwirizana.",
    joinTitle: 'Pemphani kulowa',
    joinBody: 'Lembani apa ndipo gulu likambirana pa msonkhano wotsatira. Wina adzakutumizirani uthenga.',
    joinFeeNote: (fee) => `Membala watsopano amalipira ndalama zolembetsa za ${fee}.`,
    joinName: 'Dzina lanu lonse', joinPhone: 'Nambala yanu ya foni',
    joinVillage: 'Mudzi wanu', joinReason: 'Mukufuna kulowa chifukwa chiyani?',
    joinBackground: 'Mafunso angapo okhudza inu',
    joinBackgroundHint: 'Gulu limawerenga mayankho anu lisanavote. Chonde yankhani funso lililonse.',
    joinBackgroundRequired: 'Chonde yankhani funso lililonse musanatumize.',
    joinAnswerQuestions: 'Yankhani mafunso a mbiri',
    joinAnswerDone: 'Zatha',
    joinAnswered: (n, total) => `${n} mwa ${total} ayankhidwa`,
    joinAnsweredAll: 'Mafunso onse ayankhidwa',
    joinSubmit: 'Tumizani pempho langa',
    joinDone: 'Pempho lanu latumizidwa. Gulu likambirana pa msonkhano wotsatira.',
  },

  errors: {
    generic: 'Pali cholakwika. Chonde yesaninso.',
    offline: 'Sitikufika pa seva. Onetsetsani kuti bakendi ikuyenda.',
    sessionExpired: 'Nthawi yanu yatha. Chonde lowaninso.',
    notAllowed: 'Udindo wanu sungatsegule tsamba limenelo.',
    notAllowedBody: 'Menyu imangoonetsa masamba amene udindo wanu ungagwiritse ntchito. Ngati mukuganiza kuti muyenera kukhala ndi mwayi, lankhulani ndi mtsogoleri.',
    notFound: 'Tsamba limenelo kulibe.',
  },
}

import votes from './ny.votes.js';
import leaders from './ny.leaders.js';
export default deepMerge(deepMerge(deepMerge(base, extra), votes), leaders);
