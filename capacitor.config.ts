import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'de.franzkoe.myplan',
  appName: 'MyPlan',
  webDir: 'dist',
  android: { allowMixedContent: false },
  plugins: {
    LocalNotifications: { smallIcon: 'ic_stat_myplan', iconColor: '#B4472B' },
  },
}
export default config
