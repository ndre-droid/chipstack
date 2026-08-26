import type { Lang } from './i18n';

/**
 * The big screen's own words: the rotating one-liners, the penalty spinner's
 * forfeits and the house rules.
 *
 * They used to be three English arrays inside TvMode, which meant a German table —
 * the app's main audience — read English jokes under a German clock. Everything the
 * TV says out loud lives here now, per language, and the screen picks the list that
 * matches the language it is already showing (which the phone syncs to it).
 *
 * Custom entries the user typed (`tvCustomQuips`, `tvPenalties`, `tvHouseRules`) are
 * still shown first — these are only what plays when nobody wrote anything.
 */

const QUIPS: Record<Lang, string[]> = {
  en: [
    'Blinds are going up. Finish your beer — that’s the house rule now.',
    'The cards do not know it is your birthday.',
    'Scared money makes no money. Broke money makes even less.',
    'If you can’t spot the fish in the first hour, the fish is you.',
    'A chip and a chair. And snacks. Always bring snacks.',
    'Trust everyone. Cut the cards anyway.',
    'Tight is right — until somebody shoves and proves it wrong.',
    'The river gives, the river takes, the river does not care how you feel.',
    'Slow-rolling isn’t a strategy, it’s a character flaw.',
    'Your poker face is great. Your real face folded three hands ago.',
    '“I was pot-committed” has ended more friendships than it has saved.',
    'The math says fold. Your gut says call. Your gut is 0 for 5 tonight.',
    'Nobody remembers the pots you won. Everyone remembers the one you didn’t.',
    'Big-stack energy: act like you have it, especially when you don’t.',
    'Bad-beat stories get shorter every time you tell them. Curious, that.',
    'Check-raising your best friend builds character. Yours, not theirs.',
    'The dealer button has seen things tonight it can never unsee.',
    'Somewhere at this table, someone is about to shove ace-high. Respect the chaos.',
    'You can count your chips after you fold, too.',
    'All-in is not the answer to every question. Just a surprising number of them.',
    'Whoever laughs last has the nuts. Whoever laughs first just showed you.',
    'Two beers in, everybody is suddenly in the position of their life.',
    'Bet less, talk less, win more. In that order.',
    'The table has decided you are bluffing. Democracy is brutal.',
    'Reading cards is easy. Reading people costs money.',
    'Luck is preparation meeting an opponent who can’t count outs.',
    'Your chips are only on loan from whoever wins them next.',
    'A fold is a result too.',
    'If you have to ask whether to call: no.',
    'The blinds do not care how unlucky you are being.',
    'Every table has a story. Tonight you are the cautionary part.',
    'Position is everything — which is why you are out of it.',
  ],
  de: [
    'Blinds steigen. Austrinken ist ab jetzt Hausrecht.',
    'Die Karten wissen nicht, dass du Geburtstag hast.',
    'Ängstliches Geld gewinnt nichts. Kein Geld noch weniger.',
    'Wenn du in der ersten Stunde den Fisch nicht findest — du bist der Fisch.',
    'Ein Chip und ein Stuhl. Und Snacks. Immer Snacks.',
    'Vertrau allen. Heb trotzdem ab.',
    'Tight ist right — bis einer shovt und das Gegenteil beweist.',
    'Der River gibt, der River nimmt. Deine Gefühle sind ihm egal.',
    'Slowrollen ist keine Strategie, das ist ein Charakterfehler.',
    'Dein Pokerface ist top. Dein echtes Gesicht hat vor drei Händen gefoldet.',
    '„Ich war doch eh schon drin“ hat mehr Freundschaften beendet als gerettet.',
    'Die Mathematik sagt Fold. Dein Bauch sagt Call. Dein Bauch steht heute bei 0 zu 5.',
    'Keiner erinnert sich an die Pots, die du geholt hast. Alle an den einen, den du nicht geholt hast.',
    'Big Stack heißt: so tun, als hättest du ihn. Besonders wenn nicht.',
    'Bad-Beat-Geschichten werden mit jedem Erzählen kürzer. Seltsam, oder?',
    'Den besten Freund check-raisen bildet den Charakter. Deinen.',
    'Der Dealer-Button hat heute Abend Dinge gesehen, die er nie wieder vergisst.',
    'Irgendwer hier geht gleich mit Ass-High all-in. Respektiere das Chaos.',
    'Nachzählen darfst du auch, wenn du gefoldet hast.',
    'All-in ist nicht die Antwort auf jede Frage. Nur auf erstaunlich viele.',
    'Wer zuletzt lacht, hat die Nuts. Wer zuerst lacht, hat sie gerade verraten.',
    'Zwei Bier später sitzt jeder in der Position seines Lebens.',
    'Weniger setzen, weniger reden, mehr gewinnen. In der Reihenfolge.',
    'Der Tisch hat beschlossen, dass du bluffst. Demokratie ist hart.',
    'Karten lesen ist leicht. Menschen lesen kostet Geld.',
    'Glück ist, wenn Vorbereitung auf jemanden trifft, der seine Outs nicht zählt.',
    'Deine Chips sind nur geliehen — von dem, der sie dir gleich abnimmt.',
    'Ein Fold ist auch ein Ergebnis.',
    'Wenn du fragen musst, ob du callen sollst: nein.',
    'Die Blinds interessiert es nicht, wie viel Pech du gerade hast.',
    'Jeder Tisch hat eine Geschichte. Heute bist du die Warnung darin.',
    'Position ist alles. Deshalb sitzt du auch garantiert falsch.',
  ],
};

const PENALTIES: Record<Lang, string[]> = {
  en: [
    'downs a shot',
    'buys the next round',
    'shuffles for a whole level',
    'tells a bad-beat story — the SHORT version',
    'deals the next orbit',
    'refills everyone’s snacks',
    'no phone until the next break',
    'plays the next hand with the cards face up',
    'has to compliment whoever busts them',
  ],
  de: [
    'kippt einen Kurzen',
    'gibt die nächste Runde aus',
    'mischt eine ganze Stufe lang',
    'erzählt eine Bad-Beat-Story — die KURZE Version',
    'dealt die nächste Runde',
    'füllt allen die Snacks nach',
    'kein Handy bis zur nächsten Pause',
    'spielt die nächste Hand mit offenen Karten',
    'muss den loben, der ihn rauswirft',
  ],
};

const HOUSE_RULES: Record<Lang, string[]> = {
  en: [
    'Splashing the pot = you deal the next round.',
    'Verbal is binding. Say it, you did it.',
    'Angle-shooting? Straight to the penalty spinner.',
    'Whoever has the shortest stack picks the next music.',
    'String bet = fold. No mercy.',
    'Winner of the biggest pot so far cuts the deck.',
    'Phones off the table once the cards are in the air.',
    'Show one, show all.',
  ],
  de: [
    'Pot gespritzt? Du dealst die nächste Runde.',
    'Mündlich ist bindend. Gesagt ist gemacht.',
    'Angeschossen? Direkt ans Straf-Rad.',
    'Wer den kürzesten Stack hat, wählt die nächste Musik.',
    'String Bet = Fold. Ohne Gnade.',
    'Wer bisher den größten Pot geholt hat, hebt ab.',
    'Handys vom Tisch, sobald die Karten fliegen.',
    'Zeigst du einem, zeigst du allen.',
  ],
};

const pick = (map: Record<Lang, string[]>, lang: Lang | undefined) => map[lang ?? 'en'] ?? map.en;

export const quipsFor = (lang?: Lang) => pick(QUIPS, lang);
export const penaltiesFor = (lang?: Lang) => pick(PENALTIES, lang);
export const houseRulesFor = (lang?: Lang) => pick(HOUSE_RULES, lang);
