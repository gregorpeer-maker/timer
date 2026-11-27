# Unterrichtstimer

Timer für die Unterrichtsstunde nach dem AVIVA-Modell (Ankommen, Vorwissen aktivieren, Informieren, Verarbeiten, Auswerten) mit Anzeige, ob man im Plan, im Verzug oder im Vorsprung ist.

Das Repository enthält:

- **`index.html`** – der KFZ-Arbeitsplatz für die Zusammenarbeit im Fachlehrer-Team (siehe unten). Startseite im Browser und in der Windows-App.
- **`timer.html`** – der Unterrichtstimer. Öffnet sich über „⏱ Timer“ im Arbeitsplatz. (`arbeitsplatz.html` leitet für alte Lesezeichen zum Arbeitsplatz weiter.)
- **`erinnerung.js`** – Erinnerungen an Stundenende, Pausen und Pausenaufsicht; wird von Timer und Arbeitsplatz gemeinsam genutzt.
- **Windows-App** (`main.js`, `preload.js`, `package.json`) – startet mit dem Arbeitsplatz. Der Knopf **⏱ Timer** öffnet den Timer als kleines Fenster mit durchsichtigem Hintergrund, das über allen Programmen bleibt.

## KFZ-Arbeitsplatz

**Als App installieren (PC und Handy, kostenlos):** Die Seite über GitHub Pages öffnen und im Browser „App installieren“ wählen (Android/PC: Chrome oder Edge; iPhone: Safari → Teilen → „Zum Home-Bildschirm“). Die App funktioniert auch ohne Internet und zeigt Mitteilungen, solange sie offen ist.

**Cloud (Supabase, kostenloser Tarif):** Oben „☁ Anmelden“ → Konto mit E-Mail und Passwort anlegen → Team anlegen oder mit dem Einladungscode beitreten. Gemeinsame Einträge (Stoffverteilung, Team-Aufgaben, Termine, Pinnwand, Rückmeldungen) sieht das ganze Team; private To-dos nur man selbst. Stundenplan, Klingelzeiten und Einstellungen liegen im eigenen Profil und sind auf allen eigenen Geräten gleich. Ohne Internet arbeitet die App weiter und gleicht später ab (alle 30 Sekunden und nach jeder Änderung). Die Datenbank steht in `cloud/schema.sql`, die Anbindung in `cloud.js`.

Fächer: KFZ-Fachtheorie (FT), Elektrotechnik (ET), Fachrechnen (FR), Praxis (PX), Methodenkompetenz (MK).

- **Stundenplan & Klingel:** Wochenplan antippen und Fach, Klasse und Raum eintragen. Bei Pausen „Aufsicht“ anhaken.
- **Klingelzeiten pro Wochentag** – wie ein Wecker am Handy: Jede Zeile (Stunde, Pause, Feierabend) gilt an den markierten Tagen. Ist die Mittagspause an einem Tag anders: Tag wählen, „✂ nur Di“ tippen, Zeit ändern. Überschneidungen werden rot markiert. Vorlage: Vormittags-, Mittags- und Nachmittagspause sowie Feierabend.
- **WebUntis (immer aktuell):** iCal-Link aus WebUntis einfügen (derselbe wie in Google Kalender). Die Windows-App ruft ihn automatisch alle 30 Minuten ab; die echten Stunden pro Datum – mit Vertretungen und Entfällen – ersetzen dann die Wochenvorlage, Pausen und Feierabend kommen weiter aus den Klingelzeiten. Fächer werden automatisch erkannt und lassen sich zuordnen. Im Browser sperrt WebUntis den direkten Abruf vermutlich; dort die .ics-Datei hochladen. Der Link bleibt nur auf dem eigenen Gerät.
- **Digitales Register:** Knopf „📒 Register“ oben öffnet das Register (Link unter Team & Austausch eintragen). Ein Datenzugriff ist nicht eingebaut: Es gibt keine offizielle Schnittstelle, und es geht um Schülerdaten.
- **Design:** schwarzer Hintergrund, in Arbeitsplatz und Timer.
- **Schalter auf der Startseite:** „Stunde bald zu Ende“ und „Pausen“ mit einem Klick ein- und ausschalten.
- **Erinnerungen:** x Minuten vor Stundenende, beim Klingeln, bei Pausenbeginn, kurz vor Pausenende, vor der Pausenaufsicht und zum Feierabend – mit Gong, Hinweis im Fenster und Systemmitteilung. Doppelstunden werden zusammengefasst. „Heute stumm“ für Ausflugstage.
- **Wie liefen deine Stunden?** Nach jeder Stunde ein Klick (geschafft / nicht ganz / fiel aus) – das Thema rückt in der Stoffverteilung weiter.
- **Stoffverteilung** pro Fach und Klasse, mit geplanten und gebrauchten Stunden; Themen lassen sich aus einer anderen Klasse übernehmen.
- **Meine Fächer** (Team & Austausch): pro Fach „👥 Mit dem Team“ oder „🔒 Nur für mich“, anzeigen immer / sobald verwendet / ausblenden, und „Klassen“: WebUntis-Stunden dieser Klassen gehören automatisch zum Fach (z. B. BG-EM-b → Grundstufe). Vorgabe: Fachtheorie, Elektrotechnik, Praxis mit dem Team; EDV und Grundstufe nur für mich; Fachrechnen und Methodenkompetenz erst, wenn sie vorkommen.
- **Lehrplan:** pro Fach und Stufe (z. B. Grundstufe, 2. Klasse) Einheiten mit Kompetenzen, Lernzielen, Inhalten, Methoden, Leistungsnachweis, Stunden, Stand der Ausarbeitung und Zuständigkeit. „In Stoffverteilung übernehmen“ macht daraus die Planung einer Klasse; „Drucken / PDF“ für die Abgabe.
- **Arbeitsmaterial:** an jeder Lehrplan-Einheit als Link (z. B. OneDrive) oder als Datei bis 20 MB im Cloud-Speicher; erscheint auch beim Thema in der Stoffverteilung.
- **Klassenansicht:** Stand aller Fächer einer Klasse auf einen Blick.
- **To-do-Liste:** getrennt nach ★ wichtig / ☆ nicht wichtig, jeweils zeitlich sortiert (überfällig, heute, morgen, diese Woche, später). Mit Uhrzeit kommt eine Erinnerung. To-dos sind standardmäßig privat; Team-Aufgaben können einer Person zugewiesen werden.
- **Termine** (Prüfungen, Abgaben, Konferenzen) und **Pinnwand** für Absprachen.
- **Timer:** „⏱ Timer“ übernimmt das Stundenende aus der Klingel; im Timer selbst gibt es dafür den Knopf „🔔 Klingel“.

### Zusammenarbeit im Team

Es gibt keinen Server. Die Daten liegen im Browser bzw. in der App jeder Person. Ausgetauscht wird über eine Datei:

- **Gemeinsame Team-Datei** (Chrome/Edge am Computer): `kfz-team.json` in einen gemeinsamen Ordner legen (OneDrive, Teams, Netzlaufwerk). Jede Person verbindet sie unter **Team & Austausch** einmal; danach wird jede Minute abgeglichen. Nach einem Neustart des Browsers muss man einmal „Jetzt abgleichen“ klicken (Sicherheitsregel des Browsers).
- **Export/Import:** Team-Daten exportieren und per Mail/Teams schicken. Beim Import wird zusammengeführt, die neuere Änderung gewinnt.

Geteilt werden Stoffverteilung, Rückmeldungen, Pinnwand, Termine, Team-Aufgaben und die Personenliste. Privat bleiben eigene To-dos, Stundenplan, Klingelzeiten und Einstellungen.

Erinnerungen kommen nur, solange der Arbeitsplatz oder der Timer geöffnet ist. Systemmitteilungen brauchen https (GitHub Pages) oder die Windows-App; eine direkt geöffnete Datei (`file://`) zeigt nur den Hinweis im Fenster und spielt den Ton.

## Auf GitHub hochladen

1. Auf github.com ein neues Repository anlegen (z. B. `unterrichtstimer`), Hauptzweig `main`.
2. Das Zip entpacken. Im Repository **Add file → Upload files** wählen und den **Inhalt** des entpackten Ordners hineinziehen (auch den Ordner `.github`), dann **Commit changes**.
3. Falls der Ordner `.github` beim Hochladen fehlt: **Add file → Create new file**, als Namen `.github/workflows/build.yml` eintippen und den Inhalt der Datei aus dem Zip einfügen.

## Windows-App herunterladen

Nach jedem Hochladen baut GitHub die App automatisch (Reiter **Actions**, dauert wenige Minuten). Das Ergebnis liegt danach unter **Releases → Unterrichtstimer für Windows** als `Unterrichtstimer-Windows.zip`.

Zip entpacken und `Unterrichtstimer.exe` starten. Das Programm ist nicht signiert, deshalb warnt Windows beim ersten Start: **Weitere Informationen → Trotzdem ausführen**.

## Timer als Webseite (GitHub Pages)

**Settings → Pages → Deploy from a branch → `main` / `(root)`** wählen. Der Timer ist dann unter `https://<benutzername>.github.io/<repository>/` erreichbar. Bei privaten Repositories braucht Pages einen bezahlten GitHub-Plan.

## Bedienung der Windows-App

- **Mini-Ansicht:** kleines Fenster über allen Programmen. Verschieben durch Ziehen an Uhrzeit, Phasenname oder Restzeit.
- **Schieberegler:** Deckkraft des Hintergrunds, ganz links ist er vollständig durchsichtig.
- **Größe:** wechselt zwischen klein, mittel und groß.
- **Planen:** großes Fenster zum Bearbeiten des Stundenplans; **Mini-Ansicht** führt zurück.
- **Pausen:** Ein Balken oben kündigt jede Pause aus den Klingelzeiten an (Vorwarnung einstellbar, Standard 5 Minuten). Zum Pausenbeginn blinkt das Fenster und es kommt ein Ton, bis man **OK** klickt; danach zeigt der Balken die restliche Pausenzeit. Die Zeiten werden im Arbeitsplatz unter **Klingelzeiten** gepflegt; im Timer unter „Pausen im Fenster anzeigen“ abschaltbar.
- **Vollbild** (oder Taste F): Timer über den ganzen Bildschirm, z. B. für den Beamer. Esc oder F führt zurück.
- **✕** schließt den Timer; der Arbeitsplatz bleibt offen. Plan und laufende Stunde bleiben gespeichert.

## Selbst bauen

```
npm ci
npm start        # App starten
npm run build    # Windows-Version nach dist/ bauen
```

### Server-Programme (Supabase Edge Functions)

- `cloud/functions/webuntis/index.ts` – holt den WebUntis-Kalender für die angemeldete Person (der Browser darf das nicht direkt).
- `cloud/functions/erinnerungen/index.ts` – läuft jede Minute (Zeitplan `kfz-erinnerungen` aus `cloud/schema.sql`) und schickt fällige Erinnerungen als Push-Mitteilung, auch wenn die App geschlossen ist. Enthält `erinnerung.js`; nach Änderungen daran neu bauen mit `node cloud/bauen.mjs`.

Einrichten im Supabase-Dashboard: `cloud/schema.sql` im SQL Editor ausführen; unter Edge Functions zwei Funktionen „webuntis“ und „erinnerungen“ anlegen (Via Editor), den Inhalt der jeweiligen `index.ts` einfügen, Deploy, dann bei beiden „Verify JWT“ ausschalten. Geheimnisse sind nicht nötig: die Push-Schlüssel erzeugt der Server selbst.
