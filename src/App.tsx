import { useCallback, useMemo, useRef, useState } from 'react'
import BodyModel from './BodyModel'
import { mergeTrainingRows, parseTrainingCsv } from './csv'
import { calculateMuscleMetrics } from './muscleMap'
import type { MuscleId, TrainingRow } from './types'
import ritualNebula from './assets/ritual-nebula.png'
import ritualMoon from './assets/ritual-moon.png'

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

function RitualHeader() {
  return <div className="ritual" aria-hidden="true">
    <svg viewBox="0 0 360 150" preserveAspectRatio="xMidYMid meet">
      <g className="ritual-emblem">
        <g className="ritual-moon-layer">
          <image href={ritualMoon} x="134" y="31" width="92" height="92" preserveAspectRatio="xMidYMid meet" className="ritual-moon-image" />
        </g>
        <g className="ritual-lines ritual-structure">
          <path d="M180 4v138"/>
          <path d="M90 86h180"/>
          <path d="M180 24 145 78l35 46 35-46Z"/>
          <circle cx="180" cy="77" r="46"/>
          <circle cx="180" cy="77" r="30" strokeDasharray="3 6"/>
          <path d="M144 20a50 50 0 0 0 72 0 43 43 0 0 1-72 0Z"/>
          <path d="M155 20c8 8 17 12 25 12s17-4 25-12"/>
        </g>
        <circle className="ritual-core" cx="180" cy="77" r="13"/>
      </g>
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
  const [selectedAnatomyKey, setSelectedAnatomyKey] = useState<string | undefined>()
  const [selectedAnatomyLabel, setSelectedAnatomyLabel] = useState<string | undefined>()
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

  const clearSelection = () => {
    setSelectedMuscle(undefined)
    setSelectedAnatomyKey(undefined)
    setSelectedAnatomyLabel(undefined)
  }

  const clearData = () => {
    setRows([])
    saveRows([])
    setExercise('ALL')
    clearSelection()
    setNotice('DATOS ELIMINADOS')
  }

  const onSelectMuscle = useCallback((muscle?: MuscleId, anatomyKey?: string, anatomyLabel?: string) => {
    setSelectedMuscle(muscle)
    setSelectedAnatomyKey(anatomyKey)
    setSelectedAnatomyLabel(anatomyLabel)
  }, [])

  const selectMetricGroup = (muscle: MuscleId) => {
    setSelectedMuscle(muscle)
    setSelectedAnatomyKey(undefined)
    setSelectedAnatomyLabel(undefined)
  }

  return <main className="app-shell">
    <section className="phone-surface home-screen">
      <div className="header-nebula" style={{ backgroundImage: `url(${ritualNebula})` }} aria-hidden="true" />
      <div className="noise" />

      <header className="topbar">
        <div className="brand"><span>DUMMY</span><small>YOSE'S PROJECT</small></div>
        <button className="import-mini" onClick={() => inputRef.current?.click()}>CSV +</button>
      </header>

      <div className="home-hero-copy-row">
        <div className="hero-copy left">DISCIPLINA<br/>CONSTRUYE<br/><em>LIBERTAD</em></div>
        <div className="hero-copy right">MENTE<br/>MÁS CLARA<br/><em>CUERPO MÁS FUERTE</em></div>
      </div>
      <RitualHeader />

      <div className="intro">
        <p>VOLUMEN · FRECUENCIA · DISTRIBUCIÓN</p>
        <h1>MAPA MUSCULAR</h1>
        <span>1 DEDO ROTA · 2 DEDOS DESPLAZAN / ZOOM · TOCA UN MÚSCULO</span>
      </div>

      <section className="model-card">
        <div className="scanlines" />
        <BodyModel
          metrics={metrics}
          selectedMuscle={selectedMuscle}
          selectedAnatomyKey={selectedAnatomyKey}
          onSelectMuscle={onSelectMuscle}
        />
        <div className="model-hud model-hud-left"><b>{sessionCount}</b><span>SESIONES</span></div>
        <div className="model-hud model-hud-right"><b>{formatVolume(totalVolume)}</b><span>KG VOLUMEN</span></div>
        {selectedMetric && <div className="muscle-tooltip">
          <small>{selectedAnatomyLabel ? 'MÚSCULO SELECCIONADO' : 'GRUPO DE ENTRENAMIENTO'}</small>
          <strong>{(selectedAnatomyLabel || selectedMetric.label).toUpperCase()}</strong>
          <span>{selectedMetric.score}% ACTIVACIÓN · {selectedMetric.label.toUpperCase()}</span>
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
        {activeMetrics.length ? activeMetrics.slice(0, 8).map(metric => <button key={metric.id} className={selectedMuscle === metric.id && !selectedAnatomyKey ? 'selected' : ''} onClick={() => selectMetricGroup(metric.id)}>
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

      <footer>BODYPARTS3D · EL CUERPO LLEVA LA CUENTA, AUNQUE TÚ NO.</footer>
    </section>
  </main>
}
