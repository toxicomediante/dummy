import { useCallback, useMemo, useRef, useState } from 'react'
import BodyModel from './BodyModel'
import { mergeTrainingRows, parseTrainingCsv } from './csv'
import { calculateMuscleMetrics } from './muscleMap'
import type { MuscleId, TrainingRow } from './types'

const STORAGE_KEY = 'dummy-training-rows-v1'
const PERIODS = [30, 60, 90, 180, 0] as const

function loadRows(): TrainingRow[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveRows(rows: TrainingRow[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows))
}

function RitualMark() {
  return <div className="ritual-mark" aria-hidden="true">
    <svg viewBox="0 0 320 145">
      <circle cx="160" cy="72" r="46" />
      <circle cx="160" cy="72" r="30" strokeDasharray="3 7" />
      <path d="M160 6v132M78 72h164M160 17l-37 55 37 50 37-50Z" />
      <path d="M123 18a51 51 0 0 0 74 0 44 44 0 0 1-74 0Z" />
      <circle className="ritual-core" cx="160" cy="72" r="10" />
    </svg>
  </div>
}

function formatVolume(value: number) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
  if (value >= 1000) return `${Math.round(value / 1000)}K`
  return `${Math.round(value)}`
}

export default function App() {
  const [rows, setRows] = useState<TrainingRow[]>(loadRows)
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>(30)
  const [exercise, setExercise] = useState('ALL')
  const [selectedMuscle, setSelectedMuscle] = useState<MuscleId | undefined>()
  const [notice, setNotice] = useState(rows.length ? `${rows.length} SERIES CARGADAS` : 'SIN DATOS IMPORTADOS')
  const inputRef = useRef<HTMLInputElement | null>(null)

  const exerciseOptions = useMemo(() => {
    const map = new Map<string, string>()
    rows.forEach(row => map.set(row.exerciseId || row.exercise, row.exercise))
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'))
  }, [rows])

  const filteredRows = useMemo(() => {
    const cutoff = period ? new Date(Date.now() - period * 86400000) : null
    return rows.filter(row => {
      if (exercise !== 'ALL' && (row.exerciseId || row.exercise) !== exercise) return false
      if (!cutoff) return true
      const date = new Date(`${row.date}T23:59:59`)
      return date >= cutoff
    })
  }, [rows, period, exercise])

  const metrics = useMemo(() => calculateMuscleMetrics(filteredRows), [filteredRows])
  const activeMetrics = metrics.filter(metric => metric.score > 0)
  const selectedMetric = selectedMuscle ? metrics.find(metric => metric.id === selectedMuscle) : undefined
  const sessionCount = new Set(filteredRows.map(row => row.date)).size
  const totalVolume = filteredRows.reduce((sum, row) => sum + row.volume, 0)

  const importFiles = async (files: FileList | null) => {
    if (!files?.length) return
    try {
      let merged = rows
      for (const file of Array.from(files)) {
        const text = await file.text()
        merged = mergeTrainingRows(merged, parseTrainingCsv(text))
      }
      setRows(merged)
      saveRows(merged)
      setNotice(`${merged.length} SERIES · ${new Set(merged.map(row => row.date)).size} SESIONES`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'NO SE PUDO IMPORTAR EL CSV')
    }
  }

  const clearData = () => {
    setRows([])
    saveRows([])
    setExercise('ALL')
    setSelectedMuscle(undefined)
    setNotice('DATOS ELIMINADOS')
  }

  const onSelectMuscle = useCallback((muscle?: MuscleId) => setSelectedMuscle(muscle), [])

  return <main className="app-shell">
    <section className="phone-surface">
      <div className="noise" />
      <header className="topbar">
        <div className="brand"><span>DUMMY</span><small>YOSE'S PROJECT</small></div>
        <button className="import-mini" onClick={() => inputRef.current?.click()}>CSV +</button>
      </header>

      <RitualMark />
      <div className="intro">
        <p>VOLUMEN · FRECUENCIA · DISTRIBUCIÓN</p>
        <h1>MAPA MUSCULAR</h1>
        <span>ARRASTRA EL CUERPO · TOCA UN GRUPO MUSCULAR</span>
      </div>

      <section className="model-card">
        <div className="scanlines" />
        <BodyModel metrics={metrics} selectedMuscle={selectedMuscle} onSelectMuscle={onSelectMuscle} />
        <div className="model-hud model-hud-left"><b>{sessionCount}</b><span>SESIONES</span></div>
        <div className="model-hud model-hud-right"><b>{formatVolume(totalVolume)}</b><span>KG VOLUMEN</span></div>
        {selectedMetric && <div className="muscle-tooltip">
          <small>GRUPO SELECCIONADO</small>
          <strong>{selectedMetric.label.toUpperCase()}</strong>
          <span>{selectedMetric.score}% ACTIVACIÓN RELATIVA</span>
        </div>}
      </section>

      <section className="control-card">
        <div className="section-label"><span>PERIODO</span><i /></div>
        <div className="period-grid">
          {PERIODS.map(value => <button key={value} className={period === value ? 'active' : ''} onClick={() => setPeriod(value)}>{value || 'TODO'}{value ? 'D' : ''}</button>)}
        </div>
        <label className="exercise-filter">
          <span>EJERCICIO</span>
          <select value={exercise} onChange={event => setExercise(event.target.value)}>
            <option value="ALL">TODOS LOS EJERCICIOS</option>
            {exerciseOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
      </section>

      <section className="muscle-list">
        <div className="section-label"><span>ACTIVACIÓN RELATIVA</span><i /></div>
        {activeMetrics.length ? activeMetrics.slice(0, 8).map(metric => <button key={metric.id} className={selectedMuscle === metric.id ? 'selected' : ''} onClick={() => setSelectedMuscle(metric.id)}>
          <div><strong>{metric.label}</strong><small>{metric.sessions} sesiones · {Math.round(metric.sets)} series ponderadas</small></div>
          <span className="bar"><i style={{ width: `${metric.score}%` }} /></span>
          <b>{metric.score}</b>
        </button>) : <div className="empty-state">IMPORTA EL CSV DE ENTRENAMIENTOS PARA ENCENDER EL CUERPO.</div>}
      </section>

      <section className="data-card">
        <div>
          <small>DATOS</small>
          <strong>{notice}</strong>
        </div>
        <button className="primary" onClick={() => inputRef.current?.click()}>IMPORTAR CSV</button>
        {!!rows.length && <button className="ghost" onClick={clearData}>BORRAR DATOS</button>}
        <input ref={inputRef} hidden type="file" accept=".csv,text/csv" multiple onChange={event => void importFiles(event.target.files)} />
      </section>

      <footer>EL CUERPO LLEVA LA CUENTA, AUNQUE TÚ NO.</footer>
    </section>
  </main>
}
