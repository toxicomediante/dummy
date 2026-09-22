export type MuscleId =
  | 'chest'
  | 'front_delts'
  | 'side_delts'
  | 'rear_delts'
  | 'lats'
  | 'upper_back'
  | 'traps'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'abs'
  | 'obliques'
  | 'lower_back'
  | 'glutes'
  | 'quads'
  | 'hamstrings'
  | 'adductors'
  | 'calves'

export interface TrainingRow {
  date: string
  trainingType: string
  durationMin?: number
  muscleGroup: string
  exerciseId: string
  exercise: string
  loadKg: number
  rir?: number
  setNumber?: number
  reps: number
  volume: number
}

export interface MuscleMetric {
  id: MuscleId
  label: string
  volume: number
  sets: number
  sessions: number
  score: number
}
