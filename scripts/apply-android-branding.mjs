import { mkdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import sharp from 'sharp'

const res = resolve('android/app/src/main/res')
const source = resolve('public/branding/dummy-icon-source.png')
const mipmap = resolve(res, 'mipmap-nodpi')

// Do not advertise an adaptive icon: its background is displayed as a
// separate launcher circle. Keep the original artwork as a transparent bitmap.
for (const dir of ['mipmap-mdpi', 'mipmap-hdpi', 'mipmap-xhdpi', 'mipmap-xxhdpi',
  'mipmap-xxxhdpi', 'mipmap-anydpi-v26', 'mipmap-anydpi-v33', 'mipmap-nodpi']) {
  await rm(resolve(res, dir), { recursive: true, force: true })
}
await mkdir(mipmap, { recursive: true })
await rm(resolve(res, 'values/dummy_icon_colors.xml'), { force: true })
await rm(resolve(res, 'drawable-nodpi/dummy_icon_foreground.png'), { force: true })
await rm(resolve(res, 'drawable-nodpi/dummy_icon_foreground.webp'), { force: true })

const size = 512
const artwork = await sharp(source).ensureAlpha().resize(size, size, {
  fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }
}).png().toBuffer()
const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size/2}" cy="${size/2}" r="${size/2}" fill="white"/></svg>`)
const icon = await sharp(artwork).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer()
const { data, info } = await sharp(icon).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
if (data[3] !== 0 || data[(info.width - 1) * 4 + 3] !== 0) {
  throw new Error('Launcher artwork must have transparent corners')
}
await writeFile(resolve(mipmap, 'ic_launcher.png'), icon)
await writeFile(resolve(mipmap, 'ic_launcher_round.png'), icon)
console.log('DUMMY: original artwork, transparent outside, no adaptive background or extra padding.')
