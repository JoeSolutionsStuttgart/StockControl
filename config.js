export const SERVICE_NAME = "StockControl";

// Supabase → Project Settings → API
export const SUPABASE_URL = "https://unwndcofkyvndjbxgryp.supabase.co";      // z. B. "https://abcdefgh.supabase.co"
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVud25kY29ma3l2bmRqYnhncnlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1NjUyMTEsImV4cCI6MjEwNTE0MTIxMX0.RZZp2t9xgc9ANDs6moSLBNk87GbiW-WAMA8UmJC1OTM"; // der "anon public" Key (darf öffentlich sein, RLS schützt die Daten)

// Namen der Edge Functions in deinem Supabase-Projekt.
export const MAIL_FUNCTION = "send-mail";
export const UPLOAD_FUNCTION = "upload-url";
