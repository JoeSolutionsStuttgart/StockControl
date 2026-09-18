export const SERVICE_NAME = "StockControl";

export const SUPABASE_URL = "https://unwndcofkyvndjbxgryp.supabase.co"; 
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVud25kY29ma3l2bmRqYnhncnlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1NjUyMTEsImV4cCI6MjEwNTE0MTIxMX0.RZZp2t9xgc9ANDs6moSLBNk87GbiW-WAMA8UmJC1OTM"; 

export const TURNSTILE_SITE_KEY = "0x4AAAAAAE7pL0qypuwGDqrT";

export const UPLOAD_WORKER_URL = "joe-solutions-stuttgart.workers.dev";

export const FREE_TIER_GUARD = true;

export const FREE_TIER_LIMITS = {
  products: 2000,       // Artikel je Firma (Supabase Datenbankgröße)
  members: 50,          // Personen je Firma
  mailsPerDay: 250,     // Mails am Tag (Brevo Gratis: 300)
  importRows: 500,      // Zeilen je Excel-Import
  uploadMb: 10,         // Größe einer einzelnen Datei (Cloudflare R2)
  storageMb: 8000       // Speicher gesamt (R2 Gratis: 10 GB)
};
