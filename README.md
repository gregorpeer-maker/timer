# Unterrichtstimer

Timer für die Unterrichtsstunde nach dem AVIVA-Modell (Ankommen, Vorwissen aktivieren, Informieren, Verarbeiten, Auswerten) mit Anzeige, ob man im Plan, im Verzug oder im Vorsprung ist.

Das Repository enthält:

- **`index.html`** – der Timer als Webseite. Läuft in jedem Browser, auch über GitHub Pages.
- **`arbeitsplatz.html`** – der KFZ-Arbeitsplatz für die Zusammenarbeit im Fachlehrer-Team (siehe unten).
- **`erinnerung.js`** – Erinnerungen an Stundenende, Pausen und Pausenaufsicht; wird von Timer und Arbeitsplatz gemeinsam genutzt.
- **Windows-App** (`main.js`, `preload.js`, `package.json`) – derselbe Timer als kleines Fenster mit durchsichtigem Hintergrund, das über allen Programmen bleibt. Der Knopf **🏠 Arbeitsplatz** öffnet den Arbeitsplatz in einem zweiten Fenster.

## KFZ-Arbeitsplatz

Fächer: KFZ-Fachtheorie (FT), Elektrotechnik (ET), Fachrechnen (FR), Praxis (PX), Methodenkompetenz (MK).

- **Stundenplan & Klingel:** Wochenplan antippen und Fach, Klasse und Raum eintragen. Bei Pausen „Aufsicht“ anhaken.
- **Klingelzeiten pro Wochentag** – wie ein Wecker am Handy: Jede Zeile (Stunde, Pause, Feierabend) gilt an den markierten Tagen. Ist die Mittagspause an einem Tag anders: Tag wählen, „✂ nur Di“ tippen, Zeit ändern. Überschneidungen werden rot markiert. Vorlage: Vormittags-, Mittags- und Nachmittagspause sowie Feierabend.
- **WebUntis:** iCal-Link einfügen oder .ics-Datei hochladen. Übernommen wird eine typische Woche als Wochenplan inklusive Zeiten; Pausen und Freistunden der Schule bleiben erhalten. Im Browser sperrt WebUntis den direkten Abruf des Links vermutlich – dann die .ics-Datei herunterladen und hochladen. In der Windows-App wird der Link direkt abgerufen.
- **Erinnerungen:** x Minuten vor Stundenende, beim Klingeln, bei Pausenbeginn, kurz vor Pausenende, vor der Pausenaufsicht und zum Feierabend – mit Gong, Hinweis im Fenster und Systemmitteilung. Doppelstunden werden zusammengefasst. „Heute stumm“ für Ausflugstage.
- **Wie liefen deine Stunden?** Nach jeder Stunde ein Klick (geschafft / nicht ganz / fiel aus) – das Thema rückt in der Stoffverteilung weiter.
- **Stoffverteilung** pro Fach und Klasse, mit geplanten und gebrauchten Stunden; Themen lassen sich aus einer anderen Klasse übernehmen.
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
- **Vollbild** (oder Taste F): Timer über den ganzen Bildschirm, z. B. für den Beamer. Esc oder F führt zurück.
- **✕** beendet das Programm. Plan und laufende Stunde bleiben gespeichert.

## Selbst bauen

```
npm ci
npm start        # App starten
npm run build    # Windows-Version nach dist/ bauen
```
