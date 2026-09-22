import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { NodeIO } from '@gltf-transform/core'
import { dedup, prune } from '@gltf-transform/functions'

const SOURCE = resolve('public/models/anatomy.glb')
const MAPPING = resolve('public/models/mesh_mapping.txt')
const OUTPUT = resolve('public/models/bodyparts-yose.glb')

const PALETTE = {
  chest: '#3d4840',
  abs: '#343e37',
  obliques: '#303a33',
  lats: '#2f3932',
  upper_back: '#374139',
  lower_back: '#303a33',
  traps: '#3b463d',
  front_delts: '#414b43',
  side_delts: '#3e4940',
  rear_delts: '#39433b',
  biceps: '#3c4740',
  triceps: '#354038',
  forearms: '#303a33',
  glutes: '#39443b',
  quads: '#3e4941',
  hamstrings: '#354038',
  adductors: '#303a33',
  calves: '#374239'
}

const HEAD_NECK_TERMS = [
  'frontalis', 'occipitalis', 'temporalis', 'masseter', 'pterygoid', 'orbicularis',
  'zygomatic', 'buccinator', 'mentalis', 'nasalis', 'risorius', 'auricular', 'corrugator',
  'procerus', 'platysma', 'palpebrae', 'ocular', 'orbital', 'eyelid', 'scalp', 'facial',
  'levator labii', 'depressor labii', 'depressor anguli', 'anguli oris', 'supercilii',
  'superior rectus', 'inferior rectus', 'medial rectus', 'lateral rectus',
  'superior oblique', 'inferior oblique', 'levator palpebrae',
  'tongue', 'genioglossus', 'hyoglossus', 'styloglossus', 'palatoglossus', 'phary', 'laryn',
  'palatini', 'palatopharyngeus', 'salpingopharyngeus', 'stylopharyngeus',
  'tensor tympani', 'stapedius', 'arytenoid', 'cricothyroid', 'thyroarytenoid', 'cricoarytenoid',
  'digastric', 'mylohyoid', 'geniohyoid', 'stylohyoid', 'sternohyoid', 'thyrohyoid', 'omohyoid',
  'hyoid', 'sternocleidomastoid', 'scalen', 'longus colli', 'longus capitis', 'splenius capitis',
  'semispinalis capitis', 'spinalis capitis', 'rectus capitis', 'obliquus capitis', 'suboccipital',
  'capitis', 'colli'
]

const INTERNAL_TERMS = [
  'external anal sphincter', 'urethral sphincter', 'diaphragm', 'intercostal',
  'transversus thoracis', 'subcostal', 'levator ani', 'coccygeus'
]

function normalizeName(value = '') {
  return value.toLowerCase().replace(/[_.-]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function classifyGroup(rawName) {
  const n = normalizeName(rawName)

  if (n.includes('pectoralis') || n.includes('serratus anterior')) return 'chest'
  if (n.includes('rectus abdominis') || n.includes('transversus abdominis')) return 'abs'
  if (n.includes('external oblique') || n.includes('internal oblique') || n.includes('obliquus')) return 'obliques'
  if (n.includes('latissimus')) return 'lats'
  if (n.includes('trapezius') || n.includes('levator scapulae')) return 'traps'
  if (n.includes('rhomboid') || n.includes('supraspinatus') || n.includes('infraspinatus') || n.includes('teres major') || n.includes('teres minor')) return 'upper_back'
  if (n.includes('erector spinae') || n.includes('iliocostalis') || n.includes('longissimus') || n.includes('spinalis') || n.includes('multifidus') || n.includes('quadratus lumborum')) return 'lower_back'

  if (n.includes('deltoid')) {
    if (n.includes('anterior') || n.includes('clavicular')) return 'front_delts'
    if (n.includes('posterior') || n.includes('spinal')) return 'rear_delts'
    return 'side_delts'
  }

  if (n.includes('biceps brachii') || n.includes('brachialis') || n.includes('coracobrachialis')) return 'biceps'
  if (n.includes('triceps brachii') || n.includes('anconeus')) return 'triceps'
  if (
    n.includes('brachioradialis') || n.includes('pronator') || n.includes('supinator') ||
    n.includes('flexor carpi') || n.includes('extensor carpi') || n.includes('flexor digitorum') ||
    n.includes('extensor digitorum') || n.includes('palmaris') || n.includes('extensor pollicis') ||
    n.includes('flexor pollicis longus')
  ) return 'forearms'

  if (n.includes('gluteus')) return 'glutes'
  if (n.includes('rectus femoris') || n.includes('vastus') || n.includes('sartorius')) return 'quads'
  if (n.includes('biceps femoris') || n.includes('semitendinosus') || n.includes('semimembranosus')) return 'hamstrings'
  if (n.includes('adductor') || n.includes('gracilis') || n.includes('pectineus')) return 'adductors'
  if (n.includes('gastrocnemius') || n.includes('soleus') || n.includes('plantaris') || n.includes('tibialis') || n.includes('fibularis') || n.includes('peroneus')) return 'calves'

  return undefined
}

function removalReason(rawName) {
  const n = normalizeName(rawName)
  if (HEAD_NECK_TERMS.some(term => n.includes(term))) return 'head-neck'
  if (INTERNAL_TERMS.some(term => n.includes(term))) return 'internal'
  return undefined
}

function looksLikeTendon(rawName, mappingEntry) {
  if (mappingEntry?.isTendon) return true
  const n = normalizeName(rawName)
  return n.includes('tendon') || n.includes('ligament') || n.includes('fascia') ||
    n.includes('retinaculum') || n.includes('aponeuros') || n.includes('membrane')
}

function hexToFactor(hex, alpha = 1) {
  const value = Number.parseInt(hex.replace('#', ''), 16)
  return [
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
    alpha
  ]
}

const mapping = JSON.parse(await readFile(MAPPING, 'utf8'))
const mappingByName = new Map(mapping.map(entry => [normalizeName(entry.name), entry]))

const io = new NodeIO()
const document = await io.read(SOURCE)
const root = document.getRoot()

const groupMaterials = new Map()
for (const [group, hex] of Object.entries(PALETTE)) {
  const material = document.createMaterial(`YOSE // ${group.toUpperCase()}`)
    .setBaseColorFactor(hexToFactor(hex))
    .setRoughnessFactor(.82)
    .setMetallicFactor(.035)
    .setEmissiveFactor([.007, .012, .008])
    .setDoubleSided(true)
  material.setExtras({ yoseGroup: group, yoseRole: 'muscle' })
  groupMaterials.set(group, material)
}

const supportMaterial = document.createMaterial('YOSE // SUPPORT')
  .setBaseColorFactor(hexToFactor('#1a201c'))
  .setRoughnessFactor(.95)
  .setMetallicFactor(.015)
  .setEmissiveFactor([.002, .004, .002])
  .setDoubleSided(true)

const tendonMaterial = document.createMaterial('YOSE // TENDON')
  .setBaseColorFactor(hexToFactor('#454e47', .34))
  .setRoughnessFactor(.98)
  .setMetallicFactor(0)
  .setAlphaMode('BLEND')
  .setDoubleSided(true)

let removedHeadNeck = 0
let removedInternal = 0
let keptSelectable = 0
let keptSupport = 0
let keptTendon = 0
const groupCounts = new Map()

for (const node of [...root.listNodes()]) {
  const mesh = node.getMesh()
  if (!mesh) continue

  const name = node.getName() || mesh.getName() || ''
  const reason = removalReason(name)
  if (reason) {
    node.dispose()
    if (reason === 'head-neck') removedHeadNeck++
    if (reason === 'internal') removedInternal++
    continue
  }

  const normalized = normalizeName(name)
  const mappingEntry = mappingByName.get(normalized)
  const tendon = looksLikeTendon(name, mappingEntry)
  const group = tendon ? undefined : classifyGroup(name)

  if (group) {
    keptSelectable++
    groupCounts.set(group, (groupCounts.get(group) || 0) + 1)
  } else if (tendon) {
    keptTendon++
  } else {
    keptSupport++
  }

  node.setExtras({
    ...node.getExtras(),
    yoseGroup: group || null,
    yoseRole: tendon ? 'tendon' : group ? 'muscle' : 'support',
    yoseSelectable: Boolean(group),
    bpId: mappingEntry?.bpId || null,
    fmaId: mappingEntry?.fmaId || null
  })

  const material = group ? groupMaterials.get(group) : tendon ? tendonMaterial : supportMaterial
  for (const primitive of mesh.listPrimitives()) primitive.setMaterial(material)
}

await document.transform(dedup(), prune())
await io.write(OUTPUT, document)

const sourceSize = (await stat(SOURCE)).size
const outputSize = (await stat(OUTPUT)).size
const pct = Math.round((1 - outputSize / sourceSize) * 1000) / 10

console.log('\nYOSE CORPUS BUILD')
console.log(`Source: ${(sourceSize / 1024 / 1024).toFixed(2)} MB`)
console.log(`Output: ${(outputSize / 1024 / 1024).toFixed(2)} MB (${pct}% smaller)`)
console.log(`Removed head/neck meshes: ${removedHeadNeck}`)
console.log(`Removed internal meshes: ${removedInternal}`)
console.log(`Selectable meshes: ${keptSelectable}`)
console.log(`Support meshes: ${keptSupport}`)
console.log(`Tendon/fascia meshes: ${keptTendon}`)
console.log('Groups:', Object.fromEntries([...groupCounts.entries()].sort()))
