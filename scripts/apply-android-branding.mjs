import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const res = resolve('android/app/src/main/res')
const foreground = resolve('assets/android/dummy-icon-foreground.webp')
const legacy = resolve('assets/android/dummy-icon-legacy.webp')

const mipmapNodpi = resolve(res, 'mipmap-nodpi')
const drawableNodpi = resolve(res, 'drawable-nodpi')
const adaptive = resolve(res, 'mipmap-anydpi-v26')
const values = resolve(res, 'values')

for (const directory of [mipmapNodpi, drawableNodpi, adaptive, values]) {
  await mkdir(directory, { recursive: true })
}

// Remove Capacitor's generated density-specific launchers so Android cannot fall
// back to the default square icon on some launchers.
for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
  await rm(resolve(res, `mipmap-${density}`), { recursive: true, force: true })
}

await copyFile(legacy, resolve(mipmapNodpi, 'ic_launcher.webp'))
await copyFile(legacy, resolve(mipmapNodpi, 'ic_launcher_round.webp'))
await copyFile(foreground, resolve(drawableNodpi, 'dummy_icon_foreground.webp'))

await writeFile(resolve(values, 'dummy_icon_colors.xml'), `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="dummy_icon_background">#020403</color>
</resources>
`)

const adaptiveXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/dummy_icon_background" />
    <foreground android:drawable="@drawable/dummy_icon_foreground" />
</adaptive-icon>
`

await writeFile(resolve(adaptive, 'ic_launcher.xml'), adaptiveXml)
await writeFile(resolve(adaptive, 'ic_launcher_round.xml'), adaptiveXml)

console.log('Dummy Android adaptive launcher icon applied.')
