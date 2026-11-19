// Erinnerungen an Stundenende und Pausen – gemeinsam genutzt von Arbeitsplatz (arbeitsplatz.html) und Timer (index.html).
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
  const fach = k => FAECHER.find(f => f.k === k) || { k: String(k || ''), name: String(k || '–'), icon: '📘', ende: '', fremd: true };

  const DEFAULT_BELL = [
    { typ: 'stunde', nr: '1', start: '07:50', ende: '08:40' },
    { typ: 'stunde', nr: '2', start: '08:40', ende: '09:30' },
    { typ: 'stunde', nr: '3', start: '09:30', ende: '10:20' },
    { typ: 'pause', name: 'Pause', start: '10:20', ende: '10:35' },
    { typ: 'stunde', nr: '4', start: '10:35', ende: '11:25' },
    { typ: 'stunde', nr: '5', start: '11:25', ende: '12:15' },
    { typ: 'pause', name: 'Mittagspause', start: '12:15', ende: '13:15' },
    { typ: 'stunde', nr: '6', start: '13:15', ende: '14:05' },
    { typ: 'stunde', nr: '7', start: '14:05', ende: '14:55' },
    { typ: 'pause', name: 'Pause', start: '14:55', ende: '15:05' },
    { typ: 'stunde', nr: '8', start: '15:05', ende: '15:55' },
  ];
  const DEFAULT_EINST = {
    aktiv: true,        // Erinnerungen überhaupt
    vorEnde: 5,         // Minuten vor Stundenende (0 = aus)
    beiEnde: true,      // beim Klingeln
    pauseBeginn: true,
    vorPauseEnde: 2,    // Minuten vor Pausenende (0 = aus)
    aufsichtVorher: 3,  // Minuten vor der Pausenaufsicht
    nurEigene: true,    // nur an Tagen/Stunden mit eigenem Unterricht
    ton: true,
    stillAm: '',        // Datum, an dem alles stumm ist (z. B. Ausflug)
  };

  const pad = n => String(n).padStart(2, '0');
  const hm = s => { const m = /^(\d{1,2}):(\d\d)$/.exec(s || ''); return m ? +m[1] * 60 + +m[2] : null; };
  const datum = d => { d = new Date(d); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const at = (d, s) => { const x = new Date(d); x.setHours(0, hm(s), 0, 0); return x.getTime(); };
  const uhr = t => { const d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const norm = s => String(s || '').trim().toUpperCase();

  function laden() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
    s = s && typeof s === 'object' ? s : {};
    const bell = Array.isArray(s.bell) ? s.bell.filter(b => b && (b.typ === 'stunde' || b.typ === 'pause')) : [];
    return Object.assign({}, s, {
      bell: bell.length ? bell : DEFAULT_BELL.map(b => Object.assign({}, b)),
      plan: Array.isArray(s.plan) ? s.plan.filter(e => e && typeof e === 'object') : [],
      aufsicht: Array.isArray(s.aufsicht) ? s.aufsicht.filter(a => typeof a === 'string') : [],
      einst: Object.assign({}, DEFAULT_EINST, s.einst || {}),
    });
  }

  // Alle Zeitfenster eines Tages, mit eigenem Unterricht und Pausenaufsicht
  function tag(d, s) {
    s = s || laden();
    const wt = new Date(d).getDay();
    return s.bell
      .filter(b => hm(b.start) != null && hm(b.ende) != null && hm(b.ende) > hm(b.start))
      .sort((a, b) => hm(a.start) - hm(b.start))
      .map((b, i) => Object.assign({}, b, {
        i, von: b.start, bis: b.ende, start: at(d, b.start), ende: at(d, b.ende),
        eintrag: b.typ === 'stunde' ? s.plan.find(e => +e.tag === wt && String(e.nr) === String(b.nr) && e.fach) || null : null,
        aufsicht: b.typ === 'pause' && s.aufsicht.includes(wt + '|' + b.start),
      }));
  }
  const gleich = (a, b) => a && b && a.fach === b.fach && norm(a.klasse) === norm(b.klasse);
  const label = e => e ? `${fach(e.fach).name} · ${e.klasse || '–'}` + (e.raum ? ` · Raum ${e.raum}` : '') : '';

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
    if (!eigene && !aufs) return out;
    if (!eigene && E.nurEigene && !aufs) return out;
    if ((wt === 0 || wt === 6) && !eigene) return out;
    const rel = x => x && x.typ === 'stunde' && (x.eintrag || (!E.nurEigene && eigene));
    const relIdx = sl.map((x, k) => rel(x) ? k : -1).filter(k => k >= 0);
    const erste = relIdx[0], letzte = relIdx[relIdx.length - 1];
    const add = (art, x, t, titel, text) => out.push({ id: `${key}|${art}|${x.von}`, art, t, titel, text });

    sl.forEach((x, k) => {
      const nx = sl[k + 1];
      if (rel(x)) {
        // Doppelstunde: keine Erinnerung mitten im Block
        if (nx && nx.typ === 'stunde' && x.eintrag && gleich(nx.eintrag, x.eintrag) && nx.start - x.ende < 6e5) return;
        const f = x.eintrag ? fach(x.eintrag.fach) : null;
        if (E.vorEnde > 0) add('vorende', x, x.ende - E.vorEnde * 6e4, `Noch ${E.vorEnde} Minuten`,
          (x.eintrag ? label(x.eintrag) + ' – ' : '') + `Klingel um ${x.bis}. ` + (f && f.ende ? f.ende : 'Zeit zum Abschließen.'));
        if (E.beiEnde) {
          let text;
          if (nx && nx.typ === 'pause') text = `${nx.name || 'Pause'} bis ${nx.bis}.` + (nx.aufsicht ? ' Du hast Pausenaufsicht!' : '');
          else if (nx && rel(nx) && nx.eintrag) text = 'Als Nächstes: ' + label(nx.eintrag) + '.';
          else if (k >= letzte) text = 'Dein Unterricht für heute ist zu Ende.';
          else text = 'Stundenwechsel.';
          add('ende', x, x.ende, 'Stunde zu Ende', text);
        }
      } else if (x.typ === 'pause') {
        const drin = erste != null && k > erste && k < letzte;
        const vorher = sl[k - 1], nachher = sl[k + 1];
        if (x.aufsicht && E.aufsichtVorher >= 0) add('aufsicht', x, x.start - E.aufsichtVorher * 6e4, 'Pausenaufsicht',
          `${x.name || 'Pause'} ${x.von}–${x.bis}: Du hast Aufsicht.`);
        if (!drin && !x.aufsicht) return;
        if (E.pauseBeginn && !(rel(vorher) && E.beiEnde && vorher.ende === x.start))
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
    const i = document.createElement('i'); i.textContent = e.art === 'aufsicht' ? '👀' : e.art && e.art.startsWith('pause') ? '☕' : '🔔';
    const b = document.createElement('b'); b.textContent = e.titel;
    const p = document.createElement('p'); p.textContent = e.text || '';
    const x = document.createElement('button'); x.textContent = '✕'; x.title = 'Schließen'; x.setAttribute('aria-label', 'Hinweis schließen');
    x.onclick = () => el.remove();
    el.append(i, b, p, x); box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => el.remove(), e.art === 'aufsicht' ? 300000 : 120000);
  }

  function mitteilung(e) {
    try {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      const n = new Notification(e.titel, { body: e.text, tag: e.id, requireInteraction: e.art === 'aufsicht' || e.art === 'ende' });
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
  }
  function testen() {
    ausloesen({ id: 'test', art: 'ende', titel: 'Test: Stunde zu Ende', text: 'So sieht und hört sich eine Erinnerung an.' });
  }

  window.Erinnerung = { KEY, FAECHER, DEFAULT_BELL, DEFAULT_EINST, fach, laden, tag, ereignisse, jetzt, naechsteStunde, klingel,
    blockEnde, label, gleich, norm, hm, uhr, datum, pad, starten, testen, toast, ton, markieren, ausloesen };
})();
