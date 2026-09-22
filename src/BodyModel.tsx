import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { MuscleId, MuscleMetric } from './types'

interface Props {
  metrics: MuscleMetric[]
  selectedMuscle?: MuscleId
  onSelectMuscle: (muscle?: MuscleId) => void
}

interface PartSpec {
  muscle?: MuscleId
  geometry: THREE.BufferGeometry
  position: [number, number, number]
  rotation?: [number, number, number]
  scale?: [number, number, number]
}

const skin = new THREE.Color('#272c29')
const inactive = new THREE.Color('#4c554d')
const acid = new THREE.Color('#cfff1a')

function capsule(radius: number, length: number) {
  return new THREE.CapsuleGeometry(radius, length, 6, 12)
}

function sphere(radius: number) {
  return new THREE.SphereGeometry(radius, 18, 14)
}

function box(x: number, y: number, z: number) {
  return new THREE.BoxGeometry(x, y, z, 3, 3, 3)
}

function partSpecs(): PartSpec[] {
  const both = (muscle: MuscleId, geometry: THREE.BufferGeometry, x: number, y: number, z: number, rotation?: [number, number, number], scale?: [number, number, number]): PartSpec[] => [
    { muscle, geometry: geometry.clone(), position: [-x, y, z], rotation, scale },
    { muscle, geometry: geometry.clone(), position: [x, y, z], rotation: rotation ? [rotation[0], -rotation[1], -rotation[2]] : undefined, scale }
  ]

  return [
    { geometry: sphere(.34), position: [0, 3.35, 0] },
    { geometry: capsule(.15, .28), position: [0, 2.92, 0] },
    { muscle: 'chest', geometry: box(.72, .5, .24), position: [0, 2.42, .19], scale: [1.45, 1, .9] },
    { muscle: 'abs', geometry: box(.5, .9, .18), position: [0, 1.58, .18], scale: [1.12, 1, .85] },
    { muscle: 'obliques', geometry: box(.24, .82, .16), position: [-.42, 1.58, .08], rotation: [0, 0, -.08] },
    { muscle: 'obliques', geometry: box(.24, .82, .16), position: [.42, 1.58, .08], rotation: [0, 0, .08] },
    { muscle: 'lats', geometry: box(.3, .92, .16), position: [-.48, 1.78, -.17], rotation: [0, 0, -.16] },
    { muscle: 'lats', geometry: box(.3, .92, .16), position: [.48, 1.78, -.17], rotation: [0, 0, .16] },
    { muscle: 'upper_back', geometry: box(.75, .65, .18), position: [0, 2.26, -.2], scale: [1.35, 1, .9] },
    { muscle: 'traps', geometry: box(.52, .38, .16), position: [0, 2.72, -.08], rotation: [.12, 0, 0] },
    { muscle: 'lower_back', geometry: box(.52, .58, .15), position: [0, 1.18, -.17] },
    ...both('front_delts', sphere(.23), .67, 2.48, .12),
    ...both('side_delts', sphere(.22), .74, 2.43, -.02),
    ...both('rear_delts', sphere(.2), .67, 2.42, -.2),
    ...both('biceps', capsule(.14, .46), .86, 1.84, .08),
    ...both('triceps', capsule(.14, .5), .86, 1.84, -.12),
    ...both('forearms', capsule(.11, .55), .9, 1.12, 0),
    { muscle: 'glutes', geometry: sphere(.31), position: [-.28, .78, -.22], scale: [1, 1.15, .8] },
    { muscle: 'glutes', geometry: sphere(.31), position: [.28, .78, -.22], scale: [1, 1.15, .8] },
    ...both('quads', capsule(.2, .82), .3, -.06, .08, undefined, [1.05, 1, .92]),
    ...both('hamstrings', capsule(.19, .82), .3, -.06, -.15, undefined, [1, 1, .88]),
    ...both('adductors', capsule(.13, .7), .12, -.05, -.01),
    ...both('calves', capsule(.16, .65), .29, -1.08, -.06),
    { geometry: capsule(.1, .32), position: [-.3, -1.72, .08], rotation: [Math.PI / 2, 0, 0] },
    { geometry: capsule(.1, .32), position: [.3, -1.72, .08], rotation: [Math.PI / 2, 0, 0] }
  ]
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
    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2('#050706', .07)
    const camera = new THREE.PerspectiveCamera(32, 1, .1, 100)
    camera.position.set(0, .8, 8.5)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.15
    container.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enablePan = false
    controls.enableDamping = true
    controls.minDistance = 6.2
    controls.maxDistance = 11
    controls.target.set(0, .65, 0)

    scene.add(new THREE.HemisphereLight('#f2f4ed', '#07100a', 1.9))
    const rim = new THREE.DirectionalLight('#cfff1a', 2.1)
    rim.position.set(-3, 4, -4)
    scene.add(rim)
    const key = new THREE.DirectionalLight('#ffffff', 2.2)
    key.position.set(4, 5, 6)
    scene.add(key)

    const group = new THREE.Group()
    group.position.y = .25
    scene.add(group)

    const muscleMeshes: THREE.Mesh[] = []
    partSpecs().forEach(spec => {
      const material = new THREE.MeshStandardMaterial({
        color: spec.muscle ? inactive : skin,
        roughness: .58,
        metalness: spec.muscle ? .08 : .02,
        emissive: '#000000',
        emissiveIntensity: 0
      })
      const mesh = new THREE.Mesh(spec.geometry, material)
      mesh.position.set(...spec.position)
      if (spec.rotation) mesh.rotation.set(...spec.rotation)
      if (spec.scale) mesh.scale.set(...spec.scale)
      if (spec.muscle) {
        mesh.userData.muscle = spec.muscle
        muscleMeshes.push(mesh)
      }
      group.add(mesh)
    })

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(2.2, 64),
      new THREE.MeshBasicMaterial({ color: '#0d120f', transparent: true, opacity: .75 })
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -1.86
    scene.add(ground)

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.65, 1.68, 96),
      new THREE.MeshBasicMaterial({ color: '#cfff1a', transparent: true, opacity: .22, side: THREE.DoubleSide })
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.y = -1.84
    scene.add(ring)

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
        const selected = selectedRef.current === muscle
        const material = mesh.material as THREE.MeshStandardMaterial
        material.color.copy(inactive).lerp(acid, Math.min(1, score / 100))
        material.emissive.copy(acid)
        material.emissiveIntensity = selected ? .72 : Math.pow(score / 100, 1.3) * .45
      })
      ring.rotation.z += .0015
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      renderer.domElement.removeEventListener('pointerup', handlePointer)
      controls.dispose()
      renderer.dispose()
      scene.traverse((object: THREE.Object3D) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose()
          const material = object.material as THREE.Material
          material.dispose()
        }
      })
      renderer.domElement.remove()
    }
  }, [onSelectMuscle])

  return <div className="body-model" ref={host} />
}
