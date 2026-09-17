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

// Namen der Edge Functions in deinem Supabase-Projekt.
export const MAIL_FUNCTION = "send-mail";
export const UPLOAD_FUNCTION = "upload-url";

// Hinweis zu Cloudflare R2: Der Bucket bleibt PRIVAT — hier steht deshalb
// bewusst keine öffentliche Adresse. Bilder werden über eine kurzlebige,
// signierte Adresse geladen, die die Edge Function nur für die eigene Firma
// ausstellt. Die R2-Zugangsdaten liegen als Secrets in Supabase.
