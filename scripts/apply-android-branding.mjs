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

const widgetDrawable = resolve(res, 'drawable-nodpi')
await mkdir(widgetDrawable, {recursive:true})
const widgetSize = 512
const widgetMask = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><circle cx="256" cy="256" r="256" fill="white"/></svg>')
const widgetArt = await sharp(source).resize(widgetSize,widgetSize,{fit:'cover'}).ensureAlpha().png().toBuffer()
await sharp(widgetArt).composite([{input:widgetMask,blend:'dest-in'}]).png().toFile(resolve(widgetDrawable,'dummy_widget_artwork.png'))
const widgetManifest = await readFile(manifest,'utf8')
const receivers = "<receiver android:name=\".DummySmallWidget\" android:label=\"DUMMY · 1×1\" android:exported=\"false\"><intent-filter><action android:name=\"android.appwidget.action.APPWIDGET_UPDATE\"/></intent-filter><meta-data android:name=\"android.appwidget.provider\" android:resource=\"@xml/dummy_widget_small\"/></receiver>\n<receiver android:name=\".DummyLargeWidget\" android:label=\"DUMMY · 2×2\" android:exported=\"false\"><intent-filter><action android:name=\"android.appwidget.action.APPWIDGET_UPDATE\"/></intent-filter><meta-data android:name=\"android.appwidget.provider\" android:resource=\"@xml/dummy_widget_large\"/></receiver>\n<receiver android:name=\".DummyWideWidget\" android:label=\"DUMMY · 3×3\" android:exported=\"false\"><intent-filter><action android:name=\"android.appwidget.action.APPWIDGET_UPDATE\"/></intent-filter><meta-data android:name=\"android.appwidget.provider\" android:resource=\"@xml/dummy_widget_wide\"/></receiver>"
if (!widgetManifest.includes('</application>')) throw new Error('Missing application manifest')
await writeFile(manifest,widgetManifest.replace('</application>',receivers+'\n</application>'))
