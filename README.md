# DUMMY · Yose's Project

Visor anatómico experimental para analizar los CSV de entrenamientos exportados desde Yose's Project.

## Qué hace el MVP

- Importa uno o varios CSV de `ENTRENAMIENTOS` de Yose's Project.
- Fusiona datos y elimina duplicados de series ya importadas.
- Conserva los datos localmente en el dispositivo/navegador.
- Filtra por 30, 60, 90, 180 días o todo el histórico.
- Filtra por ejercicio.
- Convierte cada ejercicio en una distribución ponderada de grupos musculares.
- Calcula intensidad relativa combinando volumen movido y frecuencia de sesiones.
- Ilumina los grupos musculares sobre un cuerpo 3D interactivo.

## Formato CSV esperado

`fecha;tipo_entrenamiento;duracion_min;grupo_muscular;exercise_id;ejercicio;carga_kg;rir;numero_serie;repeticiones;volumen_serie`

## Desarrollo

```bash
npm install
npm run dev
npm run build
```

## Android

Dummy usa Capacitor pero no necesita secretos de firma. Para una APK debug:

```bash
npm install
npm run build
npx cap add android
npx cap sync android
cd android
./gradlew assembleDebug
```

El APK resultante estará en `android/app/build/outputs/apk/debug/app-debug.apk`.
