// StockControl — Datenzugriff auf Supabase.
// Die Oberfläche ruft ausschließlich diese Funktionen auf; ist nichts
// konfiguriert, meldet configured=false und die Seite bleibt im Demo-Modus.

import { SUPABASE_URL, SUPABASE_ANON_KEY, UPLOAD_WORKER_URL } from "./config.js";

export const configured = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

let _client = null;
async function client() {
  if (!configured) throw new Error("Supabase ist nicht konfiguriert (config.js)");
  if (!_client) {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
  }
  return _client;
}

function ok(res) {
  if (res.error) throw res.error;
  return res.data;
}

/* ── Konten ─────────────────────────────────────────────── */

// Bestätigungsmail erneut anfordern. Hilft, wenn die erste im Spam landete
// oder der Link abgelaufen ist.
export async function resendConfirmation(email) {
  const sb = await client();
  return ok(await sb.auth.resend({
    type: "signup", email,
    options: { emailRedirectTo: location.origin + location.pathname }
  }));
}

// Gibt es zu dieser Adresse schon ein Konto? Antwortet die Datenbank
// (sc_email_taken aus mail.sql). Ist die Funktion nicht eingespielt,
// wird null gemeldet und die Oberfläche fragt nicht weiter nach.
export async function emailTaken(email) {
  const sb = await client();
  const { data, error } = await sb.rpc("sc_email_taken", { p_email: email });
  if (error) return null;
  return data === true;
}

export async function signUpCompany({ email, password, companyName, captchaToken }) {
  const sb = await client();
  // company_name landet in den Metadaten; der Trigger legt Firma + Profil an.
  // captchaToken kommt von Cloudflare Turnstile — Supabase prüft ihn serverseitig,
  // wenn unter Authentication → Attack Protection der Captcha-Schutz aktiv ist.
  const res = ok(await sb.auth.signUp({
    email, password,
    options: { data: { company_name: companyName }, captchaToken, emailRedirectTo: location.origin + location.pathname }
  }));
  // Supabase meldet eine bereits vergebene Adresse nicht als Fehler, sondern
  // liefert ein Konto ohne "identities" zurück. Das gilt hier als vergeben.
  if (res && res.user && Array.isArray(res.user.identities) && res.user.identities.length === 0) {
    const err = new Error("Diese E-Mail-Adresse ist bereits registriert.");
    err.code = "email_taken";
    throw err;
  }
  return res;
}

export async function signIn({ email, password, captchaToken }) {
  const sb = await client();
  const res = await sb.auth.signInWithPassword({ email, password, options: { captchaToken } });
  if (res.error) throw res.error;
  return { mfaRequired: false, data: res.data };
}

/* ── Zwei-Faktor-Anmeldung (vorbereitet, nicht aktiv) ──── */
// Der zweite Faktor ist absichtlich noch abgeschaltet: die Anmeldung
// verlangt Passwort und Captcha. Die Funktionen unten bleiben stehen,
// damit TOTP später ohne Umbau dazukommen kann — dann prüft signIn
// wieder das Assurance Level (aal1 → aal2).
export const MFA_ENABLED = false;

export async function mfaVerify({ factorId, code }) {
  const sb = await client();
  const chal = ok(await sb.auth.mfa.challenge({ factorId }));
  return ok(await sb.auth.mfa.verify({ factorId, challengeId: chal.id, code }));
}

// Legt einen neuen Faktor an und liefert QR-Code und Geheimnis zum Einrichten.
export async function mfaEnroll() {
  const sb = await client();
  const res = ok(await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "StockControl" }));
  return { factorId: res.id, qr: res.totp.qr_code, secret: res.totp.secret, uri: res.totp.uri };
}

// Bestätigt die Einrichtung mit dem ersten Code aus der App.
export async function mfaConfirm({ factorId, code }) {
  return mfaVerify({ factorId, code });
}

export async function mfaFactors() {
  const sb = await client();
  const { data } = await sb.auth.mfa.listFactors();
  return (data && data.totp) || [];
}

export async function mfaRemove(factorId) {
  const sb = await client();
  return ok(await sb.auth.mfa.unenroll({ factorId }));
}

export async function signOut() {
  const sb = await client();
  return ok(await sb.auth.signOut());
}

export async function requestPasswordReset(email, captchaToken) {
  const sb = await client();
  return ok(await sb.auth.resetPasswordForEmail(email, {
    captchaToken,
    redirectTo: location.origin + location.pathname + "#reset"
  }));
}

export async function updatePassword(password) {
  const sb = await client();
  return ok(await sb.auth.updateUser({ password }));
}

export async function session() {
  const sb = await client();
  const { data } = await sb.auth.getSession();
  return data.session || null;
}

export async function myProfile() {
  const sb = await client();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return null;
  return ok(await sb.from("profiles")
    .select("id, name, email, role, status, company_id, companies(name), permissions")
    .eq("id", auth.user.id).single());
}

/* ── Stammdaten laden ───────────────────────────────────── */

export async function loadAll() {
  const sb = await client();
  const [products, members, events, movements, settings] = await Promise.all([
    sb.from("products").select("*").order("aktiv", { ascending: false }).order("name"),
    sb.from("profiles").select("id, name, email, role, status"),
    sb.from("events").select("*, event_items(product_id, qty)").order("datum"),
    sb.from("movements").select("*").order("created_at", { ascending: false }).limit(50),
    sb.from("settings").select("*").maybeSingle()
  ]);
  return {
    products: ok(products), members: ok(members), events: ok(events),
    movements: ok(movements), settings: settings.data || null
  };
}

/* ── Produkte ───────────────────────────────────────────── */

export async function createProduct(row) {
  const sb = await client();
  return ok(await sb.from("products").insert(row).select().single());
}

export async function updateProduct(id, patch) {
  const sb = await client();
  return ok(await sb.from("products").update(patch).eq("id", id).select().single());
}

// Endgültig löschen. Bewegungen und Benachrichtigungen hängen per
// "on delete cascade" daran und verschwinden mit. Wer den Verlauf behalten
// will, setzt stattdessen aktiv = false.
export async function deleteProduct(id) {
  const sb = await client();
  const { error } = await sb.from("products").delete().eq("id", id);
  if (error) throw error;
  return true;
}

// Neue Zeilen anlegen. Bewusst ein Einfügen und kein Überschreiben:
// die Oberfläche hat doppelte Namen vorher schon aussortiert, und eine
// Zeile ohne EAN hätte beim Überschreiben kein verlässliches Merkmal.
export async function importProducts(rows) {
  const sb = await client();
  return ok(await sb.from("products").insert(rows).select());
}

/* ── Entnahme und Nachfüllung ───────────────────────────── */
// Eine Buchung schreibt nur die Bewegung; der Datenbank-Trigger rechnet
// den Bestand fort, setzt den Status und legt bei Unterschreitung die
// Benachrichtigung an. So kann keine Buchung am Protokoll vorbeigehen.

export async function bookMovement({ productId, delta, note }) {
  const sb = await client();
  return ok(await sb.from("movements").insert({ product_id: productId, delta, note }).select().single());
}

export async function movementsFor(productId) {
  const sb = await client();
  return ok(await sb.from("movements").select("*").eq("product_id", productId)
    .order("created_at", { ascending: false }));
}

/* ── Team ───────────────────────────────────────────────── */

// Die Einladung wird immer gespeichert. Scheitert der Mailversand — meist
// weil supabase/mail.sql noch nicht eingespielt ist — wird das gemeldet,
// aber die Einladung bleibt gültig und der Link lässt sich von Hand geben.
export async function inviteMember({ email, role }) {
  const sb = await client();
  const row = ok(await sb.from("invitations").insert({ email, role }).select().single());
  try {
    await sendMail({ template: "invitation", to: email, data: { token: row.token, role } });
    return row;
  } catch (err) {
    return Object.assign({}, row, { mailError: (err && err.message) || String(err) });
  }
}

export async function acceptInvitation({ token, email, password, name, captchaToken }) {
  const sb = await client();
  return ok(await sb.auth.signUp({
    email, password,
    options: { data: { name, invite_token: token }, captchaToken,
               emailRedirectTo: location.origin + location.pathname }
  }));
}

export async function updateMember(id, patch) {
  const sb = await client();
  return ok(await sb.from("profiles").update(patch).eq("id", id).select().single());
}

export async function removeMember(id) {
  const sb = await client();
  return ok(await sb.from("profiles").update({ status: "removed" }).eq("id", id));
}

export async function savePermissions(profileId, permissions) {
  const sb = await client();
  return ok(await sb.from("profiles").update({ permissions }).eq("id", profileId).select().single());
}

/* ── Betreiberzugang (nur Internet GmbH) ────────────────── */
// Sichtbar sind Firmen und Personen, keine Produktdaten — die Regeln
// auf products bleiben auf die eigene Firma beschränkt.

export async function amPlatformAdmin() {
  const sb = await client();
  const res = await sb.from("platform_admins").select("profile_id").limit(1);
  return !res.error && (res.data || []).length > 0;
}

export async function loadCompanies() {
  const sb = await client();
  return ok(await sb.from("company_overview").select("*").order("created_at"));
}

export async function setCompanyStatus(id, status) {
  const sb = await client();
  return ok(await sb.from("companies").update({ status }).eq("id", id).select().single());
}

export async function deleteCompany(id) {
  const sb = await client();
  const { error } = await sb.rpc("admin_delete_company", { cid: id });
  if (error) throw error;
}

/* ── Events ─────────────────────────────────────────────── */

export async function createEvent({ name, datum, ort, items }) {
  const sb = await client();
  const ev = ok(await sb.from("events").insert({ name, datum, ort }).select().single());
  if (items && items.length) {
    ok(await sb.from("event_items").insert(items.map(i => ({ event_id: ev.id, product_id: i.id, qty: i.qty }))));
  }
  return ev;
}

/* ── Einstellungen ──────────────────────────────────────── */

// Einstellungen gehören genau einer Firma; company_id ist der Primärschlüssel
// und wird — anders als bei Produkten — von keinem Trigger gesetzt. Deshalb
// muss er mitgeschickt werden, sonst schreibt PostgREST NULL und die Zeile
// scheitert am Schlüssel wie an der Zugriffsregel.
export async function saveSettings(patch) {
  const sb = await client();
  const me = await myProfile();
  if (!me || !me.company_id) throw new Error("Kein aktives Firmenprofil");
  return ok(await sb.from("settings")
    .upsert(Object.assign({ company_id: me.company_id }, patch), { onConflict: "company_id" })
    .select().single());
}

// Bestellungen: eigener Weg, weil die Einstellungen selbst der inhabenden
// Person vorbehalten sind, Bestellungen aber jede berechtigte Person setzt.
export async function setOrders(orders) {
  const sb = await client();
  const { error } = await sb.rpc("sc_set_orders", { p: orders || [] });
  if (error) throw error;
  return true;
}

/* ── Änderungsmelder ────────────────────────────────────── */
// Statt im Takt zu fragen: jede eigene Änderung setzt ein Fähnchen in den
// übrigen Konten der Firma. Realtime meldet es dort sofort; ist Realtime
// nicht eingeschaltet, fragt die Oberfläche selten nach — ein Feld, eine
// Zeile. Fehlen die Funktionen (schema.sql nicht erneut ausgeführt), wird
// still nichts getan, statt Fehler zu werfen.

export async function markDirty() {
  const sb = await client();
  const { error } = await sb.rpc("sc_mark_dirty");
  return !error;
}

export async function clearDirty() {
  const sb = await client();
  const { error } = await sb.rpc("sc_clear_dirty");
  return !error;
}

export async function dirtyFlag() {
  const sb = await client();
  const { data, error } = await sb.rpc("sc_dirty");
  if (error) return null;
  return !!data;
}

// Horcht auf das eigene Fähnchen. Liefert eine Funktion zum Abmelden,
// oder null, wenn Realtime nicht zustande kommt — dann greift der Rückfall.
export async function onDirty(cb) {
  try {
    const sb = await client();
    const me = await myProfile();
    if (!me || !me.id) return null;
    let live = false;
    const ch = sb.channel("sc-dirty-" + me.id)
      .on("postgres_changes",
          { event: "UPDATE", schema: "public", table: "profiles", filter: "id=eq." + me.id },
          payload => { if (payload && payload.new && payload.new.needs_refresh) cb(); })
      .subscribe(status => { if (status === "SUBSCRIBED") live = true; });
    await new Promise(r => setTimeout(r, 2500));
    if (!live) { try { sb.removeChannel(ch); } catch (e) {} return null; }
    return () => { try { sb.removeChannel(ch); } catch (e) {} };
  } catch (e) { return null; }
}

/* ── Große Dateien: Cloudflare R2 über einen Worker ─────── */
// Der Bucket ist NICHT öffentlich und hat keine ausgelagerten Schlüssel:
// der Worker hat ihn direkt gebunden. Er prüft am mitgeschickten Token,
// wer fragt und zu welcher Firma die Person gehört, legt die Datei unter
// <firma>/… ab und stellt zum Ansehen eine unterschriebene Adresse aus,
// die eine Stunde gilt. In products.bild_url steht nur der Schlüssel.

export const filesConfigured = !!UPLOAD_WORKER_URL;

async function workerCall(path, init = {}) {
  if (!UPLOAD_WORKER_URL) throw new Error("Kein Datei-Worker eingerichtet (config.js: UPLOAD_WORKER_URL)");
  const sess = await session();
  if (!sess) throw new Error("Nicht angemeldet");
  const res = await fetch(UPLOAD_WORKER_URL.replace(/\/$/, "") + path, {
    ...init,
    headers: { ...(init.headers || {}), authorization: `Bearer ${sess.access_token}` }
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || out.error) throw new Error(out.error || `Worker ${res.status}`);
  return out;
}

export async function uploadFile(file, kind = "product") {
  const q = `?filename=${encodeURIComponent(file.name)}&kind=${encodeURIComponent(kind)}`;
  const out = await workerCall("/upload" + q, {
    method: "POST", headers: { "content-type": file.type || "application/octet-stream" }, body: file
  });
  return { key: out.key };
}

export async function viewUrl(key) {
  if (!key) return null;
  if (/^https?:\/\//.test(key)) return key;   // Altbestand: bereits volle URL
  const out = await workerCall("/view", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key })
  });
  return out.url;
}

export async function setProductImage(productId, file) {
  const { key } = await uploadFile(file, "product");
  await updateProduct(productId, { bild_url: key });
  return key;
}

/* ── Mailversand über Brevo, direkt aus der Datenbank ───── */
// Kein Server, keine Edge Function: die Datenbank ruft Brevo selbst auf
// (supabase/mail.sql). Der Brevo-Schlüssel liegt in der Tabelle sc_config,
// die für angemeldete Konten technisch unlesbar ist.

export async function sendMail({ template, to, cc, data }) {
  const sb = await client();
  const { data: res, error } = await sb.rpc("sc_send_mail", {
    template, to_email: to, cc_emails: cc ? [].concat(cc) : [], data: data || {}
  });
  if (error) throw error;
  return res;
}

// Testmail an die eigene Adresse — für die Prüfseite in den Systemdiensten.
export async function sendTestMail(to) {
  return sendMail({ template: "test", to });
}

// Was ist aus den letzten Mails geworden? Liefert die Antwort von Brevo mit:
// 201 angenommen · 401 Schlüssel falsch · 400 Absender nicht verifiziert.
export async function mailStatus(n = 8) {
  const sb = await client();
  const { data, error } = await sb.rpc("sc_mail_status", { n });
  if (error) throw error;
  return data || [];
}
