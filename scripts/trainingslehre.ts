// Erzeugt docs/trainingslehre.md aus den Angaben, die auch die App anzeigt. Aufruf: npm run docs
import { writeFileSync } from 'node:fs'
import { BASIS } from '../src/logic/basis'
import { GOALS, LEVEL_NAME, SPORT_NAME, WEEK_TEMPLATES } from '../src/logic/templates'
import { VOLUME_UNIT } from '../src/logic/generator'
import type { Sport } from '../src/logic/types'

let md = `# Trainingslehre: worauf die Pläne beruhen

Diese Datei wird aus \`src/logic/basis.ts\` und \`src/logic/templates.ts\` erzeugt (\`npm run docs\`). Dieselben Texte stehen in der App bei jedem Plan unter „Worauf beruht dieser Plan“.

Die Pläne sind eigene Zusammenstellungen nach den Prinzipien der genannten Quellen. Es wurden keine Pläne aus Büchern übernommen. Wo die Studienlage dünn oder umstritten ist, steht das unter „Grenzen“.

## Grundlagen

`
for (const b of Object.values(BASIS)) {
  md += `### ${b.title} (\`${b.id}\`)\n\n${b.text}\n\n`
  if (b.caveat) md += `**Grenzen:** ${b.caveat}\n\n`
  md += `**Quellen:** ${b.sources.join('; ')}\n\n`
}
md += `## Umsetzung im Plangenerator

- **Wochenumfang:** Start mit dem Startumfang, Steigerung um den eingestellten Prozentsatz je Aufbauwoche. Nach einer Entlastungswoche geht es auf dem Niveau der letzten Aufbauwoche weiter.
- **Entlastungswochen:** jede vierte (oder dritte) Woche mit 65 % des Umfangs der Vorwoche, höchstens eine harte Einheit. Nie mehr als vier Aufbauwochen am Stück.
- **Tapering:** 1 bis 3 Wochen je nach Ziel mit 80 / 60 / 40 % (3 Wochen), 70 / 50 % (2 Wochen) oder 60 % (1 Woche) des höchsten Wochenumfangs.
- **Harte Einheiten:** bis 4 Einheiten pro Woche eine, darüber zwei. Nie an aufeinanderfolgenden Tagen. Die lange Einheit liegt am Wochenende.
- **Lauftempo:** VDOT-Formeln nach Daniels und Gilbert. Locker 62 bis 72 %, Schwelle 88 %, Intervall 98 % der VDOT-Geschwindigkeit; Marathon- und Wiederholungstempo aus der Zeitprognose.
- **Pulszonen:** 50 / 60 / 70 / 80 / 90 % des Maximalpulses, wahlweise nach Karvonen (Herzfrequenzreserve) oder in Prozent des Schwellenpulses. Ohne Maximalpuls: Schätzung 208 − 0,7 × Alter (Tanaka 2001), als Schätzung gekennzeichnet.
- **Leistungszonen:** sieben Zonen nach Coggan mit Grenzen bei 56 / 76 / 91 / 106 / 121 / 151 % der FTP.
- **Belastung:** aus Leistung (Dauer × NP × IF), sonst aus Puls (TRIMP nach Banister, normiert auf 100 Punkte je Stunde am Schwellenpuls), sonst aus Tempo oder gefühlter Anstrengung. Fitness und Ermüdung sind exponentiell gewichtete Mittel über 42 und 7 Tage.
- **Erholung:** Normalbereich = Mittelwert ± 1 Standardabweichung der letzten 4 bis 8 Wochen (HRV logarithmiert). Vorschläge erst, wenn HRV darunter und Ruhepuls darüber liegt.
- **Kraft:** Last in Prozent des 1RM mit Steigerung um 2,5 Prozentpunkte je Woche im Block, Deload mit 60 % der Sätze und 10 Prozentpunkten weniger Last. 1RM-Schätzung nach Epley: Gewicht × (1 + Wiederholungen ÷ 30).

## Vorlagen

`
for (const sport of Object.keys(GOALS) as Sport[]) {
  md += `### ${SPORT_NAME[sport]}\n\n| Ziel | Niveau | Wochen | Einheiten/Woche | Start (${VOLUME_UNIT[sport]}/Woche) | Steigerung | Stützt sich auf |\n|---|---|---|---|---|---|---|\n`
  for (const g of GOALS[sport]) g.levels.forEach((l, i) => (md += `| ${g.name} | ${LEVEL_NAME[i]} | ${l[0]} | ${l[1]} | ${String(l[2]).replace('.', ',')} | ${String(l[3]).replace('.', ',')} % | ${g.basis.map((b) => BASIS[b].title).join(', ')} |\n`))
  md += `\n`
  for (const g of GOALS[sport]) md += `- **${g.name}:** ${g.note}. Mindestens ${g.minWeeks} Wochen.\n`
  md += `\n`
}
md += `### Einzelne Wochen\n\n`
for (const w of WEEK_TEMPLATES) md += `- **${w.name}:** ${w.note}.\n`
writeFileSync(new URL('../docs/trainingslehre.md', import.meta.url), md)
console.log('docs/trainingslehre.md geschrieben')
