# Prompt: Trainingsplan-App

Diese Datei ist der Auftrag für die Entwicklung meiner Trainingsplan-App. Lies sie vollständig, bevor du anfängst. Wo etwas offen oder widersprüchlich ist, frag mich, statt zu raten. Ich bin kein Entwickler: Erkläre Entscheidungen kurz und in einfacher Sprache, und sag mir bei jedem Schritt, wie ich das Ergebnis selbst ausprobieren kann.

## 1. Worum es geht

Ich möchte eine persönliche App, mit der ich Trainingspläne für mehrere Ausdauersportarten und Krafttraining erstelle, kombiniere und verfolge. Die App soll mir zeigen, was diese Woche ansteht, meine absolvierten Einheiten aus Dateiexporten (Garmin, Whoop) einlesen und mir ehrlich sagen, ob ich besser werde.

Nutzer bin nur ich, auf meinem Android-Handy. Es braucht also kein Login, keine Nutzerverwaltung und keinen Server. Alles läuft und bleibt lokal auf dem Gerät und lässt sich als Datei sichern und wiederherstellen.

Die App-Sprache ist Deutsch.

## 2. Technischer Rahmen

Mein Vorschlag, von dem du abweichen darfst, wenn du einen guten Grund nennst und mich vorher fragst:

- Die App läuft auf meinem Android-Handy, und zwar vollständig lokal: keine Cloud, kein Server, kein Konto, keine Internetverbindung nötig. Keine Daten verlassen das Gerät, auch keine Analyse- oder Tracking-Dienste.
- React mit TypeScript und Vite, Tailwind für das Styling. Für kleine Bildschirme entwerfen. Während der Entwicklung soll ich die App im Browser ausprobieren können.
- Verpackt als Android-App mit Capacitor, damit die wöchentliche Erinnerung als lokale Benachrichtigung zuverlässig ohne Server funktioniert und der Dateizugriff sauber läuft. Erkläre mir Schritt für Schritt, wie die App auf mein Handy kommt (APK bauen und installieren). Wenn du einen einfacheren Weg siehst, der dieselben Anforderungen erfüllt, schlag ihn vor.
- Speicherung lokal auf dem Gerät (IndexedDB, z. B. über Dexie, oder SQLite). Funktioniert offline.
- Export und Import aller Daten als JSON-Datei in den Handyspeicher, damit nichts verloren geht, wenn ich das Gerät wechsle oder die App neu installiere.
- Die gesamte Trainingslogik (Plangenerator, Zonenberechnung, Belastungskennzahlen, Analyse) liegt in reinen Funktionen ohne UI-Abhängigkeit und ist mit Tests abgedeckt. Hier dürfen keine Rechenfehler passieren, weil ich danach trainiere.

## 3. Design

Das Design richtet sich nach dem Skill „unslop“: https://github.com/heydamir/unslop

Installiere den Skill zu Beginn ins Projekt (Ordner `skills/unslop` aus dem Repo nach `.claude/skills/` kopieren), lies ihn und wende ihn an. Die App soll von Anfang an nicht nach generischer KI-Oberfläche aussehen. Konkret heißt das:

- Keine lila Farbverläufe, keine Glow-Effekte, keine Emojis als Beschriftung oder Icon-Ersatz, keine reißerischen Texte, keine ungleichmäßigen Abstände.
- Bevor du die erste Oberfläche baust, schlägst du mir eine Designrichtung vor, so wie der Skill es vorsieht: ein Charakter, eine Welt, ein bis zwei Momente, die die Farbe tragen, und ein Signature-Detail. Die Richtung soll aus dem Produkt selbst kommen (Training, Ausdauer, Fortschritt über Wochen), nicht aus einem Template. Warte auf mein Okay.
- Nach jedem größeren UI-Schritt gehst du die Durchgänge des Skills in seiner Reihenfolge durch: Abstände, Farbe, Icons, Texte, Typografie, Layout, Details, Visuals, Motion.
- Texte in der App sind ruhig, konkret und knapp. Eine Einheit heißt „6 × 800 m im 5-km-Tempo, 2 min Trabpause“ und nicht „Power-Intervalle“.
- Helles und dunkles Farbschema.

Diagramme folgen demselben System wie der Rest der App: wenige Farben mit fester Bedeutung, gut lesbare Achsen, keine Deko.

## 4. Sportarten und Ziele

Für jede Sportart gibt es fertige Vorlagen und den eigenen Planbaukasten (Abschnitt 6).

**Laufen**
- Distanzen: 5 km, 10 km, Halbmarathon (21,1 km), Marathon (42,2 km), Ultra (50 km, 100 km, frei eingebbar)
- Profil: flach oder bergig. Bergige Pläne enthalten Höhenmeter-Vorgaben, Bergintervalle, Bergab-Training und bei Ultras lange Einheiten nach Zeit statt nach Distanz.

**Triathlon**
- Distanzen: Sprint, Olympisch, Mitteldistanz (70.3), Langdistanz
- Enthält Koppeleinheiten (Rad und direkt danach Laufen) und verteilt die drei Disziplinen sinnvoll über die Woche.

**Radfahren**
- Distanzen: frei wählbar, mit Vorlagen für z. B. 50 km, 100 km, 200 km und Mehrtagestouren
- Höhenprofil: flach, wellig, bergig. Bergige Pläne enthalten längere Belastungen an der Schwelle und Kraftausdauer am Berg.
- Steuerung über Leistung (FTP), wenn vorhanden, sonst über Herzfrequenz.

**Schwimmen**
- Ziele: Technik und Grundlage, 400 m, 1500 m, 3,8 km, Freiwasser
- Steuerung über die Critical Swim Speed (CSS), ermittelt aus einem 400-m- und 200-m-Test.

**Gym (Krafttraining)**
- Ziele: Maximalkraft, Muskelaufbau, Kraftausdauer, ergänzendes Krafttraining für Ausdauersportler
- Aufteilungen: Ganzkörper, Oberkörper/Unterkörper, Push/Pull/Beine
- Übungsbibliothek mit Grundübungen und Alternativen. Eigene Übungen lassen sich anlegen.

**Ziele festlegen**
Ein Ziel besteht aus Sportart, Art (Wettkampf mit Datum, Zielzeit, Distanz schaffen, Kraftwert erreichen, allgemeine Fitness) und optional einem Datum. Mit Zieldatum rechnet der Plan rückwärts vom Wettkampf und enthält eine Tapering-Phase. Mehrere Ziele gleichzeitig sind möglich; eins davon ist das Hauptziel.

## 5. Wissenschaftliche Grundlage

Die Vorlagen sollen auf anerkannter Trainingslehre beruhen, nicht frei erfunden sein. Recherchiere die Quellen, bevor du die Pläne baust, und lege eine Datei `docs/trainingslehre.md` an, in der für jede Vorlage steht, worauf sie sich stützt. In der App hat jeder Plan einen kurzen Abschnitt „Worauf beruht dieser Plan“.

Als Ausgangspunkt für die Recherche:

- Intensitätsverteilung im Ausdauersport: polarisiertes und pyramidales Training (Stephen Seiler), ungefähr 80 % locker und 20 % intensiv
- Laufen: Jack Daniels (VDOT, Tempobereiche), Pfitzinger; Ultra: Jason Koop
- Radfahren: Leistungszonen nach Coggan, FTP-basierte Steuerung, Sweet-Spot-Training
- Triathlon: Periodisierung nach Joe Friel
- Schwimmen: CSS-basierte Steuerung
- Krafttraining: progressive Überlastung, Volumen pro Muskelgruppe und Woche (Schoenfeld, Helms), Steuerung über RIR bzw. RPE, lineare und wellenförmige Periodisierung
- Kombination Kraft und Ausdauer: Forschung zum Interferenzeffekt (concurrent training)
- HRV-gesteuertes Training: Kiviniemi, Plews

Übernimm keine urheberrechtlich geschützten Pläne wortgleich aus Büchern. Baue eigene Pläne nach den Prinzipien dahinter. Wenn die Studienlage zu etwas dünn oder umstritten ist (z. B. die 10-%-Regel), schreib das ehrlich dazu, statt es als Tatsache darzustellen.

## 6. Pläne: Vorlagen, eigener Baukasten, Kombination

**Vorlagen**
Fertige Pläne pro Sportart, Ziel und Niveau (Einsteiger, Fortgeschritten, Ambitioniert). Ich wähle einen aus, lege Starttermin oder Zieldatum fest, und er landet im Kalender.

**Einzelne Woche auswählen**
Ich kann statt eines ganzen Plans auch nur eine Wochenvorlage wählen (z. B. „Grundlagenwoche Laufen, 4 Einheiten“ oder „Entlastungswoche“) und sie in eine bestimmte Kalenderwoche legen. Ebenso kann ich innerhalb eines laufenden Plans eine Woche gegen eine andere tauschen.

**Eigener Plan**
Ein Baukasten mit diesen Einstellungen:

- Sportart und Ziel
- Dauer in Wochen
- Einheiten pro Woche und an welchen Wochentagen ich Zeit habe
- Startumfang (Kilometer, Stunden oder Sätze pro Woche)
- Steigerung pro Woche in Prozent. Bei Werten über etwa 10 % zeigt die App einen sachlichen Hinweis auf das Verletzungsrisiko, lässt mich aber entscheiden.
- Rhythmus der Entlastungswochen (siehe unten)
- Ausrichtung der Einheiten:
  - Ausdauer: gemischt, nur Grundlage, nur Intervalle (VO2max), nur Schwelle, Tempo/Wettkampftempo, Berg, lange Einheit betont
  - Kraft, als Entsprechung dazu: gemischt, Maximalkraft (schwer, wenige Wiederholungen), Hypertrophie (mittlere Last, mehr Volumen), Kraftausdauer (leicht, viele Wiederholungen), Schnellkraft, Stabilität und Mobilität

Aus den Einstellungen erzeugt die App einen vollständigen Plan mit konkreten Einheiten. Jede Einheit lässt sich danach von Hand ändern, verschieben, löschen oder ersetzen.

**Entlastungswochen (Pflicht)**
Jeder Plan enthält Entlastungswochen, egal ob Vorlage oder Eigenbau. Standard ist jede vierte Woche (3 Wochen Aufbau, 1 Woche Entlastung), einstellbar auf jede dritte. In der Entlastungswoche sinkt der Umfang um etwa 30 bis 40 %, die Intensität bleibt in kleiner Dosis erhalten. Im Krafttraining entspricht das einer Deload-Woche mit weniger Sätzen und etwas weniger Last. Entlastungswochen lassen sich verschieben, aber nicht ganz abschalten; wenn ich es versuche, erklärt die App kurz, warum sie nötig sind.

**Pläne kombinieren**
Ich kann mehrere Pläne gleichzeitig aktiv haben, z. B. Laufen und Kraft. Die App legt sie zu einer Woche zusammen und achtet dabei auf:

- Harte Einheiten nicht an aufeinanderfolgenden Tagen, schweres Beintraining nicht am Tag vor Intervallen oder dem langen Lauf
- Wenn Kraft und Ausdauer am selben Tag liegen: mehrere Stunden Abstand, und die für das Hauptziel wichtigere Einheit zuerst
- Gesamtbelastung der Woche über alle Sportarten gemeinsam betrachten
- Entlastungswochen aller aktiven Pläne fallen in dieselbe Kalenderwoche
- Mindestens ein vollständiger Ruhetag pro Woche

Bei Konflikten macht die App einen Vorschlag und erklärt ihn in einem Satz. Ich kann ihn überstimmen.

**Laufende Pläne bearbeiten und anpassen**
Ein aktiver Plan ist jederzeit änderbar, ohne dass ich ihn neu anlegen muss und ohne dass bereits erledigte Einheiten verloren gehen:

- Einzelne Einheiten ändern, verschieben, tauschen, löschen oder hinzufügen
- Die Einstellungen des Plans nachträglich ändern (Einheiten pro Woche, Trainingstage, Steigerung, Ausrichtung, Rhythmus der Entlastungswochen, Zieldatum, Zielzeit). Die App berechnet dann nur die noch offenen Wochen neu und zeigt mir vorher, was sich ändert.
- Plan pausieren (Krankheit, Urlaub) und danach fortsetzen. Nach einer Pause schlägt die App einen angepassten Wiedereinstieg mit reduziertem Umfang vor, statt einfach dort weiterzumachen, wo ich aufgehört habe.
- Plan verlängern, verkürzen oder vorzeitig beenden
- Von Hand geänderte Einheiten bleiben bei einer Neuberechnung erhalten, außer ich gebe sie ausdrücklich frei.
- Änderungen lassen sich rückgängig machen.

**Bestehende Pläne in neue Planungen übernehmen**
Laufende und abgeschlossene Pläne kann ich als Grundlage für eine neue Planung verwenden:

- Einen Plan als Vorlage kopieren und anpassen, oder als eigene Vorlage speichern
- Einen Folgeplan anlegen, der an einen abgeschlossenen oder laufenden Plan anschließt. Der Startumfang ergibt sich dann aus dem, was ich zuletzt tatsächlich trainiert habe (Ist-Werte), nicht aus dem ursprünglichen Soll.
- Die Erfahrungen aus dem alten Plan fließen ein: erreichte Umfänge, Erfüllungsquote, aktuelle Leistungswerte, welche Steigerung ich gut vertragen habe. Die App zeigt mir diese Zusammenfassung beim Anlegen des neuen Plans und schlägt passende Einstellungen vor.
- Einen laufenden Plan mit in die Planung eines weiteren nehmen: Der neue Plan wird von Anfang an um den bestehenden herum gebaut (Belastung, Trainingstage, Entlastungswochen), nach den Regeln aus „Pläne kombinieren“.
- Abgeschlossene Pläne bleiben mit allen Einheiten und Auswertungen in einem Archiv einsehbar.

## 7. Einheiten erfassen: Dateiimport

Ich lade Dateien hoch, die ich aus Garmin Connect oder Whoop exportiert habe. Unterstützte Formate:

- GPX, TCX und FIT (Garmin und die meisten Uhren und Radcomputer). FIT ist wichtig, weil dort Herzfrequenz, Leistung und Trittfrequenz am vollständigsten drinstehen.
- CSV (Whoop exportiert Einheiten und Erholungsdaten als CSV, nicht als GPX)

Ablauf: Datei oder mehrere Dateien auswählen, die App erkennt Sportart, Datum, Dauer, Distanz, Höhenmeter, Herzfrequenz- und Leistungsverlauf und ordnet die Einheit der passenden geplanten Einheit im Kalender zu. Ich bestätige oder korrigiere die Zuordnung. Doppelte Importe werden erkannt.

Krafteinheiten und Einheiten ohne Datei trage ich von Hand ein (Übung, Sätze, Wiederholungen, Gewicht, RIR bzw. Dauer, Distanz, gefühlte Anstrengung).

Leg Beispiel-Dateien für jedes Format im Testordner ab und teste den Import damit. Fehlerhafte oder unvollständige Dateien dürfen die App nicht zum Absturz bringen, sondern führen zu einer verständlichen Meldung.

## 8. Dashboard und Analyse

Die Startseite beantwortet drei Fragen: Was steht heute und diese Woche an? Wie läuft der Plan? Werde ich besser?

**Diese Woche**
Geplante und erledigte Einheiten, Umfang Soll gegen Ist, Hinweis auf Entlastungswoche.

**Fortschritt im Plan**
Wo ich im Plan stehe, Erfüllungsquote, Wochenumfang über die Zeit, Verteilung der Trainingszeit auf die Herzfrequenz- bzw. Leistungszonen im Vergleich zur Vorgabe.

**Werde ich besser?**
Eine Analyse pro Sportart mit einer klaren Aussage in einem Satz und den Zahlen dahinter. Mögliche Kennzahlen:

- Laufen: Tempo bei gleicher Herzfrequenz in lockeren Läufen, Herzfrequenz-Drift in langen Läufen, Bestzeiten über Standarddistanzen, geschätzte Wettkampfzeit
- Rad: Leistung bei gleicher Herzfrequenz, beste Durchschnittsleistung über 5, 20 und 60 Minuten, FTP-Verlauf
- Schwimmen: CSS-Verlauf, Tempo pro 100 m
- Kraft: geschätztes 1RM pro Grundübung (z. B. Epley-Formel), Volumen pro Muskelgruppe und Woche
- VO2max-Verlauf aus meinen eingetragenen Werten
- Über alles: Trainingsbelastung pro Einheit (aus Herzfrequenz oder Leistung), daraus Fitness, Ermüdung und Form als Verlauf (CTL, ATL, TSB)

Die Analyse ist ehrlich: Bei zu wenig Daten sagt sie das, statt einen Trend zu behaupten. Vergleiche gelten nur für vergleichbare Einheiten (ähnliche Strecke, ähnliche Intensität). Stagnation oder Rückschritt werden genauso klar benannt wie Fortschritt.

## 9. Erholung und HRV

Einmal pro Woche erinnert mich die App daran, meine Erholungsdaten einzugeben. Wochentag und Uhrzeit stelle ich selbst ein.

Eingabe von Hand oder per Whoop- bzw. Garmin-CSV: HRV (RMSSD in ms, Wochendurchschnitt oder Tageswerte), Ruhepuls, Schlafdauer, dazu optional subjektives Befinden und Muskelkater auf einer einfachen Skala.

Auswertung:

- Die App bildet meinen persönlichen Normalbereich aus den letzten Wochen (gleitender Mittelwert und übliche Schwankung) und vergleicht die aktuelle Woche damit, nicht mit allgemeinen Normwerten.
- Das Ergebnis fließt in die aufbauenden Einheiten der kommenden Woche ein: Bei normaler oder guter Erholung bleibt der Plan wie er ist. Bei deutlich gedrückter HRV zusammen mit erhöhtem Ruhepuls schlägt die App vor, harte Einheiten abzuschwächen, zu verschieben oder die Entlastungswoche vorzuziehen.
- Die App schlägt vor und begründet, sie ändert den Plan nicht von selbst.
- In den ersten Wochen, solange noch kein Normalbereich vorliegt, sammelt sie nur Daten und sagt das auch.

**Vorschlag bei jeder Einheit, wenn ich nicht gut erholt bin**
Unabhängig von der Wochenauswertung hat jede geplante Einheit eine Funktion „Nicht gut erholt“. Tippe ich darauf, fragt die App kurz ab, wie es mir geht (z. B. müde, schwere Beine, schlecht geschlafen, Muskelkater, angeschlagen; optional HRV und Ruhepuls von heute) und macht daraus konkrete Alternativen für genau diese Einheit:

- eine abgeschwächte Version (weniger Wiederholungen, kürzere Dauer, niedrigere Intensität; im Kraftraum weniger Sätze oder weniger Last)
- eine lockere Ersatzeinheit (Grundlage, Technik, Mobilität)
- die Einheit auf einen anderen Tag verschieben, mit Anzeige, was das für den Rest der Woche bedeutet
- Ruhetag

Jede Alternative hat eine Begründung in einem Satz. Die App berücksichtigt dabei, wie wichtig die Einheit im Plan ist, was in den Tagen davor und danach liegt und was die letzte HRV-Auswertung ergeben hat. Bei Krankheitszeichen (Fieber, Infekt) empfiehlt sie klar eine Pause. Ich wähle aus, die Einheit wird entsprechend angepasst, und die Änderung bleibt im Plan als solche erkennbar. Nutze ich die Funktion auffällig oft, weist die App darauf hin, dass der Plan insgesamt zu hart sein könnte, und bietet an, ihn anzupassen.

Erinnerungen: Die wöchentliche Erinnerung kommt als lokale Android-Benachrichtigung, ohne Server. Android kann Benachrichtigungen durch Akku-Sparfunktionen verzögern oder unterdrücken; erkläre mir, welche Einstellung ich dafür am Handy setzen muss. Baue zusätzlich einen gut sichtbaren Hinweis im Dashboard ein, sobald die wöchentliche Eingabe fällig ist.

## 10. Einstellungen und Profil

- Persönliche Daten: Name, Geburtsjahr, Geschlecht, Größe, Gewicht (mit Verlauf)
- Herzfrequenz: Maximalpuls, Ruhepuls, Laktatschwellen-Herzfrequenz
- Herzfrequenzzonen: automatisch berechnet (wählbar nach % Maximalpuls, Herzfrequenzreserve nach Karvonen oder % Schwellenpuls) oder komplett von Hand festgelegt. Getrennte Zonen für Laufen und Rad möglich.
- VO2max: von Hand eintragbar (z. B. der Schätzwert der Uhr oder ein Laborwert), mit Datum und Verlauf, auf Wunsch getrennt für Laufen und Rad. Die App kennzeichnet, woher der Wert stammt, und behandelt Uhrenwerte als Schätzung. Der Wert erscheint als Verlauf in der Analyse und dient als Ausgangspunkt für Tempobereiche und Zeitprognosen, wenn keine aktuelle Wettkampfzeit vorliegt. Liegt eine Wettkampfzeit vor, hat sie Vorrang.
- Rad: FTP, daraus Leistungszonen
- Laufen: Schwellentempo oder eine aktuelle Wettkampfzeit, daraus Tempobereiche
- Schwimmen: CSS bzw. Testzeiten über 400 m und 200 m
- Kraft: aktuelle Maximalwerte oder Arbeitsgewichte für die Grundübungen
- Einheiten (km/kg), erster Wochentag, helles oder dunkles Schema
- Erinnerungen: Wochentag und Uhrzeit für die HRV-Eingabe
- Daten: alles exportieren, importieren, löschen

Ändere ich einen Wert (z. B. FTP), passen sich die Vorgaben künftiger Einheiten an. Vergangene Einheiten behalten die damals gültigen Werte. Die App schlägt in sinnvollen Abständen einen neuen Leistungstest vor.

## 11. Gesundheit und Grenzen

Die App ersetzt keinen Arzt und keinen Trainer. Beim ersten Start steht ein kurzer, sachlicher Hinweis dazu, der auch empfiehlt, sich vor Beginn eines intensiven Programms ärztlich durchchecken zu lassen. Die App gibt keine medizinischen Diagnosen aus HRV- oder Pulsdaten ab.

## 12. Bedienung: einfach, logisch, intuitiv

Die App hat viele Funktionen und viele Zahlen. Sie soll sich trotzdem einfach anfühlen. Ich will nie überlegen müssen, wo etwas ist, was eine Zahl bedeutet oder was ich als Nächstes tun soll. Das ist genauso wichtig wie die Funktionen selbst. Prüfe jeden Bildschirm daran, bevor du ihn mir zeigst.

**Logische Verknüpfungen**

- Werte hängen sichtbar zusammen. Aus Maximalpuls werden Zonen, aus FTP Leistungszonen, aus Wettkampfzeit oder VO2max Tempobereiche, aus Zonen die Vorgaben der Einheiten. Ändere ich einen Wert, zeigt die App, was sich dadurch ändert, bevor ich speichere.
- Bei jedem berechneten Wert ist erkennbar, woraus er berechnet wurde und ob er von mir eingetragen, aus einer Einheit ermittelt oder geschätzt ist.
- Alles, was zusammengehört, ist miteinander verlinkt: von der Einheit zum Plan, vom Plan zum Ziel, von einer Kennzahl im Dashboard zu den Einheiten, aus denen sie entstanden ist, von einem Vorschlag zu seiner Begründung.
- Die App fragt nur, was sie braucht. Fahre ich kein Rad, sehe ich kein FTP-Feld. Fehlt für einen Plan ein Wert (z. B. Schwellentempo), fragt die App ihn genau an dieser Stelle ab und bietet eine Schätzung oder einen kurzen Test an, statt mich in die Einstellungen zu schicken.
- Unplausible Eingaben und unmögliche Kombinationen fängt die App freundlich ab: ein Maximalpuls von 300, ein Zieldatum in drei Wochen für einen Marathonplan, sieben harte Einheiten pro Woche. Sie sagt, was nicht passt, und schlägt etwas Passendes vor.
- Derselbe Vorgang funktioniert überall gleich. Eine Einheit verschieben, bearbeiten oder abhaken geht im Kalender, in der Wochenansicht und im Dashboard auf dieselbe Weise.

**Darstellung**

- Feste Bedeutung für Farben und Formen in der ganzen App: Jede Sportart, jede Zone und jede Einheitenart (Grundlage, Schwelle, Intervalle, Entlastung) sieht im Kalender, in der Einheit und im Diagramm gleich aus. Nie nur über Farbe unterscheiden.
- Geplant und erledigt sind auf einen Blick unterscheidbar, Soll und Ist stehen direkt nebeneinander.
- Erst das Wichtigste, Details auf Wunsch: Jede Ansicht beginnt mit der Aussage („Du liegst im Plan“, „Tempo bei gleichem Puls: 8 s/km schneller als vor 6 Wochen“), darunter die Zahl, dahinter beim Antippen das Diagramm und die Einzelwerte.
- Fachbegriffe (FTP, CSS, TSB, RIR, HRV, VO2max) werden beim ersten Auftreten und auf Antippen in einem Satz erklärt. Wo es ein verständliches deutsches Wort gibt, steht das.
- Einheiten sind so beschrieben, dass ich sie ohne Nachschlagen ausführen kann: Aufwärmen, Hauptteil, Auslaufen, mit konkretem Tempo, Puls oder Watt aus meinen eigenen Zonen statt nur „Zone 4“.
- Diagramme zeigen eine Sache pro Diagramm, mit beschrifteten Achsen und einem Satz dazu, was man sieht.
- Leere Bildschirme sagen, was der nächste Schritt ist („Noch keine Einheiten importiert. Datei auswählen“).

**Wege**

- Navigation unten mit höchstens fünf Bereichen, z. B. Heute, Plan, Analyse, Erholung, Profil.
- Die häufigsten Handlungen brauchen höchstens zwei Tipps von der Startseite: heutige Einheit ansehen, Einheit abhaken, Datei importieren, „Nicht gut erholt“.
- Beim ersten Start führt mich die App in wenigen Schritten durch Profil, Sportarten, Ziel und ersten Plan. Jeder Schritt lässt sich überspringen und später nachholen; sinnvolle Standardwerte sind vorbelegt.
- Planerstellung als geführte Schrittfolge mit Vorschau: Ich sehe den entstehenden Plan (Wochenumfang, Entlastungswochen, Beispielwoche), während ich die Einstellungen ändere.
- Nichts geht versehentlich kaputt: Löschen und größere Änderungen sind rückgängig zu machen oder werden vorher bestätigt.
- Mit einer Hand bedienbar, ausreichend große Tippflächen, gut lesbar auch draußen in der Sonne.

Wenn eine Anforderung aus dieser Datei eine Ansicht überladen würde, sag es mir und schlag eine einfachere Lösung vor, statt alles hineinzupacken.

## 13. Vorgehen

Arbeite in Etappen. Am Ende jeder Etappe läuft die App, die Tests sind grün, und du zeigst mir kurz, was neu ist und wie ich es ausprobiere. Dann wartest du auf meine Rückmeldung.

1. **Fundament:** Projekt aufsetzen, unslop-Skill installieren, Designrichtung vorschlagen und abstimmen, Datenmodell, Navigation und Bedienkonzept nach Abschnitt 12 (zeig mir zuerst eine Skizze der Bereiche und Wege), geführter erster Start, Einstellungen und Profil mit Zonenberechnung
2. **Pläne Laufen:** Recherche und `docs/trainingslehre.md`, Vorlagen, eigener Baukasten mit Entlastungswochen, Kalender- und Wochenansicht, Wochentausch
3. **Weitere Sportarten:** Rad, Schwimmen, Triathlon, Kraft, jeweils Vorlagen und Baukasten
4. **Kombination und Anpassung:** mehrere Pläne zusammenlegen, Konfliktregeln, laufende Pläne bearbeiten, pausieren und neu berechnen, bestehende Pläne in neue Planungen übernehmen, Archiv
5. **Import:** GPX, TCX, FIT, CSV, Zuordnung zu geplanten Einheiten, manuelle Erfassung
6. **Dashboard und Analyse**
7. **Erholung:** HRV-Eingabe, Erinnerung, Auswertung und Planvorschläge, Funktion „Nicht gut erholt“ bei jeder Einheit
8. **Feinschliff:** vollständiger unslop-Durchgang über alle Bildschirme, Offline-Betrieb, Datensicherung

Die Android-App baust du schon am Ende von Etappe 1 zum ersten Mal, damit ich jede Etappe direkt auf dem Handy testen kann.

Beginne mit Etappe 1. Stell mir vorher alle Fragen, die du hast.
