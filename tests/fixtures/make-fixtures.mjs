// Erzeugt die Beispiel-Dateien für die Import-Tests. Aufruf: npm run fixtures
import { Encoder, Profile } from '@garmin/fitsdk'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const out = (name, data) => writeFileSync(join(dir, name), data)

// --- GPX: 10 km Lauf, 50 min, Puls steigt leicht ---
{
  const start = Date.UTC(2026, 9, 6, 6, 30, 0)
  let pts = ''
  const n = 600 // alle 5 s
  for (let i = 0; i <= n; i++) {
    const t = new Date(start + i * 5000).toISOString()
    const lat = 48.137 + (i * 16.6667) / 111320 // 16,67 m je Punkt nach Norden = 3,333 m/s
    const ele = 520 + 10 * Math.sin(i / 60)
    const hr = Math.round(138 + (i / n) * 8)
    pts += `<trkpt lat="${lat.toFixed(6)}" lon="11.575000"><ele>${ele.toFixed(1)}</ele><time>${t}</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${hr}</gpxtpx:hr><gpxtpx:cad>86</gpxtpx:cad></gpxtpx:TrackPointExtension></extensions></trkpt>\n`
  }
  out('lauf.gpx', `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Garmin Connect" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
<metadata><time>${new Date(start).toISOString()}</time></metadata>
<trk><name>Lockerer Lauf</name><type>running</type><trkseg>
${pts}</trkseg></trk></gpx>`)
  out('route_ohne_zeit.gpx', `<?xml version="1.0"?><gpx version="1.1"><trk><name>Route</name><trkseg><trkpt lat="48.1" lon="11.5"/><trkpt lat="48.2" lon="11.6"/></trkseg></trk></gpx>`)
  out('kaputt.gpx', `<?xml version="1.0"?><gpx version="1.1"><trk><trkseg><trkpt lat="48.1" lon="11.5"><time>2026-10-06T06:30:00Z</ti`)
}

// --- TCX: 60 min Rad mit Leistung ---
{
  const start = Date.UTC(2026, 9, 8, 15, 0, 0)
  let pts = ''
  for (let i = 0; i <= 720; i++) {
    const t = new Date(start + i * 5000).toISOString()
    pts += `<Trackpoint><Time>${t}</Time><AltitudeMeters>${(500 + i * 0.2).toFixed(1)}</AltitudeMeters><DistanceMeters>${(i * 41.6667).toFixed(1)}</DistanceMeters><HeartRateBpm><Value>${140 + (i % 10 === 0 ? 1 : 0)}</Value></HeartRateBpm><Cadence>88</Cadence><Extensions><ns3:TPX><ns3:Watts>${i % 2 ? 210 : 190}</ns3:Watts></ns3:TPX></Extensions></Trackpoint>\n`
  }
  out('rad.tcx', `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2">
<Activities><Activity Sport="Biking"><Id>${new Date(start).toISOString()}</Id>
<Lap StartTime="${new Date(start).toISOString()}"><TotalTimeSeconds>3600</TotalTimeSeconds><DistanceMeters>30000</DistanceMeters><Track>
${pts}</Track></Lap></Activity></Activities></TrainingCenterDatabase>`)
}

// --- FIT: 40 min Rad, 1-s-Aufzeichnung mit Puls, Leistung, Trittfrequenz ---
{
  const start = new Date(Date.UTC(2026, 9, 10, 7, 0, 0))
  const enc = new Encoder()
  enc.onMesg(Profile.MesgNum.FILE_ID, { type: 'activity', manufacturer: 'development', product: 1, timeCreated: start, serialNumber: 1234 })
  const n = 2400
  for (let i = 0; i < n; i++) {
    enc.onMesg(Profile.MesgNum.RECORD, {
      timestamp: new Date(start.getTime() + i * 1000),
      heartRate: 135 + Math.round((i / n) * 10),
      power: i >= 600 && i < 1800 ? 250 : 150,
      cadence: 90,
      distance: i * 8.5,
      enhancedAltitude: 400 + i * 0.05,
      enhancedSpeed: 8.5,
    })
  }
  enc.onMesg(Profile.MesgNum.SESSION, {
    timestamp: new Date(start.getTime() + n * 1000),
    startTime: start,
    sport: 'cycling',
    subSport: 'road',
    totalElapsedTime: n,
    totalTimerTime: n,
    totalDistance: n * 8.5,
    avgHeartRate: 140,
    maxHeartRate: 145,
    avgPower: 200,
    totalAscent: 120,
  })
  enc.onMesg(Profile.MesgNum.ACTIVITY, { timestamp: new Date(start.getTime() + n * 1000), numSessions: 1, type: 'manual', event: 'activity', eventType: 'stop' })
  const bytes = enc.close()
  out('rad.fit', Buffer.from(bytes))
  out('kaputt.fit', Buffer.from(bytes).subarray(0, 300))
}

// --- CSV ---
out('whoop_workouts.csv', `Cycle start time,Cycle end time,Cycle timezone,Workout start time,Workout end time,Duration (min),Activity name,Activity Strain,Energy burned (cal),Max HR (bpm),Average HR (bpm),HR Zone 1 %,HR Zone 2 %,HR Zone 3 %,HR Zone 4 %,HR Zone 5 %,GPS enabled,Distance (meters),Altitude gain (meters),Altitude change (meters)
2026-10-11 23:05:10,2026-10-12 22:58:44,UTC+02:00,2026-10-12 17:30:00,2026-10-12 18:22:00,52,Running,11.4,560,171,149,10,45,30,13,2,true,9100,60,2
2026-10-12 22:58:44,2026-10-13 23:10:02,UTC+02:00,2026-10-13 18:00:00,2026-10-13 18:55:00,55,Weightlifting,7.2,310,142,112,60,30,10,0,0,false,,,
`)
out('whoop_physiological_cycles.csv', `Cycle start time,Cycle end time,Cycle timezone,Recovery score %,Resting heart rate (bpm),Heart rate variability (ms),Skin temp (celsius),Blood oxygen %,Day Strain,Energy burned (cal),Max HR (bpm),Average HR (bpm),Sleep onset,Wake onset,Sleep performance %,Respiratory rate (rpm),Asleep duration (min)
2026-10-04 23:10:11,2026-10-05 22:50:00,UTC+02:00,71,48,62,33.5,97,12.1,2500,165,66,2026-10-04 23:10:11,2026-10-05 06:50:00,88,14.2,440
2026-10-05 22:50:00,2026-10-06 23:00:00,UTC+02:00,65,49,58,33.6,97,10.3,2400,160,65,2026-10-05 22:50:00,2026-10-06 06:30:00,85,14.0,430
2026-10-06 23:00:00,2026-10-07 23:05:00,UTC+02:00,80,47,66,33.4,98,8.1,2300,150,63,2026-10-06 23:00:00,2026-10-07 07:00:00,92,13.9,455
2026-10-12 23:00:00,2026-10-13 23:05:00,UTC+02:00,44,53,45,33.9,96,14.0,2700,172,70,2026-10-12 23:00:00,2026-10-13 06:00:00,70,14.8,390
`)
out('garmin_activities.csv', `Aktivitätstyp;Datum;Favorit;Titel;Distanz;Kalorien;Zeit;Ø Herzfrequenz;Maximale Herzfrequenz;Anstieg gesamt
Laufen;2026-10-14 07:10:00;false;München Laufen;"12,02";780;01:02:30;146;163;85
Radfahren;2026-10-15 16:00:00;false;Feierabendrunde;"45,60";900;01:45:00;132;158;420
Schwimmbadschwimmen;2026-10-16 06:30:00;false;Schwimmbad;"2.000";450;00:42:10;128;150;--
`)
out('erholung_eigen.csv', `Datum;HRV;Ruhepuls;Schlaf
01.10.2026;61;48;7,5
02.10.2026;59;49;7,0
03.10.2026;abc;;
`)
out('unbekannt.csv', `Name;Wert\nA;1\n`)
out('leer.csv', '')
console.log('Beispiel-Dateien geschrieben')
