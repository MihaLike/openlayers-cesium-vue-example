<template>
  <div class="app">
    <div class="controls">
      <button @click="toggle2D3D">{{ is3D ? '2D режим' : '3D режим' }}</button>
      <button @click="generateNewPoint">Новая точка</button>
      <button @click="flyToPoint">Лететь к точке</button>
      <button @click="resetView">Сбросить вид</button>
      <div class="info">Режим: {{ is3D ? '3D (Cesium)' : '2D (OpenLayers)' }}</div>
    </div>
    
    <div ref="mapContainer" class="map-container" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, onUnmounted } from 'vue'
import { Map, View,Feature } from 'ol'
import TileLayer from 'ol/layer/Tile'
import OSM from 'ol/source/OSM'
import { Vector as VectorLayer } from 'ol/layer'
import { Vector as VectorSource } from 'ol/source'
import { Point } from 'ol/geom'
import { fromLonLat } from 'ol/proj'
import { Style, Icon } from 'ol/style'
import { Cartesian3, Math as CesiumMath } from 'cesium'
import OLCesium from "olcs";
import type { OLCesium as OLCS } from 'olcs'

const mapContainer = ref<HTMLDivElement | null>(null)
let map2d: Map | null = null
let map3d: OLCS | null = null
let vectorSource: VectorSource | null = null
let randomPoint: { longitude: number; latitude: number } | null = null
const is3D = ref(false)

// Генерируем случайную точку на Земле
const generateRandomPoint = () => {
  const longitude = (Math.random() - 0.5) * 360 // -180 to 180
  const latitude = (Math.random() - 0.5) * 180 // -90 to 90

  randomPoint = { longitude, latitude }

  console.log(`Сгенерирована случайная точка: ${longitude.toFixed(4)}°, ${latitude.toFixed(4)}°`)

  return randomPoint
}

// Создаем визуальную точку на карте
const createPointFeature = () => {
  if (!vectorSource || !randomPoint) return

  // Очищаем предыдущие точки
  vectorSource.clear()

  // Создаем новую точку
  const pointFeature = new Feature({
    geometry: new Point(fromLonLat([randomPoint.longitude, randomPoint.latitude])),
    name: 'Случайная точка',
  })

  // Стиль для точки
  pointFeature.setStyle(
    new Style({
      image: new Icon({
        src:
          'data:image/svg+xml;utf8,' +
          encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
          <circle cx="16" cy="16" r="12" fill="red" stroke="white" stroke-width="2"/>
          <text x="16" y="21" text-anchor="middle" fill="white" font-size="16">★</text>
        </svg>
      `),
        scale: 1.5,
      }),
    })
  )

  vectorSource.addFeature(pointFeature)
}

onMounted(() => {
  if (mapContainer.value) {
    try {
      // Создаем векторный слой для точек
      vectorSource = new VectorSource()
      const vectorLayer = new VectorLayer({
        source: vectorSource,
      })

      // Создаем OpenLayers карту
      map2d = new Map({
        target: mapContainer.value,
        layers: [
          new TileLayer({
            source: new OSM(),
          }),
          vectorLayer,
        ],
        view: new View({
          center: fromLonLat([0, 0]),
          zoom: 2,
        }),
      })

      // Создаем OL-Cesium интеграцию
      map3d = new OLCesium({ map: map2d})

      // Генерируем случайную точку
      generateRandomPoint()
      createPointFeature()
    } catch (error) {
      console.error('Error initializing map:', error)
    }
  }
})

// Очищаем ресурсы при размонтировании
onUnmounted(() => {
  if (map3d) {
    map3d.setEnabled(false)
  }
  if (map2d) {
    map2d.getTargetElement()?.remove()
    map2d.dispose()
    map2d = null
  }
})

// Переключение между 2D и 3D режимами
const toggle2D3D = () => {
  if (map3d) {
    is3D.value = !is3D.value
    map3d.setEnabled(is3D.value)

    if (is3D.value) {
      console.log('Переключено в 3D режим (Cesium)')
    } else {
      console.log('Переключено в 2D режим (OpenLayers)')
    }
  }
}

// Функция сброса вида
const resetView = () => {
  if (map2d) {
    const view = map2d.getView()
    view.setCenter(fromLonLat([0, 0]))
    view.setZoom(2)

    if (is3D.value && map3d && map3d.getCesiumScene()) {
      const scene = map3d.getCesiumScene()
      scene.camera.setView({
        destination: Cartesian3.fromDegrees(0, 0, 20000000),
        orientation: {
          heading: CesiumMath.toRadians(0),
          pitch: CesiumMath.toRadians(-90),
          roll: 0,
        },
      })
    }
  }
}

// Полет к точке
const flyToPoint = () => {
  if (!map2d || !randomPoint) {
    console.log('Карта или точка не инициализированы')
    return
  }

  console.log(
    `Летим к точке: ${randomPoint.longitude.toFixed(4)}°, ${randomPoint.latitude.toFixed(4)}°`
  )

  if (is3D.value && map3d && map3d.getCesiumScene()) {
    // В 3D режиме используем Cesium
    const scene = map3d.getCesiumScene()
    const destination = Cartesian3.fromDegrees(randomPoint.longitude, randomPoint.latitude, 30000)

    scene.camera.flyTo({
      destination: destination,
      duration: 3,
      complete: () => {
        console.log('Полет завершен в 3D режиме')
      },
    })
  } else {
    // В 2D режиме используем OpenLayers
    const view = map2d.getView()
    const center = fromLonLat([randomPoint.longitude, randomPoint.latitude])

    view.animate({
      center: center,
      zoom: 8,
      duration: 2000,
    })

    setTimeout(() => {
      console.log('Полет завершен в 2D режиме')
    }, 2000)
  }
}

// Генерируем новую случайную точку
const generateNewPoint = () => {
  generateRandomPoint()
  createPointFeature()
  console.log('Новая точка создана')
}
</script>

<style scoped>
  .app {
    width: 100vw;
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background-color: #000;
  }

  .controls {
    padding: 10px;
    background-color: rgba(255, 255, 255, 0.9);
    border-radius: 8px;
    margin: 10px;
    display: flex;
    gap: 10px;
    align-items: center;
    z-index: 1000;
    flex-wrap: wrap;
    flex-shrink: 0;
  }

  .controls button {
    padding: 8px 16px;
    background-color: #007acc;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    min-width: 120px;
    transition: background-color 0.3s ease;
  }

  .controls button:hover {
    background-color: #005a9e;
  }

  .info {
    margin-left: auto;
    font-weight: bold;
    color: #333;
    padding: 8px 12px;
    background-color: rgba(0, 122, 204, 0.1);
    border-radius: 4px;
    border: 1px solid #007acc;
  }

  .map-container {
    flex: 1;
    width: 100%;
    height: 0;
    min-height: 0;
    position: relative;
  }

  /* Стили для OpenLayers */
  :deep(.ol-viewport) {
    width: 100%;
    height: 100%;
  }

  /* Убираем стандартные контролы OpenLayers если нужно */
  :deep(.ol-zoom) {
    top: 80px;
  }

  :deep(.ol-attribution) {
    display: none;;
  }

  @media (max-width: 768px) {
    .controls {
      flex-direction: column;
      align-items: stretch;
    }

    .controls button,
    .info {
      width: 100%;
      margin-bottom: 5px;
      margin-left: 0;
    }
  }
</style>
