import type { TrainingRow } from './types'

const REQUIRED_HEADERS = ['fecha', 'grupo_muscular', 'ejercicio']

function clean(value: string | undefined) {
  return (value ?? '').trim()
}

function numberValue(value: string | undefined) {
  if (!value) return 0
  const normalized = value.replace(',', '.').replace(/\s/g, '')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

export function parseSemicolonCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const input = text.replace(/^\uFEFF/, '')

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        cell += '"'
        i += 1
      } else if (char === '"') quoted = false
      else cell += char
      continue
    }

    if (char === '"') quoted = true
    else if (char === ';') {
      row.push(cell)
      cell = ''
    } else if (char === '\n') {
      row.push(cell.replace(/\r$/, ''))
      if (row.some(value => value.length)) rows.push(row)
      row = []
      cell = ''
    } else cell += char
  }

  row.push(cell.replace(/\r$/, ''))
  if (row.some(value => value.length)) rows.push(row)
  return rows
}

export function parseTrainingCsv(text: string): TrainingRow[] {
  const grid = parseSemicolonCsv(text)
  if (grid.length < 2) return []
  const headers = grid[0].map(header => clean(header).toLowerCase())
  if (!REQUIRED_HEADERS.every(header => headers.includes(header))) {
    throw new Error("El CSV no parece ser una exportación de ENTRENAMIENTOS de Yose's Project.")
  }

  const index = (name: string) => headers.indexOf(name)
  const get = (row: string[], name: string) => row[index(name)]

  return grid.slice(1).map(row => {
    const loadKg = numberValue(get(row, 'carga_kg'))
    const reps = numberValue(get(row, 'repeticiones'))
    const sourceVolume = numberValue(get(row, 'volumen_serie'))
    return {
      date: clean(get(row, 'fecha')),
      trainingType: clean(get(row, 'tipo_entrenamiento')),
      durationMin: numberValue(get(row, 'duracion_min')) || undefined,
      muscleGroup: clean(get(row, 'grupo_muscular')),
      exerciseId: clean(get(row, 'exercise_id')),
      exercise: clean(get(row, 'ejercicio')),
      loadKg,
      rir: numberValue(get(row, 'rir')) || undefined,
      setNumber: numberValue(get(row, 'numero_serie')) || undefined,
      reps,
      volume: sourceVolume || loadKg * reps
    }
  }).filter(row => row.date && row.exercise)
}

export function mergeTrainingRows(current: TrainingRow[], incoming: TrainingRow[]) {
  const seen = new Map<string, TrainingRow>()
  ;[...current, ...incoming].forEach(row => {
    const key = [row.date, row.exerciseId || row.exercise, row.setNumber ?? '', row.loadKg, row.reps].join('|')
    seen.set(key, row)
  })
  return [...seen.values()].sort((a, b) => a.date.localeCompare(b.date))
}
