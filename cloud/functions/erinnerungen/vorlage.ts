// Server-Programm „erinnerungen“: läuft jede Minute (Zeitplan „kfz-erinnerungen“ in der Datenbank) und schickt
// fällige Erinnerungen als Push-Mitteilung an die Geräte, auf denen man sie eingeschaltet hat.
// Die Erinnerungslogik ist dieselbe wie in der App: erinnerung.js ist unten eingebettet.
//
// Im Supabase-Dashboard: Edge Functions → neue Funktion „erinnerungen“ → diesen Text einfügen → Deploy.
// Danach in den Einstellungen der Funktion „Verify JWT“ ausschalten – der Minuten-Takt weist sich mit
// einem Geheimnis aus der Tabelle system aus.
//
// ERZEUGT mit `node cloud/bauen.mjs` aus cloud/functions/erinnerungen/vorlage.ts und erinnerung.js – dort ändern.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

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
// </kern>

Deno.serve(async (req) => {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: sys } = await db.from('system').select('schluessel,wert');
  const S = Object.fromEntries((sys || []).map(r => [r.schluessel, r.wert]));
  if (!S.cron_geheim || req.headers.get('x-cron') !== S.cron_geheim) return new Response('Nicht erlaubt', { status: 401 });

  // Push-Schlüssel beim ersten Lauf erzeugen; der private bleibt in der Tabelle system
  if (!S.vapid_public || !S.vapid_private) {
    const k = webpush.generateVAPIDKeys();
    await db.from('system').upsert([{ schluessel: 'vapid_public', wert: k.publicKey }, { schluessel: 'vapid_private', wert: k.privateKey }]);
    S.vapid_public = k.publicKey; S.vapid_private = k.privateKey;
  }
  webpush.setVapidDetails('https://gregorpeer-maker.github.io/timer/', S.vapid_public, S.vapid_private);

  const { data: abos } = await db.from('push_abos').select('endpoint,user_id,p256dh,auth');
  const personen = new Map();
  (abos || []).forEach(a => { if (!personen.has(a.user_id)) personen.set(a.user_id, []); personen.get(a.user_id).push(a); });
  const jetzt = Date.now(); let gesendet = 0;
  const bericht = [];

  for (const [uid, geraete] of personen) {
    try {
      const { data: p } = await db.from('profil').select('daten').eq('user_id', uid).maybeSingle();
      const daten = (p && p.daten) || {};
      // WebUntis-Kalender: höchstens alle 30 Minuten neu holen
      let ics = '';
      const url = String(daten.icalUrl || '').trim().replace(/^webcal:/i, 'https:');
      if (url) {
        const { data: kc } = await db.from('kalender_cache').select('ics,url,stand').eq('user_id', uid).maybeSingle();
        ics = (kc && kc.ics) || '';
        if (!kc || kc.url !== url || jetzt - Date.parse(kc.stand) > 30 * 60000) {
          try {
            const u = new URL(url);
            if (/(^|\.)webuntis\.com$/i.test(u.hostname)) {
              const r = await fetch(u, { headers: { 'User-Agent': 'KFZ-Arbeitsplatz' } });
              const t = r.ok ? await r.text() : '';
              if (t.includes('BEGIN:VCALENDAR')) { ics = t; await db.from('kalender_cache').upsert({ user_id: uid, ics, url, stand: new Date().toISOString() }); }
            }
          } catch (e) { /* alter Stand bleibt */ }
        }
      }
      for (const e of faellig(daten, ics, jetzt)) {
        const { error } = await db.from('push_gesendet').insert({ user_id: uid, id: e.id });
        if (error) continue;   // schon geschickt
        const nachricht = JSON.stringify({ titel: e.titel, text: e.text, tag: e.id, wichtig: e.art === 'aufsicht' || e.art === 'ende' });
        for (const g of geraete) {
          try {
            await webpush.sendNotification({ endpoint: g.endpoint, keys: { p256dh: g.p256dh, auth: g.auth } }, nachricht, { TTL: 300, urgency: 'high' });
            gesendet++;
          } catch (err) {
            if (err && (err.statusCode === 404 || err.statusCode === 410)) await db.from('push_abos').delete().eq('endpoint', g.endpoint);   // Gerät abgemeldet
          }
        }
        bericht.push(e.id);
      }
    } catch (e) { bericht.push('Fehler: ' + ((e && e.message) || e)); }
  }
  return Response.json({ personen: personen.size, gesendet, bericht });
});
