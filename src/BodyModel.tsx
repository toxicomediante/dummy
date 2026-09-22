import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { MuscleId, MuscleMetric } from './types'

interface Props {
  metrics: MuscleMetric[]
  selectedMuscle?: MuscleId
  selectedAnatomyKey?: string
  onSelectMuscle: (muscle?: MuscleId, anatomyKey?: string, anatomyLabel?: string) => void
}

const BODY_MODEL_URL = `${import.meta.env.BASE_URL}models/bodyparts-yose.glb`
const acid = new THREE.Color('#cfff1a')
const unclassified = new THREE.Color('#171d19')
const tendon = new THREE.Color('#3a433c')

const MUSCLE_BASE: Record<MuscleId, string> = {
  chest: '#4a564d',
  lats: '#354139',
  upper_back: '#3c483f',
  lower_back: '#354038',
  traps: '#465248',
  front_delts: '#4e5a50',
  side_delts: '#4a574d',
  rear_delts: '#424e45',
  biceps: '#465249',
  triceps: '#3d4941',
  forearms: '#37433b',
  quads: '#49564c',
  hamstrings: '#3d4941',
  glutes: '#424e45',
  calves: '#3f4c43',
  adductors: '#37433b',
  abs: '#3f4b42',
  obliques: '#37433b'
}

function normalizeName(name: string) {
  return name.toLowerCase().replace(/[_.-]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function muscleFromName(rawName: string): MuscleId | undefined {
  const n = normalizeName(rawName)

  if (n.includes('pectoralis')) return 'chest'
  if (n.includes('rectus abdominis') || n.includes('transversus abdominis')) return 'abs'
  if (n.includes('external oblique') || n.includes('internal oblique')) return 'obliques'
  if (n.includes('latissimus')) return 'lats'
  if (n.includes('trapezius')) return 'traps'
  if (n.includes('rhomboid')) return 'upper_back'
  if (
    n.includes('erector spinae') || n.includes('iliocostalis') ||
    n.includes('longissimus thoracis') || n.includes('longissimus lumborum') ||
    n.includes('spinalis thoracis') || n.includes('multifidus thoracis') ||
    n.includes('multifidus lumborum') || n.includes('quadratus lumborum')
  ) return 'lower_back'

  if (n.includes('deltoid')) {
    if (n.includes('anterior') || n.includes('clavicular')) return 'front_delts'
    if (n.includes('posterior') || n.includes('spinal')) return 'rear_delts'
    return 'side_delts'
  }

  if (n.includes('biceps brachii')) return 'biceps'
  if (n.includes('triceps brachii')) return 'triceps'
  if (
    n.includes('brachioradialis') || n.includes('pronator') || n.includes('supinator') ||
    n.includes('flexor carpi') || n.includes('extensor carpi') || n.includes('flexor digitorum') ||
    n.includes('extensor digitorum') || n.includes('palmaris') || n.includes('extensor pollicis') ||
    n.includes('flexor pollicis longus')
  ) return 'forearms'

  if (n.includes('gluteus')) return 'glutes'
  if (n.includes('rectus femoris') || n.includes('vastus')) return 'quads'
  if (n.includes('biceps femoris') || n.includes('semitendinosus') || n.includes('semimembranosus')) return 'hamstrings'
  if (n.includes('adductor') || n.includes('gracilis') || n.includes('pectineus')) return 'adductors'
  if (n.includes('gastrocnemius') || n.includes('soleus') || n.includes('plantaris')) return 'calves'

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

export default function BodyModel({ metrics, selectedMuscle, selectedAnatomyKey, onSelectMuscle }: Props) {
  const host = useRef<HTMLDivElement | null>(null)
  const metricsRef = useRef(metrics)
  const selectedRef = useRef(selectedMuscle)
  const selectedAnatomyRef = useRef(selectedAnatomyKey)
  metricsRef.current = metrics
  selectedRef.current = selectedMuscle
  selectedAnatomyRef.current = selectedAnatomyKey

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
    controls.enablePan = true
    controls.enableDamping = true
    controls.dampingFactor = .07
    controls.panSpeed = .9
    controls.screenSpacePanning = true
    controls.minDistance = 5.6
    controls.maxDistance = 13.5
    controls.target.set(0, .08, 0)

    scene.add(new THREE.AmbientLight('#b8c0b7', .16))
    scene.add(new THREE.HemisphereLight('#cbd5ca', '#010302', .92))

    const key = new THREE.DirectionalLight('#e7ece5', 1.9)
    key.position.set(4.8, 5.8, 6.2)
    scene.add(key)

    const soft = new THREE.DirectionalLight('#58685d', .58)
    soft.position.set(-4.2, .8, 4.5)
    scene.add(soft)

    const rim = new THREE.DirectionalLight('#cfff1a', 3.05)
    rim.position.set(-4.4, 4.2, -5.5)
    scene.add(rim)

    const backRim = new THREE.DirectionalLight('#9ca99d', .7)
    backRim.position.set(4, 2.2, -5)
    scene.add(backRim)

    const halo = new THREE.PointLight('#cfff1a', .76, 8, 2)
    halo.position.set(0, .55, -3.2)
    scene.add(halo)

    const ritual = new THREE.Group()
    ritual.position.set(0, .25, -1.45)
    ritual.scale.set(1, 1.08, 1)
    const ritualLines = [
      makeLine(circlePoints(1.58), '#cfff1a', .09, true),
      makeLine(circlePoints(1.12), '#cbd2c9', .05, true),
      makeLine([
        new THREE.Vector3(0, 1.58, 0),
        new THREE.Vector3(-1.02, -1.18, 0),
        new THREE.Vector3(1.02, -1.18, 0)
      ], '#cbd2c9', .065, true),
      makeLine([new THREE.Vector3(0, -1.72, 0), new THREE.Vector3(0, 1.72, 0)], '#cfff1a', .055),
      makeLine([new THREE.Vector3(-1.42, .12, 0), new THREE.Vector3(1.42, .12, 0)], '#cbd2c9', .04)
    ]
    ritualLines.forEach(line => ritual.add(line))
    scene.add(ritual)

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(2.35, 96),
      new THREE.MeshBasicMaterial({ color: '#050806', transparent: true, opacity: .88 })
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
      new THREE.MeshBasicMaterial({ color: '#9fab9f', transparent: true, opacity: .055, side: THREE.DoubleSide })
    )
    outerRing.rotation.x = -Math.PI / 2
    outerRing.position.y = -2.165
    scene.add(outerRing)

    const muscleMeshes: THREE.Mesh[] = []
    const raycastMeshes: THREE.Mesh[] = []
    const loader = new GLTFLoader()

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

          const embeddedGroup = object.userData.yoseGroup as MuscleId | null | undefined
          const muscle = embeddedGroup || muscleFromName(object.name)
          const tendonLike = object.userData.yoseRole === 'tendon' || isTendonLike(object.name)
          const oldMaterials = Array.isArray(object.material) ? object.material : [object.material]
          const baseColor = muscle ? new THREE.Color(MUSCLE_BASE[muscle]) : tendonLike ? tendon : unclassified

          const material = new THREE.MeshStandardMaterial({
            color: baseColor,
            roughness: tendonLike ? .97 : muscle ? .8 : .94,
            metalness: muscle ? .04 : 0,
            emissive: muscle ? '#0b100c' : '#000000',
            emissiveIntensity: muscle ? .035 : 0,
            transparent: tendonLike,
            opacity: tendonLike ? .26 : 1,
            depthWrite: !tendonLike,
            side: THREE.DoubleSide
          })

          oldMaterials.forEach(previous => previous.dispose())
          object.material = material
          object.castShadow = false
          object.receiveShadow = false

          if (!tendonLike) raycastMeshes.push(object)

          if (muscle) {
            object.userData.muscle = muscle
            object.userData.baseColor = baseColor.clone()
            object.userData.anatomyKey = object.userData.yoseAnatomyKey || normalizeName(object.name)
            object.userData.anatomyLabel = object.userData.yoseLabel || object.name
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
        console.error('Error loading Yose corpus', error)
        if (!cancelled) {
          status.textContent = 'NO SE PUDO CARGAR EL CORPUS'
          status.style.color = '#ff8a80'
          status.style.borderColor = 'rgba(255,138,128,.34)'
        }
      }
    )

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()

    type PointerState = {
      x: number
      y: number
      startX: number
      startY: number
      pointerType: string
    }

    const activePointers = new Map<number, PointerState>()
    let gestureMoved = false
    let multiState: { midX: number; midY: number; distance: number } | null = null

    const consumeTouch = (event: PointerEvent) => {
      event.preventDefault()
      event.stopImmediatePropagation()
    }

    const selectAtPointer = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(raycastMeshes, false)[0]
      if (!hit || !hit.object.userData.muscle) {
        onSelectMuscle(undefined)
        return
      }
      const mesh = hit.object as THREE.Mesh
      onSelectMuscle(
        mesh.userData.muscle as MuscleId,
        mesh.userData.anatomyKey as string,
        mesh.userData.anatomyLabel as string
      )
    }

    const touchPointers = () => [...activePointers.values()].filter(item => item.pointerType === 'touch')

    const currentMultiState = () => {
      const points = touchPointers()
      if (points.length !== 2) return null
      const [a, b] = points
      return {
        midX: (a.x + b.x) / 2,
        midY: (a.y + b.y) / 2,
        distance: Math.hypot(b.x - a.x, b.y - a.y)
      }
    }

    const rotateTouch = (dx: number, dy: number) => {
      const offset = camera.position.clone().sub(controls.target)
      const spherical = new THREE.Spherical().setFromVector3(offset)
      const speed = .0075
      spherical.theta -= dx * speed
      spherical.phi -= dy * speed
      spherical.phi = THREE.MathUtils.clamp(spherical.phi, .05, Math.PI - .05)
      offset.setFromSpherical(spherical)
      camera.position.copy(controls.target).add(offset)
      camera.lookAt(controls.target)
      camera.updateMatrixWorld()
    }

    const panAndZoomTouch = (next: { midX: number; midY: number; distance: number }) => {
      if (!multiState) {
        multiState = next
        return
      }

      const dx = next.midX - multiState.midX
      const dy = next.midY - multiState.midY
      const canvasHeight = Math.max(1, renderer.domElement.clientHeight)
      const distanceToTarget = camera.position.distanceTo(controls.target)
      const worldPerPixel = 2 * distanceToTarget * Math.tan(THREE.MathUtils.degToRad(camera.fov * .5)) / canvasHeight

      camera.updateMatrixWorld()
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
      const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1)
      const panOffset = right.multiplyScalar(-dx * worldPerPixel).add(up.multiplyScalar(dy * worldPerPixel))
      camera.position.add(panOffset)
      controls.target.add(panOffset)

      if (multiState.distance > 0 && next.distance > 0) {
        const ratio = multiState.distance / next.distance
        const desiredDistance = THREE.MathUtils.clamp(
          camera.position.distanceTo(controls.target) * ratio,
          controls.minDistance,
          controls.maxDistance
        )
        const direction = camera.position.clone().sub(controls.target).normalize()
        camera.position.copy(controls.target).addScaledVector(direction, desiredDistance)
      }

      camera.lookAt(controls.target)
      camera.updateMatrixWorld()
      multiState = next
    }

    const handlePointerDown = (event: PointerEvent) => {
      const state: PointerState = {
        x: event.clientX,
        y: event.clientY,
        startX: event.clientX,
        startY: event.clientY,
        pointerType: event.pointerType
      }
      activePointers.set(event.pointerId, state)

      if (event.pointerType === 'touch') {
        consumeTouch(event)
        try { renderer.domElement.setPointerCapture(event.pointerId) } catch { /* noop */ }
        const touches = touchPointers()
        if (touches.length === 2) {
          gestureMoved = true
          multiState = currentMultiState()
        }
      }
    }

    const handlePointerMove = (event: PointerEvent) => {
      const state = activePointers.get(event.pointerId)
      if (!state) return

      const previousX = state.x
      const previousY = state.y
      state.x = event.clientX
      state.y = event.clientY
      activePointers.set(event.pointerId, state)

      if (Math.hypot(state.x - state.startX, state.y - state.startY) > 5) gestureMoved = true
      if (event.pointerType !== 'touch') return

      consumeTouch(event)
      const touches = touchPointers()
      if (touches.length === 1) {
        multiState = null
        rotateTouch(state.x - previousX, state.y - previousY)
      } else if (touches.length === 2) {
        const next = currentMultiState()
        if (next) panAndZoomTouch(next)
      }
    }

    const handlePointerUp = (event: PointerEvent) => {
      const state = activePointers.get(event.pointerId)
      const pointerCountBeforeUp = activePointers.size
      const isTap = Boolean(state) && pointerCountBeforeUp === 1 && !gestureMoved

      if (event.pointerType === 'touch') {
        consumeTouch(event)
        try { renderer.domElement.releasePointerCapture(event.pointerId) } catch { /* noop */ }
      }

      activePointers.delete(event.pointerId)
      const remainingTouches = touchPointers()
      multiState = remainingTouches.length === 2 ? currentMultiState() : null

      if (isTap) selectAtPointer(event)
      if (activePointers.size === 0) gestureMoved = false
    }

    const handlePointerCancel = (event: PointerEvent) => {
      if (event.pointerType === 'touch') consumeTouch(event)
      activePointers.delete(event.pointerId)
      multiState = null
      if (activePointers.size === 0) gestureMoved = false
    }

    renderer.domElement.addEventListener('pointerdown', handlePointerDown, { capture: true })
    renderer.domElement.addEventListener('pointermove', handlePointerMove, { capture: true })
    renderer.domElement.addEventListener('pointerup', handlePointerUp, { capture: true })
    renderer.domElement.addEventListener('pointercancel', handlePointerCancel, { capture: true })

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
        const exactSelection = selectedAnatomyRef.current
        const selected = exactSelection
          ? mesh.userData.anatomyKey === exactSelection
          : selectedRef.current === muscle
        const material = mesh.material as THREE.MeshStandardMaterial
        const baseColor = mesh.userData.baseColor as THREE.Color

        material.color.copy(baseColor).lerp(acid, selected ? 1 : Math.pow(intensity, .84) * .96)
        material.emissive.copy(acid)
        material.emissiveIntensity = selected ? 1.12 : Math.pow(intensity, 1.2) * .62
        material.roughness = selected ? .4 : .8 - intensity * .2
      })

      const t = performance.now()
      halo.intensity = .72 + Math.sin(t * .0011) * .09
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
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown, { capture: true })
      renderer.domElement.removeEventListener('pointermove', handlePointerMove, { capture: true })
      renderer.domElement.removeEventListener('pointerup', handlePointerUp, { capture: true })
      renderer.domElement.removeEventListener('pointercancel', handlePointerCancel, { capture: true })
      controls.dispose()
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
    <div className="body-model-credit">YOSE CORPUS · BODYPARTS3D</div>
  </div>
}
