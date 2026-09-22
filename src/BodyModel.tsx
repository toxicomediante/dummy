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
const unclassified = new THREE.Color('#252b27')
const tendon = new THREE.Color('#3b413c')

const MUSCLE_BASE: Record<MuscleId, string> = {
  chest: '#667067',
  lats: '#4f5b52',
  upper_back: '#58625a',
  lower_back: '#4c5750',
  traps: '#626c63',
  front_delts: '#6a746b',
  side_delts: '#69736a',
  rear_delts: '#5e6961',
  biceps: '#657168',
  triceps: '#5a665f',
  forearms: '#535f57',
  quads: '#68736a',
  hamstrings: '#59645c',
  glutes: '#5f6a61',
  calves: '#5c685f',
  adductors: '#535e56',
  abs: '#5b665e',
  obliques: '#515d55'
}

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
    scene.fog = new THREE.FogExp2('#030504', .07)

    const camera = new THREE.PerspectiveCamera(30, 1, .1, 100)
    camera.position.set(0, .15, 9.35)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.08
    renderer.shadowMap.enabled = false
    renderer.domElement.style.touchAction = 'none'
    container.appendChild(renderer.domElement)

    const status = document.createElement('div')
    status.textContent = 'CARGANDO ANATOMÍA…'
    Object.assign(status.style, {
      position: 'absolute',
      left: '50%',
      top: '50%',
      transform: 'translate(-50%,-50%)',
      zIndex: '7',
      padding: '9px 12px',
      border: '1px solid rgba(207,255,26,.28)',
      borderRadius: '10px',
      background: 'rgba(4,7,5,.82)',
      color: '#cfff1a',
      fontSize: '7px',
      fontWeight: '900',
      letterSpacing: '1.4px',
      pointerEvents: 'none',
      whiteSpace: 'nowrap'
    })
    container.appendChild(status)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enablePan = false
    controls.enableDamping = true
    controls.dampingFactor = .07
    controls.minDistance = 5.7
    controls.maxDistance = 13.5
    controls.target.set(0, .15, 0)

    scene.add(new THREE.AmbientLight('#c7d0c6', .28))
    scene.add(new THREE.HemisphereLight('#dfe6dc', '#020403', 1.15))

    const key = new THREE.DirectionalLight('#eef2eb', 2.25)
    key.position.set(4.5, 5.8, 6)
    scene.add(key)

    const soft = new THREE.DirectionalLight('#76877a', .9)
    soft.position.set(-4.2, 1.2, 4.8)
    scene.add(soft)

    const rim = new THREE.DirectionalLight('#cfff1a', 2.65)
    rim.position.set(-4.2, 4.2, -5.5)
    scene.add(rim)

    const backRim = new THREE.DirectionalLight('#aeb9ae', 1.0)
    backRim.position.set(4, 2.5, -5)
    scene.add(backRim)

    const halo = new THREE.PointLight('#cfff1a', .85, 8, 2)
    halo.position.set(0, .6, -3.2)
    scene.add(halo)

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(2.35, 96),
      new THREE.MeshBasicMaterial({ color: '#080c09', transparent: true, opacity: .82 })
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -2.19
    scene.add(ground)

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.7, 1.72, 128),
      new THREE.MeshBasicMaterial({ color: '#cfff1a', transparent: true, opacity: .24, side: THREE.DoubleSide })
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.y = -2.17
    scene.add(ring)

    const outerRing = new THREE.Mesh(
      new THREE.RingGeometry(2.12, 2.125, 128),
      new THREE.MeshBasicMaterial({ color: '#9fab9f', transparent: true, opacity: .075, side: THREE.DoubleSide })
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

          const oldMaterials = Array.isArray(object.material) ? object.material : [object.material]
          const muscle = muscleFromName(object.name)
          const tendonLike = isTendonLike(object.name)
          const baseColor = muscle ? new THREE.Color(MUSCLE_BASE[muscle]) : tendonLike ? tendon : unclassified

          const material = new THREE.MeshStandardMaterial({
            color: baseColor,
            roughness: tendonLike ? .92 : muscle ? .72 : .86,
            metalness: muscle ? .055 : 0,
            emissive: muscle ? '#111812' : '#000000',
            emissiveIntensity: muscle ? .08 : 0,
            transparent: tendonLike,
            opacity: tendonLike ? .46 : 1,
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
        status.textContent = `CARGANDO ANATOMÍA · ${pct}%`
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
        material.emissiveIntensity = selected ? .95 : Math.pow(intensity, 1.25) * .54
        material.roughness = selected ? .46 : .72 - intensity * .14
      })

      ring.rotation.z += .0013
      outerRing.rotation.z -= .00055
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
    <div className="body-model-credit">BODYPARTS3D · ANATOMICAL MAP</div>
  </div>
}
