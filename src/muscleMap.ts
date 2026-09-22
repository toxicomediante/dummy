import type { MuscleId, MuscleMetric, TrainingRow } from './types'

export const MUSCLE_LABELS: Record<MuscleId, string> = {
  chest: 'Pectoral',
  front_delts: 'Deltoide anterior',
  side_delts: 'Deltoide lateral',
  rear_delts: 'Deltoide posterior',
  lats: 'Dorsal',
  upper_back: 'Romboides',
  traps: 'Trapecio',
  biceps: 'Bíceps',
  triceps: 'Tríceps',
  forearms: 'Antebrazo',
  abs: 'Abdominales',
  obliques: 'Oblicuos',
  lower_back: 'Lumbar',
  glutes: 'Glúteo',
  quads: 'Cuádriceps',
  hamstrings: 'Isquios',
  adductors: 'Aductores',
  calves: 'Gemelos'
}

type Distribution = Partial<Record<MuscleId, number>>

const BY_GROUP: Record<string, Distribution> = {
  Pecho: { chest: 1, triceps: .32, front_delts: .28 },
  Espalda: { lats: .8, upper_back: .75, biceps: .38, rear_delts: .22, forearms: .16 },
  'Pierna / Glúteo': { quads: .72, glutes: .6, hamstrings: .48, adductors: .2, calves: .1 },
  Hombro: { side_delts: .75, front_delts: .55, rear_delts: .35, triceps: .18 },
  Bíceps: { biceps: 1, forearms: .25 },
  Tríceps: { triceps: 1, chest: .12, front_delts: .12 },
  Core: { abs: 1, obliques: .45, lower_back: .15 },
  Trapecio: { traps: 1, upper_back: .3, forearms: .2 },
  Antebrazo: { forearms: 1 }
}

const EXERCISE_OVERRIDES: Array<[RegExp, Distribution]> = [
  [/peso muerto convencional|deadlift_conventional/i, { glutes: .78, hamstrings: .78, lower_back: .62, traps: .38, forearms: .25, quads: .28 }],
  [/peso muerto rumano|romanian_deadlift/i, { hamstrings: 1, glutes: .8, lower_back: .48, forearms: .16 }],
  [/peso muerto sumo|sumo_deadlift/i, { glutes: .88, hamstrings: .62, adductors: .72, quads: .55, lower_back: .35 }],
  [/sentadilla|squat|prensa|leg_press/i, { quads: 1, glutes: .68, hamstrings: .28, adductors: .22 }],
  [/búlgara|zancad|lunge|step-up|step_up/i, { quads: .88, glutes: .82, hamstrings: .35, adductors: .18 }],
  [/hip thrust|hip_thrust|patada de glúteo|glute_kickback/i, { glutes: 1, hamstrings: .22 }],
  [/curl femoral|leg_curl/i, { hamstrings: 1, calves: .12 }],
  [/extensión de cuádriceps|leg_extension/i, { quads: 1 }],
  [/gemelos|calf_raise/i, { calves: 1 }],
  [/abductor/i, { glutes: .82 }],
  [/aductor/i, { adductors: 1 }],
  [/press banca|bench_press|press plano|press inclinado|chest_press/i, { chest: 1, triceps: .38, front_delts: .32 }],
  [/fondos enfocados a pecho|chest_dips/i, { chest: 1, triceps: .52, front_delts: .28 }],
  [/aperturas|pec deck|crossover|cruce de poleas|fly/i, { chest: 1, front_delts: .12 }],
  [/press militar|shoulder press|arnold|overhead_press|dumbbell_shoulder_press/i, { front_delts: 1, side_delts: .62, triceps: .48 }],
  [/elevaciones laterales|lateral_raise/i, { side_delts: 1, traps: .12 }],
  [/elevaciones frontales|front_raise/i, { front_delts: 1 }],
  [/pájaros|rear_delt|reverse_pec_deck|face pull|face_pull/i, { rear_delts: 1, upper_back: .52, traps: .25 }],
  [/dominadas|jalón|pulldown|pullover/i, { lats: 1, biceps: .5, upper_back: .28, forearms: .2 }],
  [/remo|row/i, { upper_back: .9, lats: .78, biceps: .45, rear_delts: .35, forearms: .18 }],
  [/encogimientos|shrug/i, { traps: 1, forearms: .18 }],
  [/farmer/i, { traps: .88, forearms: 1, abs: .24, obliques: .24 }],
  [/curl martillo|hammer_curl|curl inverso|reverse_curl/i, { biceps: .72, forearms: .72 }],
  [/curl|biceps/i, { biceps: 1, forearms: .22 }],
  [/press banca agarre cerrado|close_grip/i, { triceps: 1, chest: .52, front_delts: .24 }],
  [/fondos enfocados a tríceps|triceps_dips/i, { triceps: 1, chest: .42, front_delts: .26 }],
  [/tríceps|skullcrusher|pushdown|extension/i, { triceps: 1 }],
  [/plancha lateral|side_plank|pallof|woodchop|rotación de tronco/i, { obliques: 1, abs: .72, lower_back: .18 }],
  [/plancha|plank|crunch|elevación de piernas|leg_raise|knee_raise|ab_wheel/i, { abs: 1, obliques: .35 }]
]

export function distributionFor(row: TrainingRow): Distribution {
  const haystack = `${row.exerciseId} ${row.exercise}`
  return EXERCISE_OVERRIDES.find(([pattern]) => pattern.test(haystack))?.[1] ?? BY_GROUP[row.muscleGroup] ?? {}
}

export function calculateMuscleMetrics(rows: TrainingRow[]): MuscleMetric[] {
  const base = Object.keys(MUSCLE_LABELS).reduce((acc, id) => {
    acc[id as MuscleId] = { id: id as MuscleId, label: MUSCLE_LABELS[id as MuscleId], volume: 0, sets: 0, sessions: 0, score: 0, _dates: new Set<string>() }
    return acc
  }, {} as Record<MuscleId, MuscleMetric & { _dates: Set<string> }>)

  rows.forEach(row => {
    const distribution = distributionFor(row)
    Object.entries(distribution).forEach(([muscle, weight]) => {
      const metric = base[muscle as MuscleId]
      if (!metric || !weight) return
      metric.volume += row.volume * weight
      metric.sets += weight
      metric._dates.add(row.date)
    })
  })

  const all = Object.values(base)
  all.forEach(metric => { metric.sessions = metric._dates.size })
  const maxLogVolume = Math.max(1, ...all.map(metric => Math.log1p(metric.volume)))
  const maxSessions = Math.max(1, ...all.map(metric => metric.sessions))

  return all.map(metric => {
    const volumeScore = Math.log1p(metric.volume) / maxLogVolume
    const frequencyScore = metric.sessions / maxSessions
    const score = metric.volume > 0 ? Math.round((volumeScore * .62 + frequencyScore * .38) * 100) : 0
    return { id: metric.id, label: metric.label, volume: metric.volume, sets: metric.sets, sessions: metric.sessions, score }
  }).sort((a, b) => b.score - a.score)
}
