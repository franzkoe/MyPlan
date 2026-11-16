// Brücke zu Android (Capacitor). Im Browser gibt es einfache Entsprechungen.
import { App as CapApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { LocalNotifications } from '@capacitor/local-notifications'
import { Share } from '@capacitor/share'
import type { Profile } from './logic/types'

export const isNative = Capacitor.isNativePlatform()

/** Wöchentliche Erinnerung als lokale Benachrichtigung, ohne Server */
export async function scheduleReminder(r: Profile['reminder'], ask = false): Promise<'ok' | 'denied' | 'browser'> {
  if (!isNative) return 'browser'
  try {
    await LocalNotifications.cancel({ notifications: [{ id: 1 }] })
    if (!r.enabled) return 'ok'
    let perm = await LocalNotifications.checkPermissions()
    if (perm.display !== 'granted' && ask) perm = await LocalNotifications.requestPermissions()
    if (perm.display !== 'granted') return 'denied'
    const [hour, minute] = r.time.split(':').map(Number)
    await LocalNotifications.schedule({
      notifications: [
        {
          id: 1,
          title: 'Erholungsdaten eintragen',
          body: 'HRV, Ruhepuls und Schlaf der Woche. Dauert eine Minute',
          // Capacitor zählt 1 = Sonntag … 7 = Samstag, die App 0 = Montag … 6 = Sonntag
          schedule: { on: { weekday: ((r.weekday + 1) % 7) + 1, hour: hour || 18, minute: minute || 0 }, allowWhileIdle: true },
        },
      ],
    })
    return 'ok'
  } catch {
    return 'denied'
  }
}

/** Sicherung speichern: auf dem Handy über „Teilen“ (z. B. in Dateien sichern), im Browser als Download */
export async function saveFile(name: string, content: string): Promise<string> {
  if (!isNative) {
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
    return 'Die Datei liegt im Download-Ordner'
  }
  let where = ''
  try {
    await Filesystem.writeFile({ path: `MyPlan/${name}`, data: content, directory: Directory.Documents, encoding: Encoding.UTF8, recursive: true })
    where = `Gespeichert unter Dokumente/MyPlan/${name}`
  } catch {
    /* manche Geräte erlauben den direkten Zugriff nicht, dann nur Teilen */
  }
  try {
    const f = await Filesystem.writeFile({ path: name, data: content, directory: Directory.Cache, encoding: Encoding.UTF8 })
    await Share.share({ title: name, files: [f.uri], dialogTitle: 'Sicherung speichern oder senden' })
  } catch {
    if (!where) throw new Error('Die Sicherung konnte nicht gespeichert werden')
  }
  return where || 'Sicherung geteilt'
}

export function onBack(handler: () => boolean): () => void {
  if (!isNative) return () => {}
  const p = CapApp.addListener('backButton', () => {
    if (!handler()) CapApp.exitApp()
  })
  return () => void p.then((h) => h.remove())
}
