// „Worauf beruht dieser Plan“: kurze Abschnitte für die App. Ausführlich in docs/trainingslehre.md
export interface Basis {
  id: string
  title: string
  text: string
  sources: string[]
  /** ehrlicher Hinweis, wo die Studienlage dünn oder umstritten ist */
  caveat?: string
}

export const BASIS: Record<string, Basis> = {
  verteilung: {
    id: 'verteilung',
    title: 'Viel locker, wenig hart',
    text: 'Erfolgreiche Ausdauersportler absolvieren etwa 80 % ihrer Einheiten locker und etwa 20 % intensiv. Der Plan hält sich daran: höchstens zwei harte Einheiten pro Woche, dazwischen mindestens ein lockerer Tag.',
    sources: ['Seiler & Kjerland 2006, Scand J Med Sci Sports', 'Seiler 2010, Int J Sports Physiol Perform', 'Stöggl & Sperlich 2015, Front Physiol'],
    caveat: 'Die 80/20-Verteilung ist eine Beobachtung an Leistungssportlern mit sehr hohen Umfängen, gezählt nach Einheiten. Ob sie für Freizeitsportler mit drei Einheiten pro Woche das Optimum ist, ist nicht belegt. Bei drei Einheiten ist hier eine davon hart.',
  },
  laufen: {
    id: 'laufen',
    title: 'Lauftempo aus deinem Leistungsstand',
    text: 'Die Tempobereiche (locker, Marathon, Schwelle, Intervall, Wiederholung) folgen dem VDOT-Modell von Jack Daniels: Aus einer Wettkampfzeit wird ein Kennwert berechnet, aus dem sich Trainingstempi ableiten. Die Abfolge der Phasen (Grundlage, Aufbau, wettkampfnah) und lange Läufe mit Abschnitten im Marathontempo orientieren sich an Daniels und Pfitzinger.',
    sources: ['Daniels & Gilbert 1979, Oxygen Power', "Daniels, Daniels' Running Formula", 'Pfitzinger & Douglas, Advanced Marathoning'],
    caveat: 'Das Modell passt für die meisten Läufer gut, im Einzelfall können Tempi um einige Sekunden pro Kilometer abweichen. Ein VO2max-Wert der Uhr ist nur eine Schätzung. Die Pläne sind eigene Zusammenstellungen nach diesen Prinzipien, keine Kopien aus den Büchern.',
  },
  ultra: {
    id: 'ultra',
    title: 'Ultra: das Spezifische zuletzt',
    text: 'Nach Jason Koop kommt das, was dem Wettkampf am wenigsten ähnelt, am Anfang: erst Intervalle, dann Schwelle, zum Schluss lange, gleichmäßige Einheiten. Lange Läufe werden nach Zeit geplant, mit Höhenmetern und Verpflegung wie im Rennen.',
    sources: ['Koop, Training Essentials for Ultrarunning'],
    caveat: 'Für Ultraläufe gibt es kaum kontrollierte Studien. Die Empfehlungen stammen überwiegend aus Trainerpraxis.',
  },
  rad: {
    id: 'rad',
    title: 'Steuerung über FTP und Leistungszonen',
    text: 'Die sieben Leistungszonen nach Andrew Coggan beziehen sich auf die FTP, die Leistung, die du etwa eine Stunde halten kannst. Sweet Spot (88 bis 94 % der FTP) bringt viel Reiz bei vertretbarer Ermüdung. Ohne Leistungsmesser gelten die entsprechenden Pulszonen.',
    sources: ['Allen, Coggan & McGregor, Training and Racing with a Power Meter', 'Coggan, Power Training Zones'],
    caveat: 'Die FTP aus einem 20-Minuten-Test (95 % der Durchschnittsleistung) überschätzt bei manchen Fahrern die echte Stundenleistung. Sweet-Spot-Training ist in der Praxis verbreitet, direkte Vergleichsstudien gegen andere Verteilungen sind selten.',
  },
  schwimmen: {
    id: 'schwimmen',
    title: 'Schwimmtempo aus der Critical Swim Speed',
    text: 'Die CSS wird aus einem 400-m- und einem 200-m-Test berechnet und entspricht etwa dem Tempo an der Schwelle. Alle Sätze sind relativ dazu angegeben. Technikübungen stehen in jeder Einheit, weil Technik im Wasser mehr bringt als Kondition allein.',
    sources: ['Wakayoshi et al. 1992, Eur J Appl Physiol', 'Ginn 1993, Australian Sports Commission'],
    caveat: 'Die CSS aus zwei Tests überschätzt das echte Schwellentempo bei manchen Schwimmern leicht. Die App rechnet deshalb mit kurzen Pausen und nicht mit durchgehendem Schwimmen im CSS-Tempo.',
  },
  triathlon: {
    id: 'triathlon',
    title: 'Drei Disziplinen, ein Plan',
    text: 'Die Periodisierung folgt Joe Friel: Grundlage, Aufbau, wettkampfnahe Phase, Tapering. Etwa die Hälfte der Zeit entfällt auf das Rad, knapp ein Drittel auf das Laufen, der Rest auf das Schwimmen. Jede Woche enthält eine Koppeleinheit. Schwimmeinheiten zählen wegen der geringen Belastung für Gelenke und Sehnen nicht als harte Einheit.',
    sources: ["Friel, The Triathlete's Training Bible"],
    caveat: 'Die Zeitaufteilung ist ein üblicher Richtwert. Wer in einer Disziplin deutlich schwächer ist, sollte den Plan im Baukasten entsprechend anpassen.',
  },
  kraft: {
    id: 'kraft',
    title: 'Progressive Überlastung und Volumen',
    text: 'Muskeln und Kraft wachsen, wenn die Anforderung schrittweise steigt. Für Muskelaufbau zeigen Übersichtsarbeiten mehr Zuwachs bei zehn oder mehr Sätzen pro Muskelgruppe und Woche. Die Nähe zum Muskelversagen wird über RIR gesteuert, die Zahl der Wiederholungen, die am Satzende noch möglich wären. Innerhalb eines Blocks steigt die Last linear, bei „gemischt“ wechseln schwere, mittlere und leichte Tage (wellenförmig).',
    sources: ['Schoenfeld, Ogborn & Krieger 2017, J Sports Sci', 'Helms et al. 2016, Strength Cond J (RIR-Skala)', 'Zourdos et al. 2016, J Strength Cond Res', 'Rhea et al. 2002, J Strength Cond Res'],
    caveat: 'Wie viel Volumen optimal ist, unterscheidet sich stark zwischen Personen. Ob wellenförmige oder lineare Periodisierung überlegen ist, ist nicht eindeutig. Das geschätzte 1RM nach Epley ist über etwa zehn Wiederholungen ungenau.',
  },
  interferenz: {
    id: 'interferenz',
    title: 'Kraft und Ausdauer zusammen',
    text: 'Schweres Krafttraining verbessert die Laufökonomie und die Leistung auf dem Rad. Damit sich beide Reize nicht stören, liegen Krafteinheiten nicht am Tag vor harten Ausdauereinheiten, und am selben Tag sollen mehrere Stunden dazwischen liegen.',
    sources: ['Wilson et al. 2012, J Strength Cond Res', 'Schumann et al. 2022, Sports Med', 'Rønnestad & Mujika 2014, Scand J Med Sci Sports'],
    caveat: 'Der Interferenzeffekt ist kleiner als lange angenommen: Eine neuere Übersichtsarbeit (Schumann 2022) fand keine Einbußen bei Maximalkraft und Muskelaufbau, nur bei der Schnellkraft, vor allem bei beiden Einheiten direkt hintereinander.',
  },
  entlastung: {
    id: 'entlastung',
    title: 'Entlastungswochen',
    text: 'Nach drei Aufbauwochen folgt eine Woche mit etwa einem Drittel weniger Umfang, die Intensität bleibt in kleiner Dosis erhalten. Anpassung geschieht in der Erholung. Im Kraftraum entspricht das einer Deload-Woche.',
    sources: ['Issurin 2010, Sports Med (Blockperiodisierung)', 'Bell et al. 2023, Sports Med Open (Deload-Konsens)'],
    caveat: 'Der Rhythmus 3:1 ist bewährte Praxis, aber nicht gegen andere Rhythmen experimentell abgesichert. Die 10-%-Regel für die Wochensteigerung ist eine Faustregel: In der einzigen großen randomisierten Studie (Buist 2008) verletzten sich Laufanfänger mit 10 % Steigerung genauso häufig wie die Vergleichsgruppe.',
  },
  tapering: {
    id: 'tapering',
    title: 'Tapering vor dem Wettkampf',
    text: 'In den letzten ein bis drei Wochen sinkt der Umfang schrittweise um 40 bis 60 %, Intensität und Häufigkeit bleiben weitgehend. So verschwindet die Ermüdung, die Fitness bleibt.',
    sources: ['Bosquet et al. 2007, Med Sci Sports Exerc', 'Mujika & Padilla 2003, Med Sci Sports Exerc'],
    caveat: 'Die Meta-Analyse nennt zwei Wochen als wirksamste Dauer. Drei Wochen vor Marathon und Langdistanz sind Trainerpraxis, kein Studienergebnis.',
  },
  hrv: {
    id: 'hrv',
    title: 'Erholung über HRV und Ruhepuls',
    text: 'Verglichen wird mit deinem eigenen Normalbereich aus den letzten vier bis acht Wochen, nicht mit Normwerten. Wochenmittel sind aussagekräftiger als einzelne Tageswerte. Erst wenn HRV deutlich gedrückt und der Ruhepuls erhöht ist, schlägt die App Änderungen vor.',
    sources: ['Kiviniemi et al. 2007, Eur J Appl Physiol', 'Plews et al. 2013, Sports Med', 'Vesterinen et al. 2016, Med Sci Sports Exerc'],
    caveat: 'HRV-Messungen von Uhren und Bändern sind unterschiedlich genau und untereinander nicht vergleichbar. Bleib bei einem Gerät. Die Auswertung ist ein Hinweis zur Trainingssteuerung und keine medizinische Aussage.',
  },
  belastung: {
    id: 'belastung',
    title: 'Belastung, Fitness und Form',
    text: 'Jede Einheit bekommt einen Belastungswert aus Leistung oder Puls. Daraus entstehen Fitness (Mittel über 42 Tage), Ermüdung (7 Tage) und Form (Differenz). Das Modell geht auf Banister zurück.',
    sources: ['Banister 1991 (Impulse-Response-Modell)', 'Allen & Coggan (TSS, CTL, ATL, TSB)'],
    caveat: 'Das Modell beschreibt die Belastung, es sagt die Leistung nicht zuverlässig voraus. Werte aus Puls, Leistung und gefühlter Anstrengung sind nur grob vergleichbar.',
  },
}
