// Server-Programm „erinnerungen“: läuft jede Minute (Zeitplan „kfz-erinnerungen“ in der Datenbank) und schickt
// fällige Erinnerungen als Push-Mitteilung an die Geräte, auf denen man sie eingeschaltet hat.
// Die Erinnerungslogik ist dieselbe wie in der App: erinnerung.js ist unten eingebettet.
//
// Im Supabase-Dashboard: Edge Functions → neue Funktion „erinnerungen“ → diesen Text einfügen → Deploy.
// Danach in den Einstellungen der Funktion „Verify JWT“ ausschalten – der Minuten-Takt weist sich mit
// einem Geheimnis aus der Tabelle system aus. Es braucht keinen Server-Schlüssel.
//
// ERZEUGT mit `node cloud/bauen.mjs` aus cloud/functions/erinnerungen/vorlage.ts und erinnerung.js – dort ändern.

// <kern>
const ZONE = 'Europe/Rome';

// Wie viele Millisekunden die Schulzeit (Europe/Rome) der UTC-Zeit voraus ist – mit Sommer-/Winterzeit
function versatz(ms) {
  const g = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: ZONE, hourCycle: 'h23', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ms)).map(p => [p.type, p.value]));
  return Date.UTC(+g.year, +g.month - 1, +g.day, +g.hour, +g.minute, +g.second) - Math.floor(ms / 1000) * 1000;
}
// Der Server rechnet in UTC. Alles läuft deshalb in „Schulzeit als UTC“; Zeiten mit Z im Kalender werden umgerechnet.
function zuOrtszeit(ics) {
  const f = n => String(n).padStart(2, '0');
  return String(ics).replace(/^(DTSTART|DTEND)((?:;[^:\r\n]*)?):(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z(\r?)$/gm, (m, k, p, y, mo, d, h, mi, s, cr) => {
    const t = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s), w = new Date(t + versatz(t));
    return `${k}${p}:${w.getUTCFullYear()}${f(w.getUTCMonth() + 1)}${f(w.getUTCDate())}T${f(w.getUTCHours())}${f(w.getUTCMinutes())}${f(w.getUTCSeconds())}${cr}`;
  });
}
// Erinnerungslogik der App (erinnerung.js) ohne Browser
function logik() {
  const speicher = new Map();
  const localStorage = { getItem: k => (speicher.has(k) ? speicher.get(k) : null), setItem: (k, v) => speicher.set(k, String(v)), removeItem: k => speicher.delete(k) };
  const window = {}, navigator = {}, location = { protocol: 'https:', hostname: 'server', pathname: '/' };
  const document = { addEventListener() {}, getElementById() { return null; }, head: null, body: null };
  /*ERINNERUNG_JS*/
  return { E: window.Erinnerung, localStorage };
}
// Erinnerungen, die für diese Person jetzt fällig sind (letzte 2,5 Minuten)
function faellig(profil, ics, jetzt) {
  const { E, localStorage } = logik(), d = profil || {};
  localStorage.setItem(E.KEY, JSON.stringify({ bell: d.bell, plan: d.plan, aufsicht: d.aufsicht, einst: d.einst, faecher: d.faecher, ui: { icalMap: d.icalMap || {} } }));
  if (ics) { try { E.kalenderSpeichern(zuOrtszeit(ics)); } catch (e) { /* ohne Kalender weiter */ } }
  const v = versatz(jetzt);
  return E.ereignisse(jetzt + v, E.laden()).map(e => Object.assign({}, e, { echt: e.t - v }))
    .filter(e => e.echt <= jetzt && jetzt - e.echt < 150000);
}

// ---- Web Push ohne Fremdbibliothek: nur WebCrypto (RFC 8291 aes128gcm, RFC 8292 VAPID) ----
const te = new TextEncoder();
const b64e = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64d = s => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - String(s).length % 4) % 4)), c => c.charCodeAt(0));
const verbinde = (...teile) => { const out = new Uint8Array(teile.reduce((a, t) => a + t.length, 0)); let i = 0; teile.forEach(t => { out.set(t, i); i += t.length; }); return out; };
async function hkdf(salt, ikm, info, laenge) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, laenge * 8));
}
// Schlüsselpaar für VAPID: öffentlicher Schlüssel roh (65 Byte), privater als „d“ – beides base64url
async function vapidErzeugen() {
  const k = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return { publicKey: b64e(await crypto.subtle.exportKey('raw', k.publicKey)), privateKey: (await crypto.subtle.exportKey('jwk', k.privateKey)).d };
}
async function vapidKopf(endpoint, oeffentlich, privat) {
  const kopf = b64e(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const inhalt = b64e(te.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'https://gregorpeer-maker.github.io/timer/' })));
  const roh = b64d(oeffentlich);
  const key = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: b64e(roh.slice(1, 33)), y: b64e(roh.slice(33, 65)), d: privat, ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, te.encode(kopf + '.' + inhalt));
  return `vapid t=${kopf}.${inhalt}.${b64e(sig)}, k=${oeffentlich}`;
}
// Nachricht für ein Gerät verschlüsseln (aes128gcm, ein Datensatz)
async function verschluesseln(text, p256dh, authGeheim) {
  const uaPub = b64d(p256dh), auth = b64d(authGeheim);
  const eigen = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', eigen.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const geteilt = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, eigen.privateKey, 256));
  const ikm = await hkdf(auth, geteilt, verbinde(te.encode('WebPush: info\0'), uaPub, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const chiffre = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, verbinde(te.encode(text), new Uint8Array([2]))));
  return verbinde(salt, new Uint8Array([0, 0, 16, 0]), new Uint8Array([asPub.length]), asPub, chiffre);
}
async function pushSenden(geraet, text, vapid) {
  const r = await fetch(geraet.endpoint, { method: 'POST', body: await verschluesseln(text, geraet.p256dh, geraet.auth), headers: {
    'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '300', Urgency: 'high',
    Authorization: await vapidKopf(geraet.endpoint, vapid.publicKey, vapid.privateKey) } });
  if (!r.ok) { const e = new Error('Push-Dienst antwortet ' + r.status + ': ' + (await r.text()).slice(0, 200)); e.statusCode = r.status; throw e; }
}
// </kern>

// Zugang zur Datenbank nur mit dem öffentlichen Schlüssel; Geschütztes über die takt_*-Funktionen mit dem Takt-Geheimnis
const BASIS = 'https://qlisonjvnkxkmvfmvywt.supabase.co';
const OEFFENTLICH = 'sb_publishable_M1o_Czj-vp8BzBFEYKToAQ_B5bDUDNU';
async function rpc(name, args) {
  const r = await fetch(BASIS + '/rest/v1/rpc/' + name, { method: 'POST', body: JSON.stringify(args),
    headers: { apikey: OEFFENTLICH, 'Content-Type': 'application/json' } });
  const t = await r.text();
  if (!r.ok) throw new Error(name + ': ' + r.status + ' ' + t.slice(0, 300));
  return t ? JSON.parse(t) : null;
}

Deno.serve(async (req) => {
  try { return await lauf(req); }
  catch (e) { return Response.json({ fehler: String((e && e.message) || e) }, { status: 500 }); }   // steht dann in net._http_response
});

async function lauf(req) {
  const geheim = req.headers.get('x-cron') || '';
  if (!geheim) return new Response('Nicht erlaubt (kein Takt-Geheimnis)', { status: 401 });
  const d = await rpc('takt_daten', { p_geheim: geheim });   // wirft bei falschem Geheimnis

  // Push-Schlüssel beim ersten Lauf erzeugen; der private bleibt in der Datenbank
  let vapid = { publicKey: d.vapid_public, privateKey: d.vapid_private };
  if (!vapid.publicKey || !vapid.privateKey) {
    const k = await vapidErzeugen();
    await rpc('takt_schluessel', { p_geheim: geheim, p_public: k.publicKey, p_private: k.privateKey });
    vapid = k;
  }

  const jetzt = Date.now(); let gesendet = 0;
  const bericht = [];
  for (const person of d.personen || []) {
    try {
      const daten = person.daten || {};
      // WebUntis-Kalender: höchstens alle 30 Minuten neu holen
      let ics = person.ics || '';
      const url = String(daten.icalUrl || '').trim().replace(/^webcal:/i, 'https:');
      if (url && (!person.ics || person.ics_url !== url || jetzt - Date.parse(person.ics_stand) > 30 * 60000)) {
        try {
          const u = new URL(url);
          if (/(^|\.)webuntis\.com$/i.test(u.hostname)) {
            const r = await fetch(u, { headers: { 'User-Agent': 'KFZ-Arbeitsplatz' } });
            const t = r.ok ? await r.text() : '';
            if (t.includes('BEGIN:VCALENDAR')) { ics = t; await rpc('takt_kalender', { p_geheim: geheim, p_user: person.user_id, p_ics: t, p_url: url }); }
          }
        } catch (e) { /* alter Stand bleibt */ }
      }
      for (const e of faellig(daten, ics, jetzt)) {
        if (!(await rpc('takt_gesendet', { p_geheim: geheim, p_user: person.user_id, p_id: e.id }))) continue;   // schon geschickt
        const nachricht = JSON.stringify({ titel: e.titel, text: e.text, tag: e.id, wichtig: e.art === 'aufsicht' || e.art === 'ende' });
        for (const g of person.geraete || []) {
          try { await pushSenden(g, nachricht, vapid); gesendet++; }
          catch (err) {
            if (err && (err.statusCode === 404 || err.statusCode === 410)) await rpc('takt_geraet_weg', { p_geheim: geheim, p_endpoint: g.endpoint });   // Gerät abgemeldet
            else bericht.push('Push: ' + ((err && err.message) || err));
          }
        }
        bericht.push(e.id);
      }
    } catch (e) { bericht.push('Fehler: ' + ((e && e.message) || e)); }
  }
  return Response.json({ personen: (d.personen || []).length, gesendet, bericht });
}
