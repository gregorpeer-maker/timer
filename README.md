# Unterrichtstimer

Timer für die Unterrichtsstunde nach dem AVIVA-Modell (Ankommen, Vorwissen aktivieren, Informieren, Verarbeiten, Auswerten) mit Anzeige, ob man im Plan, im Verzug oder im Vorsprung ist.

Das Repository enthält zwei Dinge:

- **`index.html`** – der Timer als Webseite. Läuft in jedem Browser, auch über GitHub Pages.
- **Windows-App** (`main.js`, `preload.js`, `package.json`) – derselbe Timer als kleines Fenster mit durchsichtigem Hintergrund, das über allen Programmen bleibt.

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
