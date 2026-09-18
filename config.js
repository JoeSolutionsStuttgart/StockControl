// Name des Dienstes — wird überall in der Oberfläche und in den Mails verwendet.
export const SERVICE_NAME = "StockControl";

// Supabase → Project Settings → API
export const SUPABASE_URL = "https://unwndcofkyvndjbxgryp.supabase.co"; 
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVud25kY29ma3l2bmRqYnhncnlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1NjUyMTEsImV4cCI6MjEwNTE0MTIxMX0.RZZp2t9xgc9ANDs6moSLBNk87GbiW-WAMA8UmJC1OTM"; 

// Cloudflare Turnstile — Bot-Schutz für Anmeldung und Registrierung.
export const TURNSTILE_SITE_KEY = "0x4AAAAAAE7pL0qypuwGDqrT";

// Namen der Edge Functions in deinem Supabase-Projekt.
export const MAIL_FUNCTION = "send-mail";
export const UPLOAD_FUNCTION = "upload-url";
