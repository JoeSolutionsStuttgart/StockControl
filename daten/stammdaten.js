// Stammdaten: Status, Rollen, Rechte, Seitenreihenfolge, Etikettformate.
(function () {
const STATUS = {
  ok:       { de: "Bestand ok",           en: "In stock",        sv: "Lager ok",          tag: "tag tag-neutral" },
  low:      { de: "Unter Mindestbestand", en: "Below minimum",   sv: "Under miniminivå",  tag: "tag tag-outline" },
  ordered:  { de: "Ist bestellt",         en: "Ordered",         sv: "Beställd",          tag: "tag tag-accent" },
  delivered:{ de: "Geliefert",            en: "Delivered",       sv: "Levererad",         tag: "tag tag-accent-2" }
};

// Datentypen für eigene Produktmerkmale.
const ATTR_TYPES = {
  text:   { de: "Text", en: "Text", sv: "Text" },
  number: { de: "Zahl", en: "Number", sv: "Tal" },
  bool:   { de: "Ja / Nein", en: "Yes / No", sv: "Ja / Nej" },
  date:   { de: "Datum", en: "Date", sv: "Datum" },
  email:  { de: "E-Mail", en: "Email", sv: "E-post" }
};

// Was ein Merkmal in der Bestandsverwaltung auslösen kann.
const ATTR_TRIGGERS = {
  warn:     { de: "Warnmail bei Entnahme", en: "Alert mail on withdrawal", sv: "Varningsmejl vid uttag" },
  order:    { de: "In Bestellliste aufnehmen", en: "Add to order list", sv: "Lägg i beställningslistan" },
  block:    { de: "Buchung sperren, wenn gesetzt", en: "Block booking when set", sv: "Blockera bokning när satt" },
  expiry:   { de: "Wie MHD überwachen", en: "Monitor like best-before", sv: "Bevaka som bäst-före" },
  label:    { de: "Auf Etikett drucken", en: "Print on label", sv: "Skriv ut på etikett" }
};

// Etikettformate für den Druckbogen.
// fs: Schriftgrößen in px für Text oben, Name, ID, Text unten.
const LABEL_FORMATS = {
  a4:     { cols: 1, gap: "0",     pad: "14mm",  qr: 520, fs: [30, 44, 22, 30], h: "270mm", page: true, note: "A4 · 1 Code je Blatt" },
  a5:     { cols: 1, gap: "6mm",   pad: "10mm",  qr: 330, fs: [22, 30, 16, 22], h: "132mm", note: "A5 · 2 je Blatt" },
  a6:     { cols: 2, gap: "6mm",   pad: "8mm",   qr: 230, fs: [16, 22, 13, 16], h: "132mm", note: "A6 · 4 je Blatt" },
  "2x4":  { cols: 2, gap: "8mm",   pad: "8mm",   qr: 150, fs: [12, 16, 10, 12], h: "67mm",  note: "2 × 4 · 99 × 67 mm · 8 je Blatt" },
  "3x8":  { cols: 3, gap: "4mm",   pad: "5mm",   qr: 120, fs: [11, 14, 10, 11], note: "3 × 8 · 70 × 36 mm · 24 je Blatt" },
  "4x10": { cols: 4, gap: "2.5mm", pad: "3.5mm", qr: 92,  fs: [9, 11, 8, 9],    note: "4 × 10 · 48 × 27 mm · 40 je Blatt" },
  "5x13": { cols: 5, gap: "1.5mm", pad: "2.5mm", qr: 70,  fs: [8, 9, 7, 8],     note: "5 × 13 · 38 × 21 mm · 65 je Blatt" },
  roll:   { cols: 1, gap: "3mm",   pad: "6mm",   qr: 132, fs: [11, 14, 10, 11], note: "Endlosrolle · 62 mm breit · einspaltig" }
};

const ROLES = {
  owner:   { de: "Inhabende Person", en: "Owner", sv: "Ägare" },
  manager: { de: "Lagerleitung", en: "Stock manager", sv: "Lageransvarig" },
  worker:  { de: "Mitarbeitende Person", en: "Worker", sv: "Medarbetare" },
  reader:  { de: "Lesezugriff", en: "Viewer", sv: "Läsbehörighet" },
  super:   { de: "Betrieb", en: "Operator", sv: "Drift" }
};

const PAGE_PERMS = { dashboard: "page_dashboard", products: "page_products", detail: "page_products", scan: "page_scan",
  orders: "page_orders", events: "page_events", memo: "page_memo", history: "page_history", new: "page_new", import: "page_new",
  qr: "page_qr", team: "page_team", settings: "page_settings" };
const PAGE_ORDER = ["dashboard", "products", "scan", "orders", "events", "memo", "history", "new", "qr", "team", "settings", "account", "help"];

// Rechte im Team-Bildschirm und unter „Mein Konto\" gruppiert statt als eine lange Liste.
const PERM_GROUPS = [
  { title: "Seiten", test: k => /^page_/.test(k) },
  { title: "Produkte und Buchungen", keys: ["view", "withdraw", "refill", "create", "edit", "delete", "import", "qr", "order", "undo"] },
  { title: "Einstellungen", keys: ["places", "mail"] },
  { title: "Team und Profile", keys: ["invite", "rights", "profiles", "profileEdit", "list_public"] },
  { title: "Auswertung und Dateien", keys: ["history", "who", "export", "pdf", "upload"] }
];
const permGroupOf = k => PERM_GROUPS.findIndex(g => g.test ? g.test(k) : g.keys.indexOf(k) >= 0);

const PERM_LIST = [
  ["page_dashboard", "Seite: Übersicht", ["owner","manager","worker","reader"]],
  ["page_products", "Seite: Produkte", ["owner","manager","worker","reader"]],
  ["page_scan", "Seite: Scannen", ["owner","manager","worker"]],
  ["page_orders", "Seite: Bestellungen", ["owner","manager","worker","reader"]],
  ["page_events", "Seite: Events", ["owner","manager","worker","reader"]],
  ["page_memo", "Seite: Merkzettel", ["owner","manager","worker"]],
  ["page_history", "Seite: Bestandsverlauf", ["owner","manager","reader"]],
  ["page_new", "Seite: Produktverwaltung", ["owner","manager"]],
  ["page_qr", "Seite: QR-Codes", ["owner","manager","worker"]],
  ["page_team", "Seite: Team & Rechte", ["owner","manager","worker","reader"]],
  ["page_settings", "Seite: Einstellungen", ["owner","manager","worker","reader"]],
  ["view", "Produkte ansehen", ["owner","manager","worker","reader"]],
  ["withdraw", "Entnahme buchen", ["owner","manager","worker"]],
  ["refill", "Nachfüllung buchen", ["owner","manager","worker"]],
  ["create", "Produkte anlegen", ["owner","manager"]],
  ["edit", "Produkte bearbeiten", ["owner","manager"]],
  ["delete", "Produkte löschen", ["owner"]],
  ["import", "Excel-Import", ["owner","manager"]],
  ["qr", "QR-Codes generieren", ["owner","manager","worker"]],
  ["places", "Einstellungen: Lager und Artikel", ["owner","manager"]],
  ["order", "Bestellstatus ändern", ["owner","manager"]],
  ["invite", "Team einladen", ["owner"]],
  ["rights", "Rechte ändern", ["owner"]],
  ["history", "Bewegungen und Entnahmehistorie sehen", ["owner","manager","reader"]],
  ["who", "Sehen, wer was entnommen hat", ["owner","manager"]],
  ["undo", "Bewegungen rückgängig machen", ["owner","manager"]],
  ["list_public", "Eigene Personenbestellliste für alle sichtbar", []],
  ["profiles", "Profile des Teams ansehen", ["owner","manager"]],
  ["profileEdit", "Profildaten ändern", ["owner"]],
  ["export", "Excel-Datei erstellen", ["owner","manager","reader"]],
  ["pdf", "PDF erstellen", ["owner","manager","reader"]],
  ["upload", "Dateien hochladen", ["owner","manager"]],
  ["mail", "Einstellungen: Warnungen und Mail", ["owner","manager"]]
];

(window.SC = window.SC || {}).stammdaten = { STATUS, ATTR_TYPES, ATTR_TRIGGERS, LABEL_FORMATS, ROLES, PAGE_PERMS, PAGE_ORDER, PERM_GROUPS, permGroupOf, PERM_LIST };
})();
