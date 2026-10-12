// Chichewa for the Leadership page. Plain and spoken.
// A Chichewa speaker in the group should read it once and fix anything that sounds off.
const plural = (n, one, many) => (n === 1 ? one : many);

export default {
  nav: { leadership: 'Utsogoleri' },

  leaders: {
    title: 'Utsogoleri',
    subtitle: 'Pamene udindo ulibe munthu, mamembala amasankha amene adzautenge mwa voti.',
    chairSubtitle: 'Inu mumatsegula voti ndi kukwaniritsa zotsatira. Membala aliyense wogwira amavota.',
    actingNote: 'Mtsogoleri palibe. Monga msungichuma kapena mlembi mutha kutsegula ndi kukwaniritsa voti ya mpando wa mtsogoleri.',

    vacantTitle: 'Maudindo opanda munthu',
    vacantNone: 'Udindo wonse uli ndi munthu.',
    vacant: (office) => `${office} - palibe amene ali pa udindo uwu`,
    startElection: 'Yambitsani chisankho',

    openTitle: 'Zisankho zomwe zikuchitika',
    noneOpen: 'Palibe chisankho chomwe chikutseguka pakadali pano.',
    historyTitle: 'Zisankho zakale',
    none: 'Palibe chisankho chomwe chachitika.',

    office: 'Udindo',
    offices: { admin: 'mtsogoleri', treasurer: 'msungashepa', secretary: 'mlembi' },
    reason: 'Chifukwa chake udindo ulibe munthu',
    reasonPlaceholder: 'Mwachitsanzo: mlembi wayimitsidwa. Aliyense adzawerenga izi.',
    candidates: 'Amene akupikisana',
    candidatePool: 'Mamembala ogwira omwe alibe udindo',
    needTwo: 'Sankhani osachepera awiri.',
    notify: 'Uzani mamembala onse ndi uthenga',
    openNote: (days) => `Kuvota kukhalapo masiku ${days} ${plural(days, 'tsiku', 'masiku')}. Membala aliyense wogwira ali ndi voti imodzi, ndipo palibe amene amawona amene akutsogola mpaka kukatseka.`,
    openVote: 'Tsegulani chisankho',

    turnout: (n, total) => `${n} mwa ${total} anavota`,
    quorumNote: (q) => `Kufunika mavoti osachepera ${q} kuti zotsatira ziwerengedwe.`,
    closesIn: (d) => (d <= 0 ? 'Ikutseka lero' : `Ikutseka m${plural(d, 'tsiku', 'masiku')}`),
    hiddenNote: 'Mavoti onse abisika mpaka kuvota kukatha.',
    yourVote: 'Voti yanu',
    vote: 'Votani',
    voted: 'Mwatsewerapo',
    once: 'Mutha kuvota kamodzi ndipo simungasinthe pambuyo pake.',
    cannotVote: 'Simungathe kuvota pa chisankho ichi.',
    roundTwo: 'Kuvota kwachiwiri',

    status: { open: 'Kukutseguka', passed: 'Zagamulidwa', lapsed: 'Mavoti sakwanira', tie: 'Zofanana', withdrawn: 'Kwachotsedwa' },
    result: (top, turnout) => `Akutsogola ndi mavoti ${top} mwa ${turnout}.`,
    winner: (name) => `Wosankhidwa: ${name}`,
    runOff: 'Otsogola anali ofanana, ndiye kuvota kwachiwiri kukuchitika pakati pawo.',
    carryOut: 'Kwaniritsani zotsatira',
    chooseWinner: 'Sankhani amene atenge udindo',
    confirmCarry: (name, office) => `Mupange ${name} kukhala ${office} tsopano? Akaunti yawo isintha nthawi yomweyo ndipo onse adzauzidwa.`,
    inOfficeSince: 'Ali pa udindo kuyambira',
    withdraw: 'Chotsani chisankho',
    confirmWithdraw: 'Chotsani chisankho ichi? Chidzatsekedwa.',
    openedBy: (name, date) => `Idatsegulidwa ${date} ndi ${name}`,
    awaitingCarry: 'Zagamulidwa - zikudikira mtsogoleri',
    awaitingYou: 'Zagamulidwa - zikukudikirani',
    tiePick: 'Zofanana · mtsogoleri amasankha',
    empty: 'Palibe choti chiwonetsedwe.',
  },

  settings: {
    officeTitle: 'Kudzaza udindo wopanda munthu',
    officeNote: 'Izi zimatsimikiza mmene voti yodzaza udindo wa mtsogoleri, msungashepa kapena mlembi imachitika.',
    officeVotingDays: 'Masiku amene chisankho chimakhala chotseguka',
    officeQuorum: 'Gawo la mamembala liyenera kuvota kuti zotsatira ziwerengedwe (%)',
  },

  notice: {
    officeVoteWaiting: (n) => (n === 1 ? 'Chisankho 1 chikudikira voti yanu.' : `Zisankho ${n} zikudikira voti yanu.`),
    officeVacant: 'Pali udindo mu komiti wopanda munthu. Pitani ku Leadership kukakwaniritsa.',
    goLeadership: 'Pitani ku Leadership',
  },

  membership: {
    officeVacant: 'Ulibe munthu',
    fillOffice: 'Lembetsani udindo uwu',
  },
};
