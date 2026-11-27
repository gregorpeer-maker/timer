// Server-Programm „webuntis“: holt den WebUntis-Kalender (iCal) für die angemeldete Person.
// Der Browser darf das nicht direkt (WebUntis sperrt fremde Seiten), der Server schon.
// Im Supabase-Dashboard: Edge Functions → neue Funktion „webuntis“ → diesen Text einfügen → Deploy.
// Danach in den Einstellungen der Funktion „Verify JWT“ ausschalten – die Anmeldung prüft das Programm selbst.
import { createClient } from 'npm:@supabase/supabase-js@2';

const BASIS = 'https://qlisonjvnkxkmvfmvywt.supabase.co';
const OEFFENTLICH = 'sb_publishable_M1o_Czj-vp8BzBFEYKToAQ_B5bDUDNU';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const antwort = (status: number, text: string, typ = 'text/plain; charset=utf-8') =>
  new Response(text, { status, headers: { ...CORS, 'Content-Type': typ } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return antwort(405, 'Nur POST');
  try {
    // nur der öffentliche Schlüssel; gespeichert wird mit der Anmeldung der Person selbst
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const db = createClient(BASIS, OEFFENTLICH, { auth: { persistSession: false }, global: { headers: { Authorization: 'Bearer ' + jwt } } });
    const { data, error } = await db.auth.getUser(jwt);
    if (error || !data?.user) return antwort(401, 'Nicht angemeldet.');
    const { url } = await req.json();
    let u: URL;
    try { u = new URL(String(url || '').trim().replace(/^webcal:/i, 'https:')); } catch { return antwort(400, 'Der Link ist ungültig.'); }
    if (u.protocol !== 'https:' || !/(^|\.)webuntis\.com$/i.test(u.hostname)) return antwort(400, 'Nur Links von webuntis.com sind erlaubt.');
    const r = await fetch(u, { headers: { 'User-Agent': 'KFZ-Arbeitsplatz' } });
    if (!r.ok) return antwort(502, `WebUntis antwortet mit Fehler ${r.status}. Ist der Link noch gültig?`);
    const ics = await r.text();
    if (!ics.includes('BEGIN:VCALENDAR') || ics.length > 5_000_000) return antwort(502, 'Das ist kein Kalender (iCal).');
    // für die Push-Erinnerungen merken
    const { error: fehlerSpeichern } = await db.from('kalender_cache').upsert({ user_id: data.user.id, ics, url: u.toString(), stand: new Date().toISOString() });
    if (fehlerSpeichern) console.error('Kalender nicht gemerkt:', fehlerSpeichern.message);   // Abruf trotzdem ausliefern
    return antwort(200, ics, 'text/calendar; charset=utf-8');
  } catch (e) {
    return antwort(500, 'Fehler auf dem Server: ' + ((e as Error)?.message || e));
  }
});
