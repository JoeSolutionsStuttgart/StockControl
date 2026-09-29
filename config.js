// ─────────────────────────────────────────────────────────────
//  StockControl — die einzige Datei, die du anfassen musst.
//  Nach dem Ausfüllen läuft die Seite gegen dein Supabase-Projekt.
//  Solange SUPABASE_URL leer ist, läuft die Oberfläche mit Demo-Daten.
// ─────────────────────────────────────────────────────────────

// Name des Dienstes — wird überall in der Oberfläche und in den Mails verwendet.
export const SERVICE_NAME = "StockControl";

// Supabase → Project Settings → API
export const SUPABASE_URL = "";      // z. B. "https://abcdefgh.supabase.co"
export const SUPABASE_ANON_KEY = ""; // der "anon public" Key (darf öffentlich sein, RLS schützt die Daten)

// Cloudflare Turnstile — Bot-Schutz für Anmeldung und Registrierung.
// Den Site Key findest du im Cloudflare-Dashboard unter Turnstile.
// Leer lassen heißt: kein Bot-Schutz (nur für lokale Tests sinnvoll).
export const TURNSTILE_SITE_KEY = "";

// Adresse des Cloudflare Workers für Bilder und Dateien (ohne Schrägstrich
// am Ende). Steht nach dem Deploy im Cloudflare-Dashboard, z. B.
// "https://stockcontrol-files.deinname.workers.dev".
// Leer lassen heißt: keine Bild-Uploads, der Rest läuft.
export const UPLOAD_WORKER_URL = "";

// ─────────────────────────────────────────────────────────────
//  Kostenbremse
// ─────────────────────────────────────────────────────────────
// true  = die Seite hält sich an die Grenzen unten. Ist eine erreicht, wird
//         die Aktion abgelehnt und ein Hinweis angezeigt. Keine Aktion kann
//         dann über das Gratis-Kontingent hinauslaufen.
// false = keine Sperre. Alles ist erlaubt, auch wenn dadurch Kosten bei
//         Supabase, Brevo oder Cloudflare entstehen.
export const FREE_TIER_GUARD = true;

// Die Grenzen selbst. Bewusst unter den echten Gratis-Kontingenten gewählt,
// damit ein Nachzähl-Fehler nicht sofort Kosten auslöst.
// Einzelne Grenze abschalten: Wert auf 0 setzen.
export const FREE_TIER_LIMITS = {
  products: 2000,       // Artikel je Firma (Supabase Datenbankgröße)
  members: 50,          // Personen je Firma
  mailsPerDay: 250,     // Mails am Tag (Brevo Gratis: 300)
  importRows: 500,      // Zeilen je Excel-Import
  uploadMb: 10,         // Größe einer einzelnen Datei (Cloudflare R2)
  storageMb: 8000       // Speicher gesamt (R2 Gratis: 10 GB)
};

// Hinweis zu Cloudflare R2: Der Bucket bleibt PRIVAT — hier steht deshalb
// bewusst keine öffentliche Adresse. Bilder werden über eine kurzlebige,
// signierte Adresse geladen, die der Worker nur für die eigene Firma
// ausstellt. Der Bucket ist im Worker gebunden; es gibt keine R2-Schlüssel,
// die irgendwo liegen könnten.

// Mails: Brevo-Schlüssel und Absender stehen in der Datenbank (Tabelle
// sc_config, siehe supabase/mail.sql) — nie hier, nie im Browser.
