import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const res = resolve('android/app/src/main/res')
const source = resolve('public/branding/dummy-icon-source.png')

const mipmapNodpi = resolve(res, 'mipmap-nodpi')
const drawableNodpi = resolve(res, 'drawable-nodpi')
const adaptive = resolve(res, 'mipmap-anydpi-v26')
const values = resolve(res, 'values')

for (const directory of [mipmapNodpi, drawableNodpi, adaptive, values]) {
  await mkdir(directory, { recursive: true })
}

// Remove Capacitor's generated density-specific launchers so Android cannot fall
// back to its default icon on some launchers.
for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
  await rm(resolve(res, `mipmap-${density}`), { recursive: true, force: true })
}

// The repository PNG is the single source of truth for Dummy branding.
await copyFile(source, resolve(mipmapNodpi, 'ic_launcher.png'))
await copyFile(source, resolve(mipmapNodpi, 'ic_launcher_round.png'))
await copyFile(source, resolve(drawableNodpi, 'dummy_icon_foreground.png'))

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

console.log('Dummy Android launcher icon applied from public/branding/dummy-icon-source.png.')
