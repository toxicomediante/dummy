import { useEffect, useRef, useState } from 'react'
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

type AnatomySource = 'zanatomy' | 'hbe'

const SOURCES: Record<AnatomySource, { label: string; credit: string; url: string; rotateX?: number }> = {
  zanatomy: {
    label: 'Z-ANATOMY',
    credit: 'Z-ANATOMY · MODELO MUSCULAR',
    url: 'https://raw.githubusercontent.com/Liyucheng1997/242_lab-human-anatomy/main/public/models/muscular.glb'
  },
  hbe: {
    label: 'HBE · BODYPARTS3D',
    credit: 'BASE HBE · BODYPARTS3D',
    url: 'https://raw.githubusercontent.com/JohanBellander/BodyExplorer/main/public/anatomy.glb',
    rotateX: -Math.PI / 2
  }
}

const acid = new THREE.Color('#cfff1a')
const inactive = new THREE.Color('#4c3832')
const unclassified = new THREE.Color('#2d2926')
const tendon = new THREE.Color('#69645c')

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
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return
    object.geometry.dispose()
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    materials.forEach(material => material.dispose())
  })
}

export default function BodyModel({ metrics, selectedMuscle, onSelectMuscle }: Props) {
  const host = useRef<HTMLDivElement | null>(null)
  const metricsRef = useRef(metrics)
  const selectedRef = useRef(selectedMuscle)
  const [source, setSource] = useState<AnatomySource>('zanatomy')
  metricsRef.current = metrics
  selectedRef.current = selectedMuscle

  useEffect(() => {
    if (!host.current) return

    const container = host.current
    const config = SOURCES[source]
    let cancelled = false
    let loadedRoot: THREE.Object3D | null = null

    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2('#050706', .055)

    const camera = new THREE.PerspectiveCamera(32, 1, .1, 100)
    camera.position.set(0, .35, 9.2)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.22
    renderer.shadowMap.enabled = false
    container.appendChild(renderer.domElement)

    const status = document.createElement('div')
    status.textContent = `CARGANDO ${config.label}…`
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
    controls.minDistance = 5.8
    controls.maxDistance = 13.5
    controls.target.set(0, .3, 0)

    scene.add(new THREE.HemisphereLight('#eef4e9', '#070907', 1.65))

    const key = new THREE.DirectionalLight('#ffffff', 2.4)
    key.position.set(4.5, 5.5, 5.5)
    scene.add(key)

    const fill = new THREE.DirectionalLight('#94a895', 1.05)
    fill.position.set(-4, 1, 5)
    scene.add(fill)

    const rim = new THREE.DirectionalLight('#cfff1a', 1.85)
    rim.position.set(-3.5, 4, -5)
    scene.add(rim)

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(2.25, 80),
      new THREE.MeshBasicMaterial({ color: '#0b0f0c', transparent: true, opacity: .72 })
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -2.18
    scene.add(ground)

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.68, 1.705, 120),
      new THREE.MeshBasicMaterial({ color: '#cfff1a', transparent: true, opacity: .2, side: THREE.DoubleSide })
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.y = -2.16
    scene.add(ring)

    const muscleMeshes: THREE.Mesh[] = []
    const loader = new GLTFLoader()
    const draco = new DRACOLoader()
    draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/')
    loader.setDRACOLoader(draco)

    loader.load(
      config.url,
      gltf => {
        if (cancelled) {
          disposeObject(gltf.scene)
          return
        }

        const root = gltf.scene
        loadedRoot = root
        if (config.rotateX) root.rotation.x = config.rotateX
        root.updateMatrixWorld(true)

        let box = new THREE.Box3().setFromObject(root)
        const size = box.getSize(new THREE.Vector3())
        const height = Math.max(.001, size.y)
        const scale = 4.95 / height
        root.scale.multiplyScalar(scale)
        root.updateMatrixWorld(true)

        box = new THREE.Box3().setFromObject(root)
        const center = box.getCenter(new THREE.Vector3())
        root.position.x -= center.x
        root.position.z -= center.z
        root.position.y += -2.1 - box.min.y
        root.updateMatrixWorld(true)

        root.traverse(object => {
          if (!(object instanceof THREE.Mesh)) return

          const muscle = muscleFromName(object.name)
          const tendonLike = isTendonLike(object.name)
          const baseColor = tendonLike ? tendon : muscle ? inactive : unclassified
          const material = new THREE.MeshStandardMaterial({
            color: baseColor,
            roughness: tendonLike ? .72 : .6,
            metalness: 0,
            emissive: '#000000',
            emissiveIntensity: 0,
            side: THREE.DoubleSide
          })
          object.material = material
          object.castShadow = false
          object.receiveShadow = false
          if (muscle) {
            object.userData.muscle = muscle
            muscleMeshes.push(object)
          }
        })

        scene.add(root)
        status.remove()
      },
      progress => {
        if (!progress.total || cancelled) return
        const pct = Math.min(99, Math.round(progress.loaded / progress.total * 100))
        status.textContent = `CARGANDO ${config.label} · ${pct}%`
      },
      error => {
        console.error(`Error loading ${config.label}`, error)
        if (!cancelled) {
          status.textContent = `NO SE PUDO CARGAR ${config.label}`
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

        material.color.copy(inactive).lerp(acid, selected ? 1 : intensity * .92)
        material.emissive.copy(acid)
        material.emissiveIntensity = selected ? .78 : Math.pow(intensity, 1.35) * .42
      })

      ring.rotation.z += .0014
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
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [onSelectMuscle, source])

  const switchButton = (active: boolean) => ({
    height: 28,
    padding: '0 9px',
    borderRadius: 8,
    border: `1px solid ${active ? '#cfff1a' : 'rgba(255,255,255,.14)'}`,
    background: active ? 'rgba(207,255,26,.12)' : 'rgba(4,7,5,.78)',
    color: active ? '#cfff1a' : '#8f9a90',
    fontSize: 6,
    fontWeight: 900,
    letterSpacing: '1px',
    cursor: 'pointer' as const,
    backdropFilter: 'blur(8px)'
  })

  return <div className="body-model">
    <div ref={host} style={{ position: 'absolute', inset: 0 }} />
    <div style={{
      position: 'absolute',
      zIndex: 7,
      left: '50%',
      top: 58,
      transform: 'translateX(-50%)',
      display: 'flex',
      gap: 4,
      padding: 4,
      borderRadius: 10,
      border: '1px solid rgba(255,255,255,.1)',
      background: 'rgba(3,5,4,.58)',
      backdropFilter: 'blur(10px)',
      whiteSpace: 'nowrap'
    }}>
      <button style={switchButton(source === 'zanatomy')} onClick={() => setSource('zanatomy')}>Z-ANATOMY</button>
      <button style={switchButton(source === 'hbe')} onClick={() => setSource('hbe')}>HBE · BODYPARTS3D</button>
    </div>
    <div style={{
      position: 'absolute',
      zIndex: 4,
      right: 16,
      bottom: 9,
      color: '#667068',
      fontSize: 5,
      letterSpacing: '1px',
      pointerEvents: 'none'
    }}>{SOURCES[source].credit}</div>
  </div>
}
