import { rm } from 'node:fs/promises'

const generatedOnly = [
  'dist/models/anatomy.glb',
  'dist/models/mesh_mapping.txt',
  'dist/models/mesh_mapping.json',
  'dist/models/placeholder'
]

for (const path of generatedOnly) {
  await rm(path, { force: true })
}

console.log('Removed model source files from dist; keeping bodyparts-yose.glb only.')
