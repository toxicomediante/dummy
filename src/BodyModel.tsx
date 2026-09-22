import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import type { MuscleId, MuscleMetric } from './types'

interface Props {
  metrics: MuscleMetric[]
  selectedMuscle?: MuscleId
  onSelectMuscle: (muscle?: MuscleId) => void
}

const BODY_MODEL_URL = 'https://raw.githubusercontent.com/JohanBellander/BodyExplorer/main/public/anatomy.glb'
const acid = new THREE.Color('#cfff1a')
const unclassified = new THREE.Color('#202622')
const tendon = new THREE.Color('#373d38')

const MUSCLE_BASE: Record<MuscleId, string> = {
  chest: '#5c675f',
  lats: '#465249',
  upper_back: '#505b53',
  lower_back: '#465149',
  traps: '#59635b',
  front_delts: '#606a62',
  side_delts: '#5d685f',
  rear_delts: '#566159',
  biceps: '#5b665f',
  triceps: '#515d55',
  forearms: '#4c5850',
  quads: '#5e6961',
  hamstrings: '#515d55',
  glutes: '#566159',
  calves: '#536057',
  adductors: '#4c5850',
  abs: '#535f57',
  obliques: '#4b574f'
}

const HEAD_NECK_TERMS = [
  'head', 'face', 'facial', 'skull', 'cranium', 'scalp', 'eye', 'orbital', 'palpebrae',
  'frontalis', 'occipitalis', 'temporalis', 'masseter', 'pterygoid', 'orbicularis', 'zygomatic',
  'mentalis', 'nasalis', 'risorius', 'auricular', 'tongue', 'lingual', 'phary', 'laryn', 'hyoid',
  'digastric', 'mylohyoid', 'geniohyoid', 'stylohyoid', 'sternohyoid', 'thyrohyoid', 'omohyoid',
  'sternocleidomastoid', 'scalen', 'splenius capitis', 'longus capitis', 'rectus capitis'
]

function normalizeName(name: string) {
  return name.toLowerCase().replace(/[_.-]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function muscleFromName(rawName: string): MuscleId | undefined {
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

function isTendonLike(name: string) {
  const n = normalizeName(name)
  return n.includes('tendon') || n.includes('ligament') || n.includes('fascia') || n.includes('retinaculum') || n.includes('aponeuros') || n.includes('membrane')
}

function shouldHideHead(mesh: THREE.Mesh, muscle?: MuscleId) {
  if (muscle) return false
  const name = normalizeName(mesh.name)
  if (HEAD_NECK_TERMS.some(term => name.includes(term))) return true

  const bounds = new THREE.Box3().setFromObject(mesh)
  if (bounds.isEmpty()) return false
  const center = bounds.getCenter(new THREE.Vector3())
  const size = bounds.getSize(new THREE.Vector3())

  // Fallback for anonymous BodyParts3D meshes in the head zone.
  return bounds.min.y > 1.55 && center.y > 1.72 && size.y < 1.45
}

function disposeObject(root: THREE.Object3D) {
  const disposedGeometry = new Set<string>()
  const disposedMaterial = new Set<string>()
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return
    if (!disposedGeometry.has(object.geometry.uuid)) {
      object.geometry.dispose()
      disposedGeometry.add(object.geometry.uuid)
    }
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    materials.forEach(material => {
      if (disposedMaterial.has(material.uuid)) return
      material.dispose()
      disposedMaterial.add(material.uuid)
    })
  })
}

function circlePoints(radius: number, segments = 96) {
  return Array.from({ length: segments }, (_, index) => {
    const angle = index / segments * Math.PI * 2
    return new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0)
  })
}

function makeLine(points: THREE.Vector3[], color: string, opacity: number, loop = false) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points)
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false })
  const line = loop ? new THREE.LineLoop(geometry, material) : new THREE.Line(geometry, material)
  line.renderOrder = -1
  return line
}

export default function BodyModel({ metrics, selectedMuscle, onSelectMuscle }: Props) {
  const host = useRef<HTMLDivElement | null>(null)
  const metricsRef = useRef(metrics)
  const selectedRef = useRef(selectedMuscle)
  metricsRef.current = metrics
  selectedRef.current = selectedMuscle

  useEffect(() => {
    if (!host.current) return

    const container = host.current
    let cancelled = false
    let loadedRoot: THREE.Object3D | null = null

    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2('#020403', .076)

    const camera = new THREE.PerspectiveCamera(30, 1, .1, 100)
    camera.position.set(0, .08, 9.2)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.02
    renderer.shadowMap.enabled = false
    renderer.domElement.style.touchAction = 'none'
    container.appendChild(renderer.domElement)

    const status = document.createElement('div')
    status.textContent = 'CARGANDO CORPUS…'
    Object.assign(status.style, {
      position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', zIndex: '7',
      padding: '9px 12px', border: '1px solid rgba(207,255,26,.28)', borderRadius: '10px',
      background: 'rgba(4,7,5,.82)', color: '#cfff1a', fontSize: '7px', fontWeight: '900',
      letterSpacing: '1.4px', pointerEvents: 'none', whiteSpace: 'nowrap'
    })
    container.appendChild(status)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enablePan = false
    controls.enableDamping = true
    controls.dampingFactor = .07
    controls.minDistance = 5.6
    controls.maxDistance = 13.5
    controls.target.set(0, .08, 0)

    scene.add(new THREE.AmbientLight('#b8c0b7', .2))
    scene.add(new THREE.HemisphereLight('#d5ddd3', '#010302', 1.0))

    const key = new THREE.DirectionalLight('#eef2eb', 2.15)
    key.position.set(4.8, 5.8, 6.2)
    scene.add(key)

    const soft = new THREE.DirectionalLight('#637268', .7)
    soft.position.set(-4.2, .8, 4.5)
    scene.add(soft)

    const rim = new THREE.DirectionalLight('#cfff1a', 2.75)
    rim.position.set(-4.4, 4.2, -5.5)
    scene.add(rim)

    const backRim = new THREE.DirectionalLight('#aab5aa', .78)
    backRim.position.set(4, 2.2, -5)
    scene.add(backRim)

    const halo = new THREE.PointLight('#cfff1a', .72, 8, 2)
    halo.position.set(0, .55, -3.2)
    scene.add(halo)

    const ritual = new THREE.Group()
    ritual.position.set(0, .25, -1.45)
    ritual.scale.set(1, 1.08, 1)
    const ritualLines = [
      makeLine(circlePoints(1.58), '#cfff1a', .085, true),
      makeLine(circlePoints(1.12), '#cbd2c9', .055, true),
      makeLine([
        new THREE.Vector3(0, 1.58, 0),
        new THREE.Vector3(-1.02, -1.18, 0),
        new THREE.Vector3(1.02, -1.18, 0)
      ], '#cbd2c9', .07, true),
      makeLine([new THREE.Vector3(0, -1.72, 0), new THREE.Vector3(0, 1.72, 0)], '#cfff1a', .06),
      makeLine([new THREE.Vector3(-1.42, .12, 0), new THREE.Vector3(1.42, .12, 0)], '#cbd2c9', .045)
    ]
    ritualLines.forEach(line => ritual.add(line))
    scene.add(ritual)

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(2.35, 96),
      new THREE.MeshBasicMaterial({ color: '#060a07', transparent: true, opacity: .86 })
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -2.19
    scene.add(ground)

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.7, 1.72, 128),
      new THREE.MeshBasicMaterial({ color: '#cfff1a', transparent: true, opacity: .2, side: THREE.DoubleSide })
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.y = -2.17
    scene.add(ring)

    const outerRing = new THREE.Mesh(
      new THREE.RingGeometry(2.12, 2.125, 128),
      new THREE.MeshBasicMaterial({ color: '#9fab9f', transparent: true, opacity: .06, side: THREE.DoubleSide })
    )
    outerRing.rotation.x = -Math.PI / 2
    outerRing.position.y = -2.165
    scene.add(outerRing)

    const muscleMeshes: THREE.Mesh[] = []
    const loader = new GLTFLoader()
    const draco = new DRACOLoader()
    draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/')
    loader.setDRACOLoader(draco)

    loader.load(
      BODY_MODEL_URL,
      gltf => {
        if (cancelled) {
          disposeObject(gltf.scene)
          return
        }

        const root = gltf.scene
        loadedRoot = root
        root.rotation.x = -Math.PI / 2
        root.updateMatrixWorld(true)

        let box = new THREE.Box3().setFromObject(root)
        const size = box.getSize(new THREE.Vector3())
        const height = Math.max(.001, size.y)
        const scale = 5.12 / height
        root.scale.multiplyScalar(scale)
        root.updateMatrixWorld(true)

        box = new THREE.Box3().setFromObject(root)
        const center = box.getCenter(new THREE.Vector3())
        root.position.x -= center.x
        root.position.z -= center.z
        root.position.y += -2.11 - box.min.y
        root.updateMatrixWorld(true)

        root.traverse(object => {
          if (!(object instanceof THREE.Mesh)) return

          const muscle = muscleFromName(object.name)
          if (shouldHideHead(object, muscle)) {
            object.visible = false
            return
          }

          const oldMaterials = Array.isArray(object.material) ? object.material : [object.material]
          const tendonLike = isTendonLike(object.name)
          const baseColor = muscle ? new THREE.Color(MUSCLE_BASE[muscle]) : tendonLike ? tendon : unclassified

          const material = new THREE.MeshStandardMaterial({
            color: baseColor,
            roughness: tendonLike ? .95 : muscle ? .76 : .9,
            metalness: muscle ? .045 : 0,
            emissive: muscle ? '#0e140f' : '#000000',
            emissiveIntensity: muscle ? .055 : 0,
            transparent: tendonLike,
            opacity: tendonLike ? .32 : 1,
            depthWrite: !tendonLike,
            side: THREE.DoubleSide
          })

          oldMaterials.forEach(previous => previous.dispose())
          object.material = material
          object.castShadow = false
          object.receiveShadow = false

          if (muscle) {
            object.userData.muscle = muscle
            object.userData.baseColor = baseColor.clone()
            muscleMeshes.push(object)
          }
        })

        scene.add(root)
        status.remove()
      },
      progress => {
        if (!progress.total || cancelled) return
        const pct = Math.min(99, Math.round(progress.loaded / progress.total * 100))
        status.textContent = `CARGANDO CORPUS · ${pct}%`
      },
      error => {
        console.error('Error loading BodyParts3D', error)
        if (!cancelled) {
          status.textContent = 'NO SE PUDO CARGAR EL MODELO'
          status.style.color = '#ff8a80'
          status.style.borderColor = 'rgba(255,138,128,.34)'
        }
      }
    )

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const handlePointer = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(muscleMeshes, false)[0]
      onSelectMuscle(hit?.object.userData.muscle as MuscleId | undefined)
    }
    renderer.domElement.addEventListener('pointerup', handlePointer)

    const resize = () => {
      const width = container.clientWidth
      const height = container.clientHeight
      renderer.setSize(width, height, false)
      camera.aspect = width / Math.max(1, height)
      camera.updateProjectionMatrix()
    }

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(container)
    resize()

    let frame = 0
    const animate = () => {
      frame = requestAnimationFrame(animate)
      controls.update()

      const metricMap = new Map<MuscleId, MuscleMetric>(metricsRef.current.map(metric => [metric.id, metric]))
      muscleMeshes.forEach(mesh => {
        const muscle = mesh.userData.muscle as MuscleId
        const score = metricMap.get(muscle)?.score ?? 0
        const intensity = THREE.MathUtils.clamp(score / 100, 0, 1)
        const selected = selectedRef.current === muscle
        const material = mesh.material as THREE.MeshStandardMaterial
        const baseColor = mesh.userData.baseColor as THREE.Color

        material.color.copy(baseColor).lerp(acid, selected ? 1 : Math.pow(intensity, .88) * .94)
        material.emissive.copy(acid)
        material.emissiveIntensity = selected ? 1.05 : Math.pow(intensity, 1.25) * .58
        material.roughness = selected ? .44 : .76 - intensity * .17
      })

      const t = performance.now()
      halo.intensity = .68 + Math.sin(t * .0011) * .08
      ritual.rotation.z = Math.sin(t * .00009) * .035
      ring.rotation.z += .00115
      outerRing.rotation.z -= .0005
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      renderer.domElement.removeEventListener('pointerup', handlePointer)
      controls.dispose()
      draco.dispose()
      status.remove()
      if (loadedRoot) {
        scene.remove(loadedRoot)
        disposeObject(loadedRoot)
      }
      ritualLines.forEach(line => {
        line.geometry.dispose()
        ;(line.material as THREE.Material).dispose()
      })
      ground.geometry.dispose()
      ;(ground.material as THREE.Material).dispose()
      ring.geometry.dispose()
      ;(ring.material as THREE.Material).dispose()
      outerRing.geometry.dispose()
      ;(outerRing.material as THREE.Material).dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [onSelectMuscle])

  return <div className="body-model">
    <div ref={host} className="body-model-stage" />
    <div className="body-model-credit">BODYPARTS3D · CORPUS MAP</div>
  </div>
}
