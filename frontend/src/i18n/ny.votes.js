// Chichewa for the same text. Plain and spoken. A Chichewa speaker in the group should
// read it once and fix anything that sounds off.
export default {
  nav: { votes: 'Kuvota' },

  votes: {
    title: 'Kuvota',
    subtitle: 'Zisankho zimene gulu limapanga pamodzi. Membala aliyense ali ndi voti imodzi, ndipo kuvota ndi chinsinsi.',
    chairSubtitle: 'Inu mumatsegula kuvota. Mamembala amagamula. Inu mumakwaniritsa zotsatira.',
    openTitle: 'Kuvota komwe kukuchitika',
    finishedTitle: 'Kuvota komwe kwatha',
    none: 'Palibe kuvota panobe.',
    noneOpen: 'Palibe kuvota komwe kukuchitika tsopano.',

    titles: {
      suspend: (n) => `Kuyimitsa ${n}`,
      dismiss: (n) => `Kuchotsa ${n}`,
      reinstate: (n) => `Kubwezeretsa ${n}`,
    },
    status: {
      open: 'Kukuchitika', passed: 'Kwapambana', rejected: 'Sikunapambane', lapsed: 'Mavoti sanakwane', withdrawn: 'Kwachotsedwa',
    },
    closesIn: (d) => (d <= 0 ? 'Kutsekedwa lero' : d === 1 ? 'Kutsekedwa pakatha tsiku limodzi' : `Kutsekedwa pakatha masiku ${d}`),
    openedBy: (name, date) => `Kunatsegulidwa pa ${date} ndi ${name}`,
    reasonLabel: 'Chifukwa chomwe chaperekedwa',
    replyLabel: (name) => `Yankho la ${name}`,
    turnout: (n, total) => `Mamembala ${n} mwa ${total} avota`,
    quorumNote: (q) => `Mavoti osachepera ${q} ndiwo amafunika kuti zotsatira zivomerezeke.`,
    ruleSimple: 'Chimapambana ngati mamembala ambiri avota inde kuposa ayi.',
    ruleDismiss: (p) => `Kuchotsa kumafuna kuti osachepera ${p}% ya mavoti akhale inde.`,
    hiddenNote: 'Chiwerengero cha inde ndi ayi chimabisika mpaka kuvota kutatha.',

    yes: { suspend: 'Inde, ayimitsidwe', dismiss: 'Inde, achotsedwe', reinstate: 'Inde, abwezeretsedwe' },
    no: { suspend: 'Ayi, asayimitsidwe', dismiss: 'Ayi, asachotsedwe', reinstate: 'Ayi, asabwezeretsedwe' },
    once: 'Mutha kuvota kamodzi kokha ndipo simungasinthe pambuyo pake.',
    voted: 'Mwavota',
    thanks: 'Zikomo povota.',

    aboutYou: 'Kuvota kumeneku ndi kokhudza inu',
    aboutYouNote: 'Simungavote pa izi, koma mutha kulemba mbali yanu pansipa. Wovota aliyense adzaiwerenga.',
    replyPlaceholder: 'Lembani yankho lanu pano',
    saveReply: 'Sungani yankho langa',

    result: (yes, no) => `${yes} avota inde ndipo ${no} avota ayi.`,
    carriedOut: 'Kwakwaniritsidwa',
    waitingChair: 'Kwapambana · kudikira mtsogoleri',
    waitingYou: 'Kwapambana · kukudikirani',

    propose: 'Tsegulani kuvota',
    proposeTitle: 'Tsegulani kuvota',
    member: 'Membala',
    chooseMember: 'Sankhani membala',
    decision: 'Chigamulo',
    decisions: { suspend: 'Kuyimitsa', dismiss: 'Kuchotsa', reinstate: 'Kubwezeretsa' },
    reason: 'Chifukwa (aliyense adzachiwerenga)',
    notify: 'Dziwitsani mamembala onse ndi uthenga',
    proposeNote: (days) => `Kuvota kudzakhala kotsegula masiku ${days}. Membalayo adzauzidwa mwachinsinsi ndipo akhoza kulemba yankho lomwe ovota adzaliwerenga.`,
    openVote: 'Tsegulani kuvota',
    carryOut: 'Kwaniritsani chigamulo',
    carryNote: {
      suspend: (n) => `Kukwaniritsa izi kuyimitsa ${n}. Akhoza kulowabe ndi kuona zolemba zake, koma sangakongole kapena kuvota. Zosunga zake zili bwino.`,
      dismiss: (n) => `Kukwaniritsa izi kuthetsa umembala wa ${n}. Sakhala akulowa. Zomwe akuyenera kulandira zimawerengedwa kuti wosunga ndalama alipire.`,
      reinstate: (n) => `Kukwaniritsa izi kubwezera ${n} ngati membala wokangalika.`,
    },
    confirmCarry: 'Kwaniritsani chigamulochi tsopano?',
    withdraw: 'Chotsani pempho ili',
    confirmWithdraw: 'Chotsani pempho ili? Kuvota kudzatsekedwa.',

    settlementOwed: (amount) => `Zomwe akuyenera kubwezeredwa: ${amount}`,
    settlementStill: (amount) => `Akungongolabe ${amount} kuposa izi.`,
    markPaid: 'Lembani kuti walipidwa',
    settlementPaid: (date) => `Walipidwa pa ${date}`,
    confirmPaid: 'Lembani kuti ndalama izi zalipidwa?',
  },

  membership: {
    active: 'Wokangalika', suspended: 'Wayimitsidwa', dismissed: 'Wachotsedwa', inactive: 'Wosagwira ntchito',
    voteOpen: 'Kuvota kukuchitika', votePassed: 'Kuvota kwapambana',
    seeVote: 'Onani kuvota',
    proposeVote: 'Tsegulani kuvota',
    proposeBack: 'Pemphani kumubwezeretsa',
    proposeDismiss: 'Pemphani kumuchotsa',
    meaning: 'Tanthauzo la mkhalidwe uliwonse',
    meaningSuspended: 'amatha kulowa ndi kuona zolemba zake, koma sangakongole kapena kuvota. Zosunga zake zili bwino.',
    meaningDismissed: 'sakulowa. Wosunga ndalama amabweza zomwe akuyenera kulandira ndi kulemba kuti zalipidwa.',
    meaningVote: 'mamembala akugamula, kapena agamula koma mtsogoleri sanakwaniritse.',
    onlyVote: 'Kuvota kokha ndiko kungasinthe umembala.',
    owedBack: (amount) => `Akuyenera kubwezeredwa ${amount}`,
  },

  notice: {
    suspended: 'Umembala wanu wayimitsidwa. Simungakongole kapena kuvota. Zosunga zanu zili bwino. Chonde lankhulani ndi mtsogoleri.',
    votesWaiting: (n) => (n === 1 ? 'Kuvota kumodzi kukukudikirani.' : `Kuvota ${n} kukukudikirani.`),
    goVote: 'Pitani ku Kuvota',
    aboutYou: 'Kuvota kokhudza umembala wanu kukuchitika. Mutha kuwerenga ndi kulemba yankho lanu.',
    readIt: 'Werengani',
  },

  settings: {
    votingDays: 'Masiku omwe kuvota kumakhala kotsegula',
    quorumPercent: 'Gawo la mamembala omwe ayenera kuvota kuti zotsatira zivomerezeke (%)',
    dismissPercent: 'Gawo la mavoti a inde lofunika kuchotsa munthu (%)',
    votesGroup: 'Kuvota pa mamembala',
  },
};