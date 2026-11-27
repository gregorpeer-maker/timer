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
    // Erinnerungen an Stundenende und Pausen – gemeinsam genutzt von Arbeitsplatz (index.html) und Timer (timer.html).
  // Liest Klingelzeiten, Stundenplan und Einstellungen aus localStorage['arbeitsplatz.v1'].
  // Laufen beide Seiten gleichzeitig, verhindert die Liste 'arbeitsplatz.gefeuert', dass eine Erinnerung doppelt kommt.
  (function () {
    'use strict';
    const KEY = 'arbeitsplatz.v1', FIRED = 'arbeitsplatz.gefeuert';

    const FAECHER = [
      { k: 'FT', name: 'KFZ-Fachtheorie', icon: '🚗', ende: 'Kernaussage der Stunde wiederholen, Hefteintrag kontrollieren.' },
      { k: 'ET', name: 'Elektrotechnik', icon: '⚡', ende: 'Messgeräte und Netzteile ausschalten, Versuchsaufbau abbauen.' },
      { k: 'FR', name: 'Fachrechnen', icon: '🧮', ende: 'Ergebnisse vergleichen, Hausaufgabe angeben.' },
      { k: 'PX', name: 'Praxis', icon: '🔧', ende: 'Werkstatt aufräumen, Werkzeug zählen, Arbeitsplätze kontrollieren.' },
      { k: 'MK', name: 'Methodenkompetenz', icon: '🧭', ende: 'Ergebnisse sichern, Rückmeldung einholen.' },
    ];
    // Weitere Fächer, die man selbst anlegen kann (Vorgabe: EDV)
    const EXTRA_VORGABE = [
      { k: 'EDV', name: 'EDV', icon: '💻', farbe: '#a3e635', ende: 'Dateien speichern, Rechner herunterfahren, Plätze aufräumen.' },
      { k: 'GS', name: 'Grundstufe', icon: '🌱', farbe: '#38bdf8', ende: 'Werkstatt aufräumen, Werkzeug zählen.' },
    ];
    let EXTRA = EXTRA_VORGABE.map(f => Object.assign({}, f));
    const extraOk = f => f && /^[A-Z0-9]{1,5}$/.test(f.k) && !FAECHER.some(b => b.k === f.k) && typeof f.name === 'string' && f.name.trim();
    function setExtra(list) {
      EXTRA = (Array.isArray(list) ? list : EXTRA_VORGABE).filter(extraOk).map(f => ({
        k: f.k, name: String(f.name).trim().slice(0, 40), icon: String(f.icon || '📘').slice(0, 4),
        farbe: /^#[0-9a-f]{6}$/i.test(f.farbe || '') ? f.farbe : '#94a3b8', ende: String(f.ende || '').slice(0, 120), extra: true }));
    }
    const alle = () => FAECHER.concat(EXTRA);
    // Einstellungen je Fach: teilen (mit dem Team) und anzeigen ('immer' | 'auto' = nur wenn verwendet | 'aus'),
    // klassen = Klassen, deren WebUntis-Stunden automatisch zu diesem Fach gehören (z. B. „BG-EM-b“ → Grundstufe)
    const CFG_VORGABE = {
      FT: { teilen: true, anzeigen: 'immer' }, ET: { teilen: true, anzeigen: 'immer' }, PX: { teilen: true, anzeigen: 'immer' },
      FR: { teilen: true, anzeigen: 'auto' }, MK: { teilen: true, anzeigen: 'auto' },
      EDV: { teilen: false, anzeigen: 'auto' }, GS: { teilen: false, anzeigen: 'auto', klassen: 'BG-EM-b' },
    };
    function fachCfg(s, k) {
      const eigen = s && s.faecherCfg && typeof s.faecherCfg === 'object' ? s.faecherCfg[k] : null;
      return Object.assign({ teilen: true, anzeigen: 'auto', klassen: '' }, CFG_VORGABE[k] || {}, eigen || {});
    }
    const klassenListe = t => String(t || '').split(/[,;\s]+/).map(x => x.trim().toUpperCase()).filter(Boolean);
    const fach = k => alle().find(f => f.k === k) || { k: String(k || ''), name: String(k || '–'), icon: '📘', ende: '', fremd: true };

    // Vorlage: jede Zeile gilt für die angehakten Wochentage (1 = Mo … 6 = Sa), wie ein Wecker am Handy
    const MOFR = [1, 2, 3, 4, 5];
    const DEFAULT_BELL = [
      { typ: 'stunde', nr: '1', start: '07:50', ende: '08:40' },
      { typ: 'stunde', nr: '2', start: '08:40', ende: '09:30' },
      { typ: 'stunde', nr: '3', start: '09:30', ende: '10:20' },
      { typ: 'pause', name: 'Vormittagspause', start: '10:20', ende: '10:35' },
      { typ: 'stunde', nr: '4', start: '10:35', ende: '11:25' },
      { typ: 'stunde', nr: '5', start: '11:25', ende: '12:15' },
      { typ: 'pause', name: 'Mittagspause', start: '12:15', ende: '13:15' },
      { typ: 'stunde', nr: '6', start: '13:15', ende: '14:05' },
      { typ: 'stunde', nr: '7', start: '14:05', ende: '14:55' },
      { typ: 'pause', name: 'Nachmittagspause', start: '14:55', ende: '15:05' },
      { typ: 'stunde', nr: '8', start: '15:05', ende: '15:55' },
      { typ: 'feierabend', name: 'Feierabend', start: '16:00', ende: '' },
    ].map(b => Object.assign(b, { tage: MOFR.slice() }));
    // alte Vorlage (ohne Wochentage) – wird beim Laden durch die neue ersetzt
    const ALT_BELL = '07:50-08:40|08:40-09:30|09:30-10:20|10:20-10:35|10:35-11:25|11:25-12:15|12:15-13:15|13:15-14:05|14:05-14:55|14:55-15:05|15:05-15:55';
    const TYPEN = ['stunde', 'pause', 'feierabend'];
    const DEFAULT_EINST = {
      aktiv: true,        // Erinnerungen überhaupt
      erinStunde: true,   // Schalter „Stunde bald zu Ende“ (vor Ende und beim Klingeln)
      erinPause: true,    // Schalter „Pausen“ (Beginn, kurz vor Ende, Blinken im Timer)
      vorEnde: 5,         // Minuten vor Stundenende (0 = aus)
      beiEnde: true,      // beim Klingeln
      pauseBeginn: true,
      vorPauseEnde: 2,    // Minuten vor Pausenende (0 = aus)
      aufsichtVorher: 3,  // Minuten vor der Pausenaufsicht
      nurEigene: true,    // nur an Tagen/Stunden mit eigenem Unterricht
      ton: true,
      feierabend: true,   // Erinnerung zum Feierabend
      stillAm: '',        // Datum, an dem alles stumm ist (z. B. Ausflug)
    };

    const pad = n => String(n).padStart(2, '0');
    const hm = s => { const m = /^(\d{1,2}):(\d\d)$/.exec(s || ''); return m ? +m[1] * 60 + +m[2] : null; };
    const datum = d => { d = new Date(d); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
    const at = (d, s) => { const x = new Date(d); x.setHours(0, hm(s), 0, 0); return x.getTime(); };
    const uhr = t => { const d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
    const norm = s => String(s || '').trim().toUpperCase();

    const vorlage = () => DEFAULT_BELL.map(b => Object.assign({}, b, { tage: b.tage.slice() }));
    const gilt = (b, wt) => !Array.isArray(b.tage) || b.tage.includes(wt);   // ohne Wochentage: jeden Tag (ältere Daten)

    function laden() {
      let s = null;
      try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
      s = s && typeof s === 'object' ? s : {};
      setExtra(s.faecher);
      let bell = Array.isArray(s.bell) ? s.bell.filter(b => b && TYPEN.includes(b.typ)) : [];
      if (bell.every(b => !Array.isArray(b.tage)) && bell.map(b => b.start + '-' + b.ende).join('|') === ALT_BELL) bell = [];
      return Object.assign({}, s, {
        bell: bell.length ? bell : vorlage(),
        plan: Array.isArray(s.plan) ? s.plan.filter(e => e && typeof e === 'object') : [],
        aufsicht: Array.isArray(s.aufsicht) ? s.aufsicht.filter(a => typeof a === 'string') : [],
        einst: Object.assign({}, DEFAULT_EINST, s.einst || {}),
      });
    }

    // Alle Zeitfenster eines Tages, mit eigenem Unterricht und Pausenaufsicht
    function tag(d, s) {
      s = s || laden();
      const wt = new Date(d).getDay();
      const rows = s.bell
        .filter(b => gilt(b, wt) && hm(b.start) != null && (b.typ === 'feierabend' || (hm(b.ende) != null && hm(b.ende) > hm(b.start))))
        .map(b => Object.assign({}, b, {
          von: b.start, bis: b.typ === 'feierabend' ? b.start : b.ende, start: at(d, b.start), ende: at(d, b.typ === 'feierabend' ? b.start : b.ende),
          eintrag: null, aufsicht: b.typ === 'pause' && s.aufsicht.includes(wt + '|' + b.start),
        }));
      const k = kal(), key = datum(d);
      let all;
      if (k && k.von && key >= k.von && key <= k.bis) {
        // Tag aus dem WebUntis-Kalender: echte Stunden mit Vertretungen und Entfällen, dazu Pausen und Feierabend der Klingel
        const evs = k.ev.filter(e => datum(e.s) === key).sort((a, b) => a.s - b.s);
        const st = evs.map(e => {
          const z = zuordnung(e, s), b = rows.find(r => r.typ === 'stunde' && r.start < e.e && r.ende > e.s);
          const nr = b ? String(b.nr) : '';
          if (z.fach === AUFSICHT) return { typ: 'pause', name: 'Pausenaufsicht', von: uhr(e.s), bis: uhr(e.e), start: e.s, ende: e.e, kal: true,
            titel: e.sum, key: icsKey(e), info: e.besch, aufsicht: !e.aus, entfall: !!e.aus, eintrag: null };
          return { typ: 'stunde', nr, von: uhr(e.s), bis: uhr(e.e), start: e.s, ende: e.e, kal: true, titel: e.sum, key: icsKey(e), entfall: !!e.aus,
            info: e.besch, eintrag: !e.aus && z.fach ? { tag: wt, nr, fach: z.fach === VERTRETUNG ? '' : z.fach, vertretung: z.fach === VERTRETUNG,
              titel: fachText(e), klasse: z.klasse, raum: e.ort } : null };
        });
        // Feierabend frühestens nach der letzten eigenen Stunde
        const letzte = Math.max(0, ...st.filter(x => x.eintrag).map(x => x.ende));
        rows.forEach(r => { if (r.typ === 'feierabend' && letzte > r.start) Object.assign(r, { start: letzte, ende: letzte, von: uhr(letzte), bis: uhr(letzte) }); });
        all = st.concat(rows.filter(r => r.typ === 'feierabend' || !evs.some(e => (!e.aus || r.typ === 'stunde') && r.start < e.e && r.ende > e.s)));
      } else {
        rows.forEach(r => { if (r.typ === 'stunde') r.eintrag = s.plan.find(e => +e.tag === wt && String(e.nr) === String(r.nr) && e.fach) || null; });
        all = rows;
      }
      return all.sort((a, b) => a.start - b.start || (a.typ === 'feierabend') - (b.typ === 'feierabend') || (a.entfall ? 1 : 0) - (b.entfall ? 1 : 0))
        .map((x, i) => Object.assign(x, { i }));
    }

    // ---------- WebUntis-Kalender (iCal) ----------
    const KAL = 'arbeitsplatz.kalender';
    let kalRaw = null, kalObj = null;
    function kal() {
      let r = null; try { r = localStorage.getItem(KAL); } catch (e) {}
      if (r !== kalRaw) { kalRaw = r; try { kalObj = JSON.parse(r || 'null'); } catch (e) { kalObj = null; } if (!kalObj || !Array.isArray(kalObj.ev)) kalObj = kalObj && kalObj.fehler ? Object.assign(kalObj, { ev: [] }) : null; }
      return kalObj;
    }
    function icsZeit(v) {
      const m = /^(\d{4})(\d\d)(\d\d)(?:T(\d\d)(\d\d)(\d\d)?(Z)?)?$/.exec(String(v || '').trim());
      if (!m || !m[4]) return null;   // ganztägige Einträge (Ferien) zählen nicht als Stunde
      return m[7] ? Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5]) : new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5]).getTime();
    }
    function icsLesen(txt) {
      const lines = String(txt).replace(/\r?\n[ \t]/g, '').split(/\r?\n/), ev = [];
      let cur = null;
      for (const l of lines) {
        if (l === 'BEGIN:VEVENT') cur = {};
        else if (l === 'END:VEVENT') { if (cur) ev.push(cur); cur = null; }
        else if (cur) { const m = /^([A-Z-]+)(?:;[^:]*)?:(.*)$/.exec(l); if (m && !(m[1] in cur)) cur[m[1]] = m[2].replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim(); }
      }
      return ev.map(e => ({ s: icsZeit(e.DTSTART), e: icsZeit(e.DTEND), sum: (e.SUMMARY || '').slice(0, 120), ort: (e.LOCATION || '').slice(0, 60),
        besch: (e.DESCRIPTION || '').slice(0, 160), aus: /CANCEL/i.test(e.STATUS || '') }))
        .filter(e => e.s && e.e && e.e > e.s && e.e - e.s < 6 * 3600e3);
    }
    const icsKey = e => e.sum + '|' + e.besch;
    // Sonderwerte der Zuordnung: Vertretung (Stunde mit Erinnerung, aber nicht eigenes Fach) und Pausenaufsicht
    const VERTRETUNG = '*', AUFSICHT = '!';
    const fachText = e => ohneKlasse(e.sum + ' ' + e.besch).trim() || e.sum;
    // Fach aus dem WebUntis-Text raten. Reihenfolge zählt: „P-KFZ“ ist Praxis, nicht Fachtheorie; die Klasse „KFZ-3“ zählt nicht als Fach.
    const ohneKlasse = t => String(t).split(/[\s,;/|()]+/).filter(x => x && !istKlasse(x)).join(' ');
    function fachRaten(t) {
      const u = ' ' + ohneKlasse(t).toUpperCase() + ' ', w = k => new RegExp('(^|[^A-Z0-9])' + k + '([^A-Z0-9]|$)').test(u);
      if (/(^|[^A-Z])P-[A-Z]|PRAXIS|PRAKT|WERKST/.test(u) || w('PX') || w('WS')) return 'PX';
      for (const f of EXTRA) if (w(f.k) || u.includes(f.name.toUpperCase())) return f.k;
      if (w('FR') || /RECHN|MATHE/.test(u)) return 'FR';
      if (w('MK') || /METHOD/.test(u)) return 'MK';
      if (w('ET') || w('EL') || /(^|[^A-Z])(ET|EL)-|ELEKTR/.test(u)) return 'ET';
      if (w('FT') || /(^|[^A-Z])FT-|FACHTHEO|TECHNOLOG|KFZ/.test(u)) return 'FT';
      return '';
    }
    // Klassen enden bei euch auf Zahl oder Kleinbuchstaben (KFZ-3, BG-EM-b), Fachkürzel nicht (FT-KFZ, EL-KFZ)
    const istKlasse = x => /^\d{1,2}[A-Za-z]{1,3}$/.test(x) || /^[A-Z]{2,}(?:-[A-Za-z0-9]+)*-(?:\d+[A-Za-z]?|[a-z]+)$/.test(x);
    const klasseRaten = t => String(t).split(/[\s,;/|()]+/).find(istKlasse) || '';
    // Zuordnung WebUntis-Eintrag -> Fach/Klasse: gespeicherte Wahl, sonst Vorschlag
    function zuordnung(e, s) {
      const m = s && s.ui && s.ui.icalMap && s.ui.icalMap[icsKey(e)];
      if (m) return { fach: m.fach || '', klasse: m.klasse || '', fest: true };
      const t = e.sum + ' ' + e.besch;
      // Ohne Titel und kurz (oder mit „Aufsicht“): so exportiert WebUntis die Pausenaufsicht
      if (/AUFSICHT/i.test(t) || (!t.trim() && e.e - e.s <= 30 * 6e4)) return { fach: AUFSICHT, klasse: '', fest: false };
      const k = klasseRaten(t);
      // Klasse fest einem Fach zugeordnet (Einstellung „Klassen“ beim Fach)?
      if (k && s) { const z = alle().find(x => klassenListe(fachCfg(s, x.k).klassen).includes(k.toUpperCase())); if (z) return { fach: z.k, klasse: k, fest: false }; }
      const f = fachRaten(t);
      // Stunde mit Klasse, aber nicht eigenes Fach (z. B. GK als Vertretung): trotzdem erinnern
      return { fach: f || (k ? VERTRETUNG : ''), klasse: k, fest: false };
    }
    function kalenderSpeichern(txt) {
      const alle = icsLesen(txt);
      if (!alle.length) throw new Error('Im Kalender sind keine Stunden mit Uhrzeit.');
      const heute0 = new Date(); heute0.setHours(0, 0, 0, 0);
      const ab = heute0.getTime() - 7 * 864e5, bis = heute0.getTime() + 35 * 864e5;
      const ev = alle.filter(e => e.s >= ab && e.s < bis).sort((a, b) => a.s - b.s);
      const k = { stand: Date.now(), ev, von: ev.length ? datum(ev[0].s) : '', bis: ev.length ? datum(ev[ev.length - 1].s) : '', gesamt: alle.length };
      localStorage.setItem(KAL, JSON.stringify(k));
      return k;
    }
    function kalenderEntfernen() { try { localStorage.removeItem(KAL); } catch (e) {} }
    let syncLauf = false;
    async function kalenderSync(force) {
      const s = laden(), url = String((s.ui && s.ui.icalUrl) || '').trim().replace(/^webcal:/i, 'https:');
      if (!/^https:\/\/\S+$/i.test(url) || syncLauf) return null;
      const k = kal();
      if (!force && k && Date.now() - Math.max(k.stand || 0, k.fehlerAm || 0) < 25 * 6e4) return null;
      syncLauf = true;
      try {
        let txt;
        if (window.desk && window.desk.ical) txt = await window.desk.ical(url);
        else if (window.Cloud && window.Cloud.konto && window.Cloud.konto()) txt = await window.Cloud.webuntis(url);   // über den eigenen Server
        else {
          let r;
          try { r = await fetch(url, { cache: 'no-store' }); } catch (e) { throw new Error('BROWSER'); }
          if (!r.ok) throw new Error('WebUntis antwortet mit Fehler ' + r.status + '. Ist der Link noch gültig?');
          txt = await r.text();
        }
        return kalenderSpeichern(txt);
      } catch (e) {
        const msg = String(e && e.message || e).replace(/^Error invoking remote method 'ical': (Error: )?/, '');
        try { const k2 = Object.assign({ ev: [], von: '', bis: '' }, kal() || {}, { fehler: msg, fehlerAm: Date.now() }); localStorage.setItem(KAL, JSON.stringify(k2)); } catch (x) {}
        throw new Error(msg);
      } finally { syncLauf = false; }
    }

    const gleich = (a, b) => a && b && a.fach === b.fach && norm(a.klasse) === norm(b.klasse);
    const label = e => e ? (e.vertretung ? `Vertretung ${e.titel || ''}`.trim() : fach(e.fach).name) + ` · ${e.klasse || '–'}` + (e.raum ? ` · Raum ${e.raum}` : '') : '';

    // Ende des zusammenhängenden Blocks (Doppelstunde) ab Zeitfenster k
    function blockEnde(sl, k) {
      let j = k;
      while (sl[j + 1] && sl[j + 1].typ === 'stunde' && gleich(sl[j + 1].eintrag, sl[k].eintrag) && sl[j + 1].start - sl[j].ende < 6e5) j++;
      return sl[j];
    }

    function ereignisse(d, s) {
      s = s || laden();
      const E = s.einst, key = datum(d), wt = new Date(d).getDay(), out = [];
      if (!E.aktiv || E.stillAm === key) return out;
      const sl = tag(d, s);
      const eigene = sl.some(x => x.eintrag), aufs = sl.some(x => x.aufsicht);
      if (!eigene && !aufs && (E.nurEigene || wt === 0 || wt === 6)) return out;
      const rel = x => x && x.typ === 'stunde' && !x.entfall && (x.eintrag || !E.nurEigene);
      const relIdx = sl.map((x, k) => rel(x) ? k : -1).filter(k => k >= 0);
      const erste = relIdx[0], letzte = relIdx[relIdx.length - 1];
      const add = (art, x, t, titel, text) => out.push({ id: `${key}|${art}|${x.von}`, art, t, titel, text });

      sl.forEach((x, k) => {
        const nx = sl[k + 1];
        if (rel(x)) {
          // Doppelstunde: keine Erinnerung mitten im Block
          if (nx && nx.typ === 'stunde' && x.eintrag && gleich(nx.eintrag, x.eintrag) && nx.start - x.ende < 6e5) return;
          const f = x.eintrag ? fach(x.eintrag.fach) : null;
          if (E.erinStunde === false) return;
          if (E.vorEnde > 0) add('vorende', x, x.ende - E.vorEnde * 6e4, `Noch ${E.vorEnde} Minuten`,
            (x.eintrag ? label(x.eintrag) + ' – ' : '') + `Klingel um ${x.bis}. ` + (f && f.ende ? f.ende : 'Zeit zum Abschließen.'));
          if (E.beiEnde) {
            let text;
            if (nx && nx.typ === 'pause' && nx.start >= x.ende && nx.start - x.ende < 6e5) text = `${nx.name || 'Pause'} bis ${nx.bis}.` + (nx.aufsicht ? ' Du hast Pausenaufsicht!' : '');
            else if (nx && rel(nx) && nx.eintrag && nx.start >= x.ende && nx.start - x.ende < 6e5) text = 'Als Nächstes: ' + label(nx.eintrag) + '.';
            else if (k >= letzte) text = 'Dein Unterricht für heute ist zu Ende.';
            else {
              const n2 = sl.slice(k + 1).find(rel);
              text = n2 && n2.eintrag ? `Freistunde. Nächste Stunde um ${n2.von}: ${label(n2.eintrag)}.` : 'Stundenwechsel.';
            }
            add('ende', x, x.ende, 'Stunde zu Ende', text);
          }
        } else if (x.typ === 'feierabend') {
          if (E.feierabend) add('feierabend', x, x.start, x.name && x.name !== 'Feierabend' ? x.name : 'Feierabend 🎉',
            'Schönen Feierabend! Schau kurz auf die To-dos für morgen.');
        } else if (x.typ === 'pause') {
          const drin = erste != null && k > erste && k < letzte;
          const vorher = sl[k - 1], nachher = sl[k + 1];
          if (x.aufsicht && E.aufsichtVorher >= 0) add('aufsicht', x, x.start - E.aufsichtVorher * 6e4, 'Pausenaufsicht',
            `${x.name || 'Pause'} ${x.von}–${x.bis}: Du hast Aufsicht.`);
          if (!drin && !x.aufsicht) return;
          if (E.erinPause === false) return;
          if (E.pauseBeginn && !x.aufsicht && !(rel(vorher) && E.beiEnde && E.erinStunde !== false && vorher.ende === x.start))
            add('pause', x, x.start, x.name || 'Pause', `Bis ${x.bis}.`);
          if (E.vorPauseEnde > 0 && rel(nachher)) add('pauseende', x, x.ende - E.vorPauseEnde * 6e4,
            `${x.name || 'Pause'} endet in ${E.vorPauseEnde} Min`, nachher.eintrag ? 'Danach: ' + label(nachher.eintrag) + '.' : `Unterricht ab ${x.bis}.`);
        }
      });
      return out.sort((a, b) => a.t - b.t);
    }

    // Aktuelles Zeitfenster bzw. die nächste eigene Stunde (bis 14 Tage voraus)
    function jetzt(now, s) {
      s = s || laden(); now = now || Date.now();
      const sl = tag(now, s), k = sl.findIndex(x => x.start <= now && now < x.ende);
      return { slots: sl, k, slot: k >= 0 ? sl[k] : null };
    }
    function naechsteStunde(now, s) {
      s = s || laden(); now = now || Date.now();
      for (let i = 0; i < 15; i++) {
        const d = new Date(now); d.setDate(d.getDate() + i);
        const sl = tag(d, s), k = sl.findIndex(x => x.eintrag && x.start > now);
        if (k >= 0) return { slot: sl[k], block: blockEnde(sl, k) };
      }
      return null;
    }
    // Für den Timer: Ende der laufenden Stunde (Doppelstunde zusammen), sonst der nächsten heute
    function klingel(now, s) {
      s = s || laden(); now = now || Date.now();
      const sl = tag(now, s);
      let k = sl.findIndex(x => x.typ === 'stunde' && x.start <= now && now < x.ende);
      if (k < 0) k = sl.findIndex(x => x.typ === 'stunde' && x.start > now && (x.eintrag || !sl.some(y => y.eintrag)));
      if (k < 0) return null;
      const b = blockEnde(sl, k);
      return { bis: b.bis, titel: sl[k].eintrag ? `${sl[k].eintrag.fach} ${sl[k].eintrag.klasse || ''}`.trim() : `${sl[k].nr}. Stunde` };
    }

    // ---------- Auslösen: Hinweis im Fenster, Systemmitteilung, Ton ----------
    function markieren(id) {
      try {
        const f = JSON.parse(localStorage.getItem(FIRED) || '{}'), d = id.slice(0, 10);
        if (f.tag !== d || !Array.isArray(f.ids)) { f.tag = d; f.ids = []; }
        if (f.ids.includes(id)) return false;
        f.ids.push(id); localStorage.setItem(FIRED, JSON.stringify(f));
      } catch (e) {}
      return true;
    }

    let ctx = null;
    function audio() {
      try {
        if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === 'suspended') ctx.resume();
      } catch (e) { ctx = null; }
      return ctx;
    }
    ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, audio, { passive: true }));
    function ton(art) {
      const c = audio(); if (!c) return;
      const folge = art === 'aufsicht' ? [880, 660, 880, 660, 880, 660] : art === 'vorende' || art === 'pauseende' ? [660, 880] : [784, 659, 523];
      try {
        const t0 = c.currentTime + 0.05;
        folge.forEach((f, i) => {
          const o = c.createOscillator(), g = c.createGain(), t = t0 + i * 0.42;
          o.type = 'sine'; o.frequency.value = f;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
          o.connect(g).connect(c.destination); o.start(t); o.stop(t + 1.15);
        });
      } catch (e) {}
    }

    function toast(e) {
      if (!document.getElementById('erin-css')) {
        const st = document.createElement('style'); st.id = 'erin-css';
        st.textContent = `
          .erin-box{position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:8px;
            width:min(440px,calc(100% - 20px));pointer-events:none}
          .erin{pointer-events:auto;display:grid;grid-template-columns:auto 1fr auto;gap:4px 10px;align-items:start;
            background:var(--panel,#fff);color:var(--fg,#111);border:2px solid var(--accent,#1f6fd6);border-radius:12px;
            padding:10px 12px;box-shadow:0 8px 28px rgba(0,0,0,.35);font:15px/1.35 system-ui,sans-serif;text-shadow:none;
            animation:erin-in .25s ease-out}
          .erin[data-art=aufsicht],.erin[data-art=ende]{border-color:var(--warn,#b06a00)}
          .erin b{grid-column:2;font-size:16px}.erin p{grid-column:2;margin:0;color:var(--muted,#555)}
          .erin i{grid-row:1/3;font-style:normal;font-size:22px;line-height:1}
          .erin button{grid-column:3;grid-row:1/3;background:none;border:0;color:inherit;font-size:18px;cursor:pointer;padding:2px 6px;min-width:0}
          @keyframes erin-in{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}
          @media (prefers-reduced-motion:reduce){.erin{animation:none}}`;
        document.head.appendChild(st);
      }
      let box = document.querySelector('.erin-box');
      if (!box) { box = document.createElement('div'); box.className = 'erin-box'; box.setAttribute('aria-live', 'assertive'); document.body.appendChild(box); }
      const el = document.createElement('div'); el.className = 'erin'; el.dataset.art = e.art || '';
      const i = document.createElement('i'); i.textContent = e.art === 'aufsicht' ? '👀' : e.art && e.art.startsWith('pause') ? '☕' : e.art === 'feierabend' ? '🏁' : '🔔';
      const b = document.createElement('b'); b.textContent = e.titel;
      const p = document.createElement('p'); p.textContent = e.text || '';
      const x = document.createElement('button'); x.textContent = '✕'; x.title = 'Schließen'; x.setAttribute('aria-label', 'Hinweis schließen');
      x.onclick = () => el.remove();
      el.append(i, b, p, x); box.appendChild(el);
      while (box.children.length > 3) box.firstChild.remove();
      setTimeout(() => el.remove(), e.art === 'aufsicht' ? 300000 : 120000);
    }

    // Service Worker (installierte App, Handy): Mitteilungen laufen über ihn – am Handy geht es nur so
    let swReg = null;
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost') && !window.desk) {
      navigator.serviceWorker.register('sw.js').then(r => navigator.serviceWorker.ready).then(r => { swReg = r; }).catch(() => {});
    }
    function mitteilung(e) {
      try {
        if (!('Notification' in window) || Notification.permission !== 'granted') return;
        const opt = { body: e.text, tag: e.id, requireInteraction: e.art === 'aufsicht' || e.art === 'ende',
          icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', vibrate: [200, 100, 200], data: { url: location.pathname.split('/').pop() || './index.html' } };
        if (swReg) { swReg.showNotification(e.titel, opt).catch(() => {}); return; }
        const n = new Notification(e.titel, opt);
        n.onclick = () => { try { window.focus(); } catch (x) {} n.close(); };
      } catch (x) {}
    }

    function ausloesen(e, s) {
      toast(e); mitteilung(e);
      if ((s || laden()).einst.ton) ton(e.art);
      hoerer.forEach(f => { try { f(e); } catch (x) {} });
    }

    const hoerer = [];
    let timer = null;
    function starten(fn) {
      if (fn) hoerer.push(fn);
      if (timer) return;
      const pruefen = () => {
        const now = Date.now(), s = laden();
        // 2 Minuten Spielraum: Browser drosseln Hintergrund-Tabs auf einen Durchlauf pro Minute
        ereignisse(now, s).forEach(e => { if (now >= e.t && now - e.t < 120000 && markieren(e.id)) ausloesen(e, s); });
      };
      pruefen(); timer = setInterval(pruefen, 5000);
      // WebUntis-Kalender aktuell halten (in der Windows-App alle 30 Minuten)
      const sync = () => kalenderSync().then(k => { if (k) hoerer.forEach(f => { try { f({ art: 'kalender' }); } catch (x) {} }); }).catch(() => {});
      setTimeout(sync, 1500); setInterval(sync, 5 * 6e4);
    }
    function testen() {
      ausloesen({ id: 'test', art: 'ende', titel: 'Test: Stunde zu Ende', text: 'So sieht und hört sich eine Erinnerung an.' });
    }

    window.Erinnerung = { KEY, FAECHER, VERTRETUNG, AUFSICHT, alle, fachCfg, klassenListe, setExtra, EXTRA_VORGABE, DEFAULT_BELL, DEFAULT_EINST, fach, laden, tag, ereignisse, jetzt, naechsteStunde, klingel,
      MOFR, vorlage, gilt, kal, icsLesen, icsKey, fachRaten, klasseRaten, zuordnung, kalenderSpeichern, kalenderEntfernen, kalenderSync, blockEnde, label, gleich, norm, hm, uhr, datum, pad, starten, testen, toast, ton, markieren, ausloesen };
  })();

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
