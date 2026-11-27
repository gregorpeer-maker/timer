// Cloud-Anbindung (Supabase): Anmeldung mit E-Mail und Passwort, Zugriff auf die Datenbank.
// Ohne fremde Bibliothek: Supabase hat eine einfache HTTP-Schnittstelle (Auth unter /auth/v1, Daten unter /rest/v1).
// Der Publishable Key ist zum Veröffentlichen gedacht; die Daten schützen die Zugriffsregeln in cloud/schema.sql.
(function () {
  'use strict';
  const BASIS = 'https://qlisonjvnkxkmvfmvywt.supabase.co';
  const SCHLUESSEL = 'sb_publishable_M1o_Czj-vp8BzBFEYKToAQ_B5bDUDNU';
  const KONTO = 'arbeitsplatz.konto';   // Anmeldung dieses Geräts (getrennt von den Daten, nicht in Sicherungen)

  let konto = null;
  try { konto = JSON.parse(localStorage.getItem(KONTO) || 'null'); } catch (e) {}
  if (!konto || !konto.refresh_token || !konto.user) konto = null;
  const merken = k => { konto = k; try { k ? localStorage.setItem(KONTO, JSON.stringify(k)) : localStorage.removeItem(KONTO); } catch (e) {} hoerer.forEach(f => f(k)); };
  const hoerer = [];

  function fehler(text, art) { const e = new Error(text); e.art = art || ''; return e; }
  const UEBERSETZT = [
    [/invalid login credentials/i, 'E-Mail oder Passwort stimmt nicht.'],
    [/already registered|already been registered|user_already_exists/i, 'Diese E-Mail ist schon registriert – bitte anmelden.'],
    [/password should be at least|weak_password|password is too weak/i, 'Das Passwort ist zu kurz oder zu einfach (mindestens 8 Zeichen).'],
    [/unable to validate email|invalid format|email_address_invalid/i, 'Diese E-Mail-Adresse ist ungültig.'],
    [/email not confirmed/i, 'Die E-Mail-Adresse ist noch nicht bestätigt.'],
    [/rate limit|too many/i, 'Zu viele Versuche. Bitte kurz warten und noch einmal probieren.'],
    [/signups not allowed|signup is disabled/i, 'Neue Registrierungen sind derzeit abgeschaltet.'],
    [/JWT expired|invalid JWT|bad_jwt/i, 'Die Anmeldung ist abgelaufen. Bitte neu anmelden.'],
    [/object not found|not_found/i, 'Die Datei gibt es nicht mehr (wurde gelöscht).'],
    [/resource already exists|duplicate/i, 'Eine Datei mit diesem Namen gibt es schon.'],
  ];
  function meldung(j, status) {
    const roh = j && (j.msg || j.error_description || j.message || j.error) || ('Fehler ' + status);
    const t = UEBERSETZT.find(([re]) => re.test(roh) || (j && re.test(j.error_code || j.code || '')));
    return t ? t[1] : String(roh);
  }

  async function roh(pfad, { method = 'GET', body, token, headers = {} } = {}) {
    const h = Object.assign({ apikey: SCHLUESSEL, 'Content-Type': 'application/json' }, headers);
    if (token) h.Authorization = 'Bearer ' + token;
    let r;
    try { r = await fetch(BASIS + pfad, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' }); }
    catch (e) { throw fehler('Keine Verbindung zur Cloud (offline?).', 'offline'); }
    const txt = await r.text();
    let j = null; try { j = txt ? JSON.parse(txt) : null; } catch (e) {}
    if (!r.ok) throw fehler(meldung(j, r.status), r.status);
    return j;
  }

  // Sitzung aus der Antwort von /auth/v1/token bzw. /signup
  function sitzung(j) {
    if (!j || !j.access_token) return null;
    return { access_token: j.access_token, refresh_token: j.refresh_token,
      expires_at: j.expires_at ? j.expires_at * 1000 : Date.now() + (j.expires_in || 3600) * 1000,
      user: { id: j.user.id, email: j.user.email, name: (j.user.user_metadata || {}).name || '' } };
  }

  let erneuern = null;
  async function token() {
    if (!konto) return null;
    if (konto.expires_at - 60000 > Date.now()) return konto.access_token;
    if (!erneuern) erneuern = (async () => {
      try { const j = await roh('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: konto.refresh_token } }); merken(sitzung(j)); }
      catch (e) { if (e.art !== 'offline') merken(null); throw e; }
      finally { erneuern = null; }
    })();
    await erneuern;
    return konto && konto.access_token;
  }
  async function api(pfad, opt = {}) {
    const t = await token();
    if (!t) throw fehler('Nicht angemeldet.', 'abgemeldet');
    return roh(pfad, Object.assign({}, opt, { token: t }));
  }

  window.Cloud = {
    BASIS,
    konto: () => konto,
    beiKonto: f => hoerer.push(f),
    async anmelden(email, passwort) {
      merken(sitzung(await roh('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: email.trim(), password: passwort } })));
      return konto;
    },
    async registrieren(email, passwort, name) {
      const j = await roh('/auth/v1/signup', { method: 'POST', body: { email: email.trim(), password: passwort, data: { name: name.trim() } } });
      const s = sitzung(j);
      if (!s) throw fehler('Registriert. Bitte zuerst die E-Mail bestätigen und dann anmelden.', 'bestaetigen');
      merken(s); return konto;
    },
    async abmelden() {
      try { const t = await token(); if (t) await roh('/auth/v1/logout', { method: 'POST', token: t }); } catch (e) {}
      merken(null);
    },
    async passwortVergessen(email) { await roh('/auth/v1/recover', { method: 'POST', body: { email: email.trim() } }); },
    async passwortAendern(neu) { await api('/auth/v1/user', { method: 'PUT', body: { password: neu } }); },
    rpc: (name, args) => api('/rest/v1/rpc/' + name, { method: 'POST', body: args }),
    holen: pfad => api('/rest/v1/' + pfad),
    // Zeilen anlegen oder überschreiben (neuere Änderung gewinnt, siehe Trigger in schema.sql)
    upsert: (tabelle, zeilen) => api('/rest/v1/' + tabelle, { method: 'POST', body: zeilen, headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } }),
    loeschen: pfad => api('/rest/v1/' + pfad, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }),
    // Arbeitsmaterial im privaten Speicher „material“ (Pfad: <team_id>/<datei>)
    async dateiHochladen(pfad, datei) {
      const t = await token(); if (!t) throw fehler('Nicht angemeldet.', 'abgemeldet');
      let r;
      try {
        r = await fetch(BASIS + '/storage/v1/object/material/' + pfad.split('/').map(encodeURIComponent).join('/'), {
          method: 'POST', body: datei,
          headers: { apikey: SCHLUESSEL, Authorization: 'Bearer ' + t, 'Content-Type': datei.type || 'application/octet-stream', 'x-upsert': 'false' } });
      } catch (e) { throw fehler('Keine Verbindung zur Cloud (offline?).', 'offline'); }
      if (!r.ok) {
        let j = null; try { j = await r.json(); } catch (e) {}
        const m = j && (j.message || j.error) || 'Fehler ' + r.status;
        if (/bucket not found/i.test(m)) throw fehler('Der Dateispeicher ist noch nicht eingerichtet (cloud/schema.sql erneut ausführen).');
        if (/maximum allowed size|too large|payload/i.test(m) || r.status === 413) throw fehler('Die Datei ist zu groß (höchstens 20 MB). Große Dateien bitte in OneDrive ablegen und als Link eintragen.');
        throw fehler(meldung(j, r.status), r.status);
      }
    },
    // zeitlich begrenzter Link zum Öffnen/Herunterladen (1 Stunde)
    async dateiLink(pfad, name) {
      const j = await api('/storage/v1/object/sign/material/' + pfad.split('/').map(encodeURIComponent).join('/'), { method: 'POST', body: { expiresIn: 3600 } });
      const u = j && (j.signedURL || j.signedUrl);
      if (!u) throw fehler('Kein Link erhalten.');
      return BASIS + '/storage/v1' + u + (name ? '&download=' + encodeURIComponent(name) : '');
    },
    // Löschen wie in der offiziellen Bibliothek: Liste der Pfade im Body (ein leerer Body mit JSON-Typ wird abgelehnt)
    async dateiLoeschen(pfad) {
      const j = await api('/storage/v1/object/material', { method: 'DELETE', body: { prefixes: [pfad] } });
      if (Array.isArray(j) && !j.length) throw fehler('Datei nicht gefunden oder keine Berechtigung.');
      return j;
    },
  };
})();
