# MyPlan

Persönliche Trainingsplan-App für Laufen, Rad, Schwimmen, Triathlon und Kraft. Läuft vollständig auf dem Android-Handy: kein Konto, kein Server, keine Internetverbindung. Der Auftrag steht in [PROMPT.md](PROMPT.md).

## App auf das Handy bringen

1. Auf dem Handy diese Seite öffnen: https://github.com/franzkoe/MyPlan/releases/latest
2. `MyPlan.apk` antippen und herunterladen.
3. Die Datei öffnen. Android fragt beim ersten Mal, ob der Browser Apps installieren darf: „Einstellungen“ antippen, „Aus dieser Quelle zulassen“ einschalten, zurück und „Installieren“.
4. Play Protect meldet eventuell eine unbekannte App. Das ist bei selbst gebauten Apps normal: „Trotzdem installieren“.

Eine neue Version installierst du genauso. Sie ersetzt die alte, deine Daten bleiben erhalten. Sichere sie trotzdem regelmäßig unter Profil → Daten sichern.

GitHub baut die APK nach jeder Änderung automatisch (`.github/workflows/android.yml`). Auf GitHub liegt nur der Programmcode, keine Trainingsdaten.

## Damit die Erinnerung zuverlässig kommt

Einstellungen des Handys → Apps → MyPlan → Akku → „Nicht eingeschränkt“. Außerdem Benachrichtigungen erlauben. Die App erklärt das unter Profil → Erinnerung noch einmal.

## Im Browser ausprobieren (am Computer)

```
npm install
npm run dev      # App unter http://localhost:5173
npm test         # Tests der Trainingslogik
```

## Aufbau

- `src/logic/` Trainingslogik als reine Funktionen: Zonen, Plangenerator, Belastung, Kombination, Erholung, Import, Analyse
- `tests/` Tests dazu und Beispiel-Dateien für den Import (`tests/fixtures`)
- `src/screens/`, `src/ui/` Oberfläche
- `docs/trainingslehre.md` worauf jede Vorlage beruht
- `docs/design.md` Designrichtung und Bedienkonzept
- `android/` Android-Hülle (Capacitor)

## Bekannte Grenzen

- Krafteinheiten aus Dateien werden als Einheit erkannt, Sätze trägst du von Hand ein.
- Whoop- und Garmin-CSV sind an Beispiel-Dateien getestet, die den Export-Formaten nachgebaut sind. Weicht dein Export ab, meldet die App die unbekannten Spalten.
- Die Berechtigung „Internet“ braucht Android, um die App-Dateien vom Gerät selbst zu laden. Die App baut keine Verbindung nach außen auf.
