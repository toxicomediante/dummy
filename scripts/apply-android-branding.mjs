import { mkdir, rm, writeFile, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import sharp from 'sharp'

const main = resolve('android/app/src/main')
const res = resolve(main, 'res')
const source = resolve('public/branding/dummy-icon-source.png')
const name = 'dummy_artwork_fullbleed'
const densities = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 }

for (const dir of ['mipmap-anydpi-v26', 'mipmap-anydpi-v33', 'mipmap-nodpi']) {
  await rm(resolve(res, dir), { recursive: true, force: true })
}
for (const [density, size] of Object.entries(densities)) {
  const dir = resolve(res, 'mipmap-' + density)
  await mkdir(dir, { recursive: true })
  // Same full-bleed approach as the parent YOSE app. No inset artwork or circular mask.
  await sharp(source).resize(size, size, { fit: 'cover' }).flatten({ background: '#020303' }).png().toFile(resolve(dir, name + '.png'))
  const adaptiveSize = Math.round(size * 2.25)
  await sharp(source).resize(adaptiveSize, adaptiveSize, { fit: 'cover' }).flatten({ background: '#020303' }).png().toFile(resolve(dir, name + '_foreground.png'))
}
const adaptive = resolve(res, 'mipmap-anydpi-v26')
await mkdir(adaptive, { recursive: true })
const xml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/${name}_foreground"/>
    <foreground android:drawable="@mipmap/${name}_foreground"/>
</adaptive-icon>
`
await writeFile(resolve(adaptive, name + '.xml'), xml)
const manifest = resolve(main, 'AndroidManifest.xml')
const original = await readFile(manifest, 'utf8')
const updated = original.replace(/android:icon="[^"]+"/, `android:icon="@mipmap/${name}"`)
  .replace(/android:roundIcon="[^"]+"/, `android:roundIcon="@mipmap/${name}"`)
if (!updated.includes(`android:icon="@mipmap/${name}"`) || updated === original) throw new Error('Icon manifest replacement failed')
await writeFile(manifest, updated)
const gradle = resolve('android/app/build.gradle')
const before = await readFile(gradle, 'utf8')
const build = Number(process.env.GITHUB_RUN_NUMBER || 2)
if (!Number.isInteger(build) || build < 1) throw new Error('Invalid build number')
const after = before.replace(/versionCode\s+\d+/, `versionCode ${1000 + build}`)
  .replace(/versionName\s+"[^"]+"/, `versionName "0.1.${build}"`)
if (after === before || !after.includes(`versionCode ${1000 + build}`)) throw new Error('Version replacement failed')
await writeFile(gradle, after)
console.log(`DUMMY 0.1.${build}: full-bleed artwork, new manifest icon resource, versionCode ${1000+build}.`)
