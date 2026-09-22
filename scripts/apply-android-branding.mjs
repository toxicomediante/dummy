import { mkdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import sharp from 'sharp'

const res = resolve('android/app/src/main/res')
const source = resolve('public/branding/dummy-icon-source.png')

const mipmapNodpi = resolve(res, 'mipmap-nodpi')
const drawableNodpi = resolve(res, 'drawable-nodpi')
const adaptive = resolve(res, 'mipmap-anydpi-v26')
const values = resolve(res, 'values')

for (const directory of [mipmapNodpi, drawableNodpi, adaptive, values]) {
  await mkdir(directory, { recursive: true })
}

for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
  await rm(resolve(res, `mipmap-${density}`), { recursive: true, force: true })
}

const makeCircularArtwork = async (size) => {
  const resized = await sharp(source)
    .resize(size, size, { fit: 'contain' })
    .png()
    .toBuffer()

  const mask = Buffer.from(`
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/>
    </svg>
  `)

  return sharp(resized)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer()
}

const adaptiveArtworkSize = 640
const legacyArtworkSize = 760
const canvasSize = 1024

const adaptiveArtwork = await makeCircularArtwork(adaptiveArtworkSize)
const legacyArtwork = await makeCircularArtwork(legacyArtworkSize)

const foreground = await sharp({
  create: {
    width: canvasSize,
    height: canvasSize,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite([{
    input: adaptiveArtwork,
    left: Math.round((canvasSize - adaptiveArtworkSize) / 2),
    top: Math.round((canvasSize - adaptiveArtworkSize) / 2),
  }])
  .png()
  .toBuffer()

const legacy = await sharp({
  create: {
    width: canvasSize,
    height: canvasSize,
    channels: 4,
    background: { r: 2, g: 4, b: 3, alpha: 1 },
  },
})
  .composite([{
    input: legacyArtwork,
    left: Math.round((canvasSize - legacyArtworkSize) / 2),
    top: Math.round((canvasSize - legacyArtworkSize) / 2),
  }])
  .png()
  .toBuffer()

await writeFile(resolve(mipmapNodpi, 'ic_launcher.png'), legacy)
await writeFile(resolve(mipmapNodpi, 'ic_launcher_round.png'), legacy)
await writeFile(resolve(drawableNodpi, 'dummy_icon_foreground.png'), foreground)

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

console.log(`Dummy Android icon generated from source: adaptive artwork ${adaptiveArtworkSize}px / ${canvasSize}px.`)
