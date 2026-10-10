import { PLAN_CATALOG, GUEST_LIMITS, formatBytes } from '@/src/types/plan'

/**
 * Il centro assistenza (`/aiuto`): gli articoli, come dati.
 *
 * Perché dati e non pagine: la ricerca li legge tutti, l'app desktop rimanda a uno slug preciso
 * (`/aiuto/nearby-non-vede-dispositivi` dalla guida di Nearby), e i numeri dei piani arrivano
 * dal catalogo (`PLAN_CATALOG`) invece di essere ricopiati — un limite cambiato lì cambia qui.
 *
 * ⚠️ Ogni frase descrive il prodotto com'è. Quando un comportamento cambia, l'articolo che lo
 * racconta va aggiornato nello stesso lavoro (e `updated` con lui).
 *
 * Nel testo `**così**` diventa grassetto: nient'altro, e niente HTML.
 */

export type HelpCategoryId = 'inizia' | 'ricevere' | 'account' | 'desktop' | 'nearby'

export interface HelpCategory {
  id: HelpCategoryId
  title: string
  blurb: string
}

export type HelpFigureId = 'nearby-private' | 'nearby-firewall' | 'nearby-antivirus' | 'nearby-network'

export type HelpBlock =
  | { type: 'p'; text: string }
  | { type: 'h'; text: string }
  | { type: 'steps'; items: string[] }
  | { type: 'list'; items: string[] }
  | { type: 'tip'; tone: 'info' | 'warn'; title?: string; text: string }
  | { type: 'figure'; figure: HelpFigureId; caption: string }
  | { type: 'related'; to: string; label: string }

export interface HelpArticle {
  slug: string
  category: HelpCategoryId
  title: string
  summary: string
  /** Parole che la ricerca deve trovare anche se non sono nel titolo. */
  keywords: string[]
  /** Data dell'ultima revisione del contenuto (AAAA-MM-GG). */
  updated: string
  blocks: HelpBlock[]
}

export const HELP_CATEGORIES: HelpCategory[] = [
  { id: 'inizia', title: 'Inviare', blurb: 'Link, opzioni, invio senza account' },
  { id: 'ricevere', title: 'Ricevere', blurb: 'Aprire un link, chiedere file a qualcuno' },
  { id: 'account', title: 'Account e chiavi', blurb: 'Le 24 parole, i piani, i limiti' },
  { id: 'desktop', title: 'App desktop', blurb: 'Scorciatoie, cartella Novren, impostazioni' },
  { id: 'nearby', title: 'Novren Nearby', blurb: 'File fra dispositivi vicini, senza cloud' },
]

const free = PLAN_CATALOG.free.limits
const pro = PLAN_CATALOG.pro.limits
const days = (hours: number) => `${Math.round(hours / 24)} giorni`

export const HELP_ARTICLES: HelpArticle[] = [
  // ─── Inviare ─────────────────────────────────────────────────────────────────────────────
  {
    slug: 'come-funziona-un-link',
    category: 'inizia',
    title: 'Come funziona un link Novren',
    summary: 'Perché nemmeno noi possiamo aprire i tuoi file, e cosa vuol dire per chi riceve il link.',
    keywords: ['chiave', 'cifratura', 'end-to-end', 'frammento', 'scadenza', 'password', 'download massimi', 'revoca'],
    updated: '2026-10-10',
    blocks: [
      { type: 'p', text: 'Quando mandi un file, il tuo browser (o l’app) lo **cifra prima che parta**, con una chiave nuova creata solo per lui. Sui nostri server arrivano byte illeggibili.' },
      { type: 'p', text: 'La chiave viaggia **dentro il link**, nella parte dopo il simbolo «#». Quella parte i browser non la mandano mai al server: per questo il link apre il file, e noi no.' },
      { type: 'tip', tone: 'warn', title: 'Chi ha il link, ha il file', text: 'Se inoltri il link in un gruppo, hai dato il file al gruppo. Per limitarlo ci sono la scadenza, la password, il numero massimo di download e la revoca.' },
      { type: 'h', text: 'Le opzioni di un link' },
      { type: 'list', items: [
        '**Scadenza**: dopo, il link non apre più niente. Il massimo dipende dal piano.',
        '**Password**: chi apre il link deve conoscerla. Mandala per un’altra strada (a voce, un altro messaggio).',
        '**Download massimi**: raggiunti, il link si chiude.',
        '**Revoca**: da «I miei link» lo chiudi subito, per tutti.',
      ] },
      { type: 'tip', tone: 'info', text: 'Le opzioni si scelgono **prima** di creare il link. Nell’app desktop, «Invia a → Novren» non parte più da solo: prima scegli come mandare e con quali opzioni.' },
      { type: 'h', text: 'Se perdi il link' },
      { type: 'p', text: 'Non possiamo ricostruirlo: la chiave era lì e noi non l’abbiamo mai avuta. Se hai un account, «I miei link» lo ricostruisce sul tuo dispositivo, perché le chiavi dei tuoi file sono salvate cifrate con le tue 24 parole.' },
      { type: 'related', to: '/sicurezza', label: 'Sicurezza: cosa copre la cifratura, e cosa no' },
    ],
  },
  {
    slug: 'invio-senza-account',
    category: 'inizia',
    title: 'Mandare un file senza account',
    summary: 'Cosa puoi fare senza registrarti, e quando conviene un account gratuito.',
    keywords: ['ospite', 'guest', 'senza registrazione', 'limite', 'gratis'],
    updated: '2026-10-10',
    blocks: [
      { type: 'p', text: 'Dalla pagina iniziale puoi mandare un file senza account: si cifra nel browser, ottieni il link, fine. È pensato per gli invii veloci.' },
      { type: 'list', items: [
        `Fino a **${GUEST_LIMITS.maxTransferLabel}** per invio (più file diventano un unico .zip).`,
        `Fino a **${GUEST_LIMITS.dailyLabel}** al giorno.`,
        `Il link dura al massimo **${GUEST_LIMITS.expiryDays} giorni**.`,
        'Sbagliato file? Puoi ritirare l’invio finché non chiudi la scheda: dopo non si può più, perché il permesso di ritirarlo non lo salviamo da nessuna parte.',
      ] },
      { type: 'h', text: 'Con un account gratuito' },
      { type: 'list', items: [
        `File fino a **${formatBytes(free.maxFileBytes)}** e **${formatBytes(free.maxMonthlyBytes)}** al mese.`,
        '«I miei link»: vedi, modifichi e ritiri tutti i tuoi invii.',
        'Richieste di file, invii diretti ad altri utenti, l’app desktop.',
      ] },
      { type: 'related', to: '/prezzi', label: 'Tutti i piani e i limiti' },
    ],
  },

  // ─── Ricevere ────────────────────────────────────────────────────────────────────────────
  {
    slug: 'link-non-si-apre',
    category: 'ricevere',
    title: 'Il link non si apre',
    summary: '«Link incompleto», scaduto, ritirato, già letto: cosa vuol dire ogni messaggio e cosa fare.',
    keywords: ['link incompleto', 'scaduto', 'revocato', 'limite download', 'password errata', 'segreto già letto', 'errore', 'decifrare'],
    updated: '2026-10-10',
    blocks: [
      { type: 'h', text: '«Link incompleto» o «la chiave non apre questo file»' },
      { type: 'p', text: 'Il link è arrivato tagliato. Succede con alcune app di messaggistica e con le email che spezzano le righe lunghe: la parte dopo il «#» (la chiave) si perde, e senza di lei il file non si apre — per nessuno, nemmeno per noi.' },
      { type: 'steps', items: [
        'Chiedi a chi te l’ha mandato di copiarlo di nuovo, **intero**.',
        'Se lo incolli nel terminale (`novren get`), mettilo fra virgolette: il carattere «&» spezza il comando.',
        'Controlla che dopo «#» ci sia `key=…`.',
      ] },
      { type: 'h', text: '«È scaduto»' },
      { type: 'p', text: 'Ogni link ha una scadenza decisa da chi l’ha creato. Passata quella, il file viene cancellato: serve un link nuovo.' },
      { type: 'h', text: '«Chi l’ha inviato l’ha ritirato»' },
      { type: 'p', text: 'Il mittente l’ha revocato. Solo lui può mandartene uno nuovo.' },
      { type: 'h', text: '«Questo link era a numero chiuso»' },
      { type: 'p', text: 'Ha raggiunto il numero massimo di download scelto dal mittente.' },
      { type: 'h', text: '«È stato letto, e non si riapre»' },
      { type: 'p', text: 'Era un **segreto a lettura unica**: si apre una volta sola. Se non l’hai aperto tu, avvisa chi te l’ha mandato, perché cambi quella password o quella chiave.' },
      { type: 'h', text: 'Password errata' },
      { type: 'p', text: 'La password del link la decide il mittente: chiedigliela per un’altra strada. Novren non la conosce e non può recuperarla.' },
    ],
  },
  {
    slug: 'richieste-di-file',
    category: 'ricevere',
    title: 'Chiedere file a qualcuno',
    summary: 'Una richiesta è un link che dai a chi deve mandarti dei documenti: caricano, e arriva tutto cifrato per te.',
    keywords: ['richiesta', 'raccogliere documenti', 'cliente', 'upload', 'ricevuti'],
    updated: '2026-10-10',
    blocks: [
      { type: 'p', text: 'Con una richiesta inverti il verso: invece di mandare un file, ne ricevi. Utile per raccogliere documenti da un cliente che non ha Novren.' },
      { type: 'steps', items: [
        'Dal sito (Richieste) o dall’app desktop crea una richiesta, con un titolo e una scadenza.',
        'Manda il link a chi deve caricare: gli basta un browser, niente account.',
        'I file si cifrano nel suo browser **per te**: li apri solo tu, con le tue chiavi.',
      ] },
      { type: 'tip', tone: 'info', text: 'Con l’app desktop i file delle richieste arrivano da soli nella cartella Novren\\Ricevuti, divisi per richiesta (impostazione «Scarica da solo ciò che arriva»).' },
    ],
  },

  // ─── Account e chiavi ────────────────────────────────────────────────────────────────────
  {
    slug: 'le-24-parole',
    category: 'account',
    title: 'Le 24 parole',
    summary: 'Cosa sono, quando servono, e perché nessuno può recuperarle al posto tuo.',
    keywords: ['recovery', 'chiave di recupero', 'mnemonica', 'sblocco', 'perse', 'cambiare', 'master key'],
    updated: '2026-10-10',
    blocks: [
      { type: 'p', text: 'Dalle 24 parole nasce la **chiave che protegge le chiavi dei tuoi file**. Si calcola sul tuo dispositivo: noi non le vediamo mai, e non le abbiamo salvate da nessuna parte.' },
      { type: 'h', text: 'Quando te le chiediamo' },
      { type: 'list', items: [
        'Quando entri da un browser o da un computer nuovo.',
        'Nell’app desktop, dopo l’accesso. Puoi far ricordare la chiave a quel computer (nel Gestore credenziali di Windows): poi non te le richiede per un po’.',
      ] },
      { type: 'tip', tone: 'warn', title: 'Se le perdi', text: 'Nessuno può recuperarle, nemmeno noi: è il prezzo di una cifratura che non possiamo aprire. Scrivile su carta o salvale in un gestore di password. Niente screenshot, chat o note.' },
      { type: 'h', text: 'Cambiarle' },
      { type: 'p', text: 'Dalle impostazioni (sito o app desktop) puoi generare 24 parole nuove. Le chiavi dei file si ricifrano sul tuo dispositivo e, solo quando sono tutte pronte, le parole nuove diventano le uniche valide. I file e i link già condivisi restano come sono.' },
    ],
  },
  {
    slug: 'piani-e-limiti',
    category: 'account',
    title: 'Piani, spazio e scadenze',
    summary: 'Quanto puoi mandare con Free e con Pro, quanto restano i file, cosa succede cambiando piano.',
    keywords: ['free', 'pro', 'gratis', 'abbonamento', 'spazio', 'limite', 'scadenza file', 'disdire', 'downgrade', 'upgrade'],
    updated: '2026-10-10',
    blocks: [
      { type: 'h', text: 'Free' },
      { type: 'list', items: [
        `File fino a ${formatBytes(free.maxFileBytes)}, ${formatBytes(free.maxMonthlyBytes)} al mese, ${formatBytes(free.maxStoredBytes)} di spazio.`,
        `I file restano ${PLAN_CATALOG.free.fileRetention}; i link durano al massimo ${days(free.maxExpiryHours)}.`,
      ] },
      { type: 'h', text: 'Pro' },
      { type: 'list', items: [
        `File fino a ${formatBytes(pro.maxFileBytes)}, ${formatBytes(pro.maxMonthlyBytes)} al mese, ${formatBytes(pro.maxStoredBytes)} di spazio.`,
        `I file non scadono; i link durano fino a ${days(pro.maxExpiryHours)}.`,
      ] },
      { type: 'h', text: 'Passando a Pro' },
      { type: 'p', text: 'I file caricati da Free scadrebbero dopo 7 giorni: ti proponiamo di renderli permanenti. Si spostano sul tuo dispositivo e sul server senza essere mai decifrati, e i link già condivisi continuano a funzionare.' },
      { type: 'h', text: 'Se smetti di pagare' },
      { type: 'p', text: 'Fino alla fine del periodo pagato non cambia niente. Poi hai **14 giorni** per scegliere quali file tenere, fino allo spazio del Free; gli altri vengono cancellati alla fine. Se non scegli, teniamo i più recenti. Se torni Pro prima, non si cancella niente.' },
      { type: 'related', to: '/prezzi', label: 'Prezzi e confronto dei piani' },
    ],
  },

  // ─── App desktop ─────────────────────────────────────────────────────────────────────────
  {
    slug: 'app-desktop-in-breve',
    category: 'desktop',
    title: 'L’app desktop in breve',
    summary: 'I modi più veloci per mandare un file da Windows: scorciatoia, tasto destro, cartella Novren, appunti.',
    keywords: ['windows', 'ctrl alt n', 'scorciatoia', 'invia a', 'tasto destro', 'cartella novren', 'appunti', 'screenshot', 'barra'],
    updated: '2026-10-10',
    blocks: [
      { type: 'p', text: 'Novren resta nella barra di Windows, accanto all’orologio: chiudendo la finestra non si ferma, e i trasferimenti vanno avanti.' },
      { type: 'h', text: 'Quattro modi per mandare' },
      { type: 'list', items: [
        '**Ctrl Alt N**, da qualunque programma: si apre la finestra «Condividi».',
        '**Tasto destro** su un file → Invia a → Novren (nella versione installata).',
        '**Cartella Novren** in Esplora file: un file salvato in `Condividi` diventa un link negli appunti, poi si sposta in `Condivisi`.',
        '**Appunti**: copia uno screenshot, un testo o dei file, e apri la finestra «Condividi»: te li propone.',
      ] },
      { type: 'h', text: 'Con un link o a un vicino' },
      { type: 'p', text: 'Nella finestra «Condividi» i file aspettano che tu scelga: **con un link** (scegli scadenza, password e download massimi, poi «Crea il link») o **a un vicino** con Novren Nearby, direttamente a un dispositivo, anche senza Internet.' },
      { type: 'tip', tone: 'info', title: 'La scorciatoia non funziona?', text: 'Un altro programma usa già Ctrl Alt N: lo dicono le Impostazioni, alla voce Windows. Usa l’icona nella barra (clic → «Condividi file…»).' },
      { type: 'related', to: '/aiuto/impostazioni-app-desktop', label: 'Le impostazioni dell’app, una per una' },
    ],
  },
  {
    slug: 'impostazioni-app-desktop',
    category: 'desktop',
    title: 'Le impostazioni dell’app desktop',
    summary: 'A cosa serve ogni voce delle Impostazioni, e quando conviene cambiarla.',
    keywords: ['impostazioni', 'preferenze', 'avvia con windows', 'cartella download', 'scarica da solo', 'libera spazio', 'file insieme', 'copia link', 'blocca', 'dimentica pc'],
    updated: '2026-10-10',
    blocks: [
      { type: 'h', text: 'Sicurezza' },
      { type: 'list', items: [
        '**Blocca ora**: le chiavi escono dalla memoria; per riaprire servono le 24 parole (o la chiave ricordata).',
        '**Dimentica questo PC**: toglie la chiave ricordata dal Gestore credenziali di Windows.',
        '**Cambia le 24 parole**: vedi l’articolo sulle 24 parole.',
      ] },
      { type: 'h', text: 'Link nuovi' },
      { type: 'list', items: [
        '**Scadenza predefinita**: quella proposta a ogni invio. Il server applica comunque il massimo del tuo piano.',
        '**Copia il link appena pronto**: il link finisce negli appunti da solo; con più file, tutti i link insieme.',
      ] },
      { type: 'h', text: 'Ricezione' },
      { type: 'list', items: [
        '**Salva i file in**: dove finiscono i file scaricati (di base la cartella Download).',
        '**Ti presenti come**: il nome che vede chi ha condiviso il link quando lo apri.',
        '**Scarica da solo ciò che arriva**: richieste di file e invii di altri utenti arrivano nella cartella Novren, senza fare niente.',
        '**Libera spazio dopo il download**: i file delle richieste lasciano il server appena sono sul PC e verificati. Resta solo la tua copia.',
      ] },
      { type: 'h', text: 'Cartella Novren e Windows' },
      { type: 'list', items: [
        '**Novren in Esplora file**: le cartelle `Condividi`, `Condivisi` e `Ricevuti`.',
        '**Avvia con Windows**: solo l’icona nella barra, così la scorciatoia funziona da subito.',
      ] },
      { type: 'h', text: 'Velocità' },
      { type: 'p', text: '**File trasferiti insieme**: quanti file caricare o scaricare in parallelo (ognuno usa già più connessioni). Su una linea lenta, meno è meglio.' },
    ],
  },

  // ─── Novren Nearby ───────────────────────────────────────────────────────────────────────
  {
    slug: 'nearby-cos-e',
    category: 'nearby',
    title: 'Cos’è Novren Nearby',
    summary: 'Mandare file e testi fra dispositivi vicini, direttamente: niente cloud, e in rete locale anche senza Internet.',
    keywords: ['nearby', 'vicini', 'rete locale', 'senza internet', 'airdrop', 'codice', 'dispositivi'],
    updated: '2026-10-10',
    blocks: [
      { type: 'p', text: 'Nearby trova i dispositivi con Novren **sulla tua stessa rete** (Wi-Fi o cavo) e manda i file direttamente da uno all’altro. Non passano dai nostri server, e funziona anche senza Internet e senza aver fatto l’accesso.' },
      { type: 'h', text: 'Come si manda' },
      { type: 'steps', items: [
        'Apri Novren su entrambi i dispositivi, collegati alla stessa rete.',
        'Dalla finestra «Condividi» (Ctrl Alt N) o dalla pagina Invia scegli «A un vicino», poi il dispositivo.',
        'Chi riceve vede la richiesta e la accetta. Il **codice di 4 cifre** deve essere uguale sui due schermi: così sai che stai parlando con il dispositivo giusto.',
      ] },
      { type: 'h', text: 'I tuoi dispositivi' },
      { type: 'list', items: [
        'Con l’accesso fatto e le chiavi sbloccate, Novren riconosce i tuoi dispositivi dalla chiave, non dal nome.',
        'Fra i tuoi dispositivi l’invio può essere accettato da solo (impostazione nella pagina Vicini).',
        'I tuoi dispositivi si raggiungono anche da reti diverse, via Internet: i dati passano da un server di appoggio che vede solo byte cifrati. Te lo chiediamo prima.',
      ] },
      { type: 'tip', tone: 'info', text: 'Un invio interrotto riprende da dove era quando lo rimandi. I file ricevuti finiscono nella cartella scelta nelle Impostazioni (di base Download).' },
      { type: 'related', to: '/aiuto/nearby-non-vede-dispositivi', label: 'Nearby non trova l’altro dispositivo' },
    ],
  },
  {
    slug: 'nearby-non-vede-dispositivi',
    category: 'nearby',
    title: 'Nearby non trova l’altro dispositivo',
    summary: 'Il firewall, il tipo di rete, l’antivirus, la Wi-Fi ospiti: i motivi, dal più frequente, e come risolverli.',
    keywords: ['nearby', 'non vede', 'non trova', 'firewall', 'antivirus', 'rete pubblica', 'rete privata', 'wi-fi ospiti', 'vpn', 'diagnostica', 'annunci ricevuti 0'],
    updated: '2026-10-10',
    blocks: [
      { type: 'p', text: 'Quasi sempre è Windows (o l’antivirus) che, per prudenza, non lascia che i dispositivi della rete si vedano. Segui i passi in ordine **su entrambi i dispositivi**: dopo ognuno, guarda se l’altro compare.' },
      { type: 'tip', tone: 'info', title: 'Nell’app c’è la stessa guida, con la verifica dal vivo', text: 'Pagina Vicini → Diagnostica → «Risolvi il problema». Mentre segui i passi ti dice se adesso funziona.' },

      { type: 'h', text: '1 · La rete è «pubblica» (il caso più frequente)' },
      { type: 'p', text: 'Su una rete che considera pubblica, Windows nasconde il PC agli altri dispositivi.' },
      { type: 'figure', figure: 'nearby-private', caption: 'Impostazioni → Rete e Internet → la tua rete → Tipo di profilo di rete: Privata.' },
      { type: 'steps', items: [
        'Apri **Impostazioni → Rete e Internet**.',
        'Clicca su **Wi-Fi** (o **Ethernet** se sei col cavo), poi sul nome della tua rete.',
        'In **Tipo di profilo di rete** scegli **Privata**.',
      ] },
      { type: 'tip', tone: 'warn', text: 'Fallo solo sulla rete di casa o dell’ufficio, non su una rete pubblica (bar, hotel, stazione).' },

      { type: 'h', text: '2 · Il firewall di Windows blocca Novren' },
      { type: 'p', text: 'Alla prima apertura Windows chiede se Novren può usare la rete. Se la risposta è stata «Annulla», si sistema così:' },
      { type: 'figure', figure: 'nearby-firewall', caption: 'Firewall di Windows Defender → App consentite: Novren, casella «Privata».' },
      { type: 'steps', items: [
        'Cerca nel menu Start **«Consenti un’app tramite Windows Firewall»** (nell’app Novren c’è un bottone che lo apre).',
        'Clicca **Modifica impostazioni** (serve un account amministratore).',
        'Trova **Novren** e spunta la casella **Privata**, poi **OK**.',
        'Novren non è nell’elenco? **Consenti un’altra app…** → Sfoglia → scegli Novren.exe nella cartella in cui è installato.',
      ] },

      { type: 'h', text: '3 · L’antivirus ha un firewall suo' },
      { type: 'p', text: 'Norton, Avast, AVG, Bitdefender, Kaspersky, ESET e McAfee hanno un firewall proprio, che può bloccare Novren anche quando Windows lo consente.' },
      { type: 'figure', figure: 'nearby-antivirus', caption: 'Nell’antivirus: Firewall → regole delle applicazioni → Novren consentito.' },
      { type: 'steps', items: [
        'Apri l’antivirus e cerca **Firewall** (a volte «Protezione rete»).',
        'Fra le regole delle applicazioni, **consenti Novren** (o segnalalo come attendibile).',
        'In alternativa imposta la tua rete come **Casa**, **Attendibile** o **Privata** nell’antivirus.',
        'Per capire se è lui: sospendi il suo firewall per qualche minuto. Se il dispositivo compare, riattivalo e aggiungi l’eccezione.',
      ] },

      { type: 'h', text: '4 · La rete tiene separati i dispositivi' },
      { type: 'figure', figure: 'nearby-network', caption: 'Stessa rete, stessa Wi-Fi: la rete «Ospiti» tiene isolati i dispositivi.' },
      { type: 'list', items: [
        'Tutti e due sulla **stessa** rete: non uno sulla Wi-Fi «Ospiti» e uno sulla principale.',
        'Reti di hotel, uffici e università spesso isolano i dispositivi: nessuna impostazione del PC basta. Prova l’hotspot del telefono o la rete di casa.',
        'Una **VPN** accesa può nascondere la rete locale: spegnila su entrambi.',
        'I tuoi dispositivi (stesso account) si raggiungono comunque anche da reti diverse, via Internet.',
      ] },

      { type: 'h', text: 'Leggere la diagnostica' },
      { type: 'list', items: [
        '**Annunci mandati** che crescono e **ricevuti 0** su entrambi i PC: il firewall o la rete bloccano (passi 1–4).',
        'Uno riceve e l’altro no: il blocco è sul PC che non riceve.',
        '**Non in ascolto**: un altro programma usa la stessa porta, o il sistema la blocca.',
        'Nessuna scheda di rete: il PC non è collegato.',
      ] },
      { type: 'p', text: 'Ancora niente? Scrivici dalla pagina Feedback incollando la diagnostica (Vicini → Diagnostica → «Copia diagnostica»): ci dice in un attimo dove si blocca. Non contiene file né chiavi.' },
      { type: 'related', to: '/feedback', label: 'Scrivici' },
    ],
  },
]

export function findArticle(slug: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((a) => a.slug === slug)
}

export function articlesIn(category: HelpCategoryId): HelpArticle[] {
  return HELP_ARTICLES.filter((a) => a.category === category)
}

/** Ricerca semplice, senza accenti e maiuscole: titolo, sommario, parole chiave, testo. */
export function searchArticles(query: string): HelpArticle[] {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const terms = norm(query).split(/\s+/).filter(Boolean)
  if (!terms.length) return []
  const scored = HELP_ARTICLES.map((article) => {
    const head = norm(`${article.title} ${article.summary} ${article.keywords.join(' ')}`)
    const body = norm(article.blocks.map((b) => ('text' in b ? b.text : 'items' in b ? b.items.join(' ') : 'caption' in b ? b.caption : '')).join(' '))
    let score = 0
    for (const term of terms) {
      if (head.includes(term)) score += 3
      else if (body.includes(term)) score += 1
      else return { article, score: 0 }
    }
    return { article, score }
  })
  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).map((s) => s.article)
}
