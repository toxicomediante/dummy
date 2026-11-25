import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.yosesproject.dummy',
  appName: 'Dummy',
  webDir: 'dist',
  plugins: {
    SystemBars: { insetsHandling: 'disable', style: 'DARK', hidden: false },
  }
}

export default config
