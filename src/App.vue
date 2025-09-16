<template>
  <div class="app">
    <div class="controls">
      <button @click="toggle2D3D">
        {{ is3D ? '2D режим' : '3D режим' }}
      </button>

      <button @click="generateNewPoint">Новая точка</button>

      <button @click="flyToPoint">Лететь к точке</button>

      <button @click="resetView">Сбросить вид</button>

      <button
        v-if="is3D"
        @click="sideView"
      >
        Боковой обзор
      </button>

      <button
        v-if="is3D && randomPoint"
        @click="showHeightLine"
      >
        {{ showLine ? 'Скрыть' : 'Показать' }} линию высоты
      </button>

      <button
        v-if="is3D && randomPoint"
        @click="addSeaLevelPoint"
      >
        Добавить точку на уровне моря
      </button>

      <button
        v-if="is3D"
        @click="toggleKeyboardControls"
        :class="{ active: keyboardEnabled }"
      >
        {{ keyboardEnabled ? 'Отключить' : 'Включить' }} управление WASD
      </button>

      <div class="info">Режим: {{ is3D ? '3D (Cesium)' : '2D (OpenLayers)' }}</div>

      <div
        v-if="randomPoint"
        class="point-info"
      >
        Точка: {{ pointInfo }}
      </div>

      <div
        v-if="keyboardEnabled && is3D"
        class="keyboard-info"
      >
        🎮 WASD/←↑→↓: движение | Q/E: вверх/вниз | Shift: ускорение
      </div>

      <div
        v-if="is3D"
        class="camera-info"
      >
        📷 Камера: мин. высота 10м
      </div>
    </div>

    <div
      ref="mapContainer"
      class="map-container"
    />
  </div>
</template>

<script setup lang="ts">
  import { onMounted, ref, onUnmounted, computed } from 'vue';
  import { Map, View, Feature } from 'ol';
  import TileLayer from 'ol/layer/Tile';
  import OSM from 'ol/source/OSM';
  import { Vector as VectorLayer } from 'ol/layer';
  import { Vector as VectorSource } from 'ol/source';
  import { Point } from 'ol/geom';
  import { fromLonLat } from 'ol/proj';
  import { Style, Icon, Text, Fill, Stroke } from 'ol/style';
  import { Cartesian3, Math as CesiumMath, Color, PolylineCollection, Material, Scene } from 'cesium';
  import OLCesium from 'olcs';
  import type { OLCesium as OLCS } from 'olcs';
  import type { Coordinate } from 'ol/coordinate';

  type Point3D = { longitude: number; latitude: number; height: number };

  const mapContainer = ref<HTMLDivElement | null>(null);
  let map2d: Map | null = null;
  let map3d: OLCS | null = null;
  let vectorSource: VectorSource | null = null;
  const randomPoint = ref<Point3D | null>(null);
  const is3D = ref(false);
  const showLine = ref(false);
  let heightLinePolyline: PolylineCollection | null = null;

  // Переменные для управления клавиатурой
  const keyboardEnabled = ref(false);
  let keyboardListeners: { [key: string]: boolean } = {};
  let keyboardHandlers: Record<string, (event: KeyboardEvent) => void> | null;
  let animationFrameId: number | null = null;
  const moveSpeed = ref(200); // Скорость движения в метрах

  const pointInfo = computed<string>(() => {
    return `${randomPoint.value?.longitude.toFixed(4)} °,  ${randomPoint.value?.latitude.toFixed(4)}°
    (${randomPoint.value?.height.toLocaleString()} м)`;
  });

  // Генерируем случайную точку на Земле с высотой
  const generateRandomPoint = () => {
    const longitude = (Math.random() - 0.5) * 360; // -180 to 180
    const latitude = (Math.random() - 0.5) * 180; // -90 to 90
    const height = Math.floor(Math.random() * 50000) + 1000; // 1000-51000 метров

    randomPoint.value = { longitude, latitude, height };

    console.log(`Сгенерирована случайная точка: ${pointInfo.value}`);

    return randomPoint;
  };

  // Создаем визуальную точку на карте
  const createPointFeature = () => {
    if (!vectorSource || !randomPoint.value) return;

    // Очищаем предыдущие точки
    vectorSource.clear();

    // Создаем новую точку с Z-координатой
    const coordinates: Coordinate = fromLonLat([randomPoint.value.longitude, randomPoint.value.latitude]);
    // Добавляем высоту как Z-координату
    coordinates.push(randomPoint.value.height);

    const pointFeature = new Feature({
      geometry: new Point(coordinates),
      name: 'Случайная точка',
      height: randomPoint.value.height,
    });

    // Стиль для точки с подписью высоты
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
        text: new Text({
          text: `${randomPoint.value.height.toLocaleString()} м`,
          offsetY: -40,
          fill: new Fill({ color: '#fff' }),
          stroke: new Stroke({ color: '#000', width: 3 }),
          font: 'bold 14px sans-serif',
        }),
      })
    );

    vectorSource.addFeature(pointFeature);

    // Добавляем 3D точку в Cesium (если включен 3D режим)
    create3DPoint();
  };

  // Создаем 3D точку в Cesium
  const create3DPoint = () => {
    if (!map3d || !randomPoint.value) return;

    console.log('Создание 3D точки:', randomPoint.value);

    // Если линия высоты включена, создаем её заново
    if (showLine.value) {
      createHeightLine();
    }
  };

  // Создать вертикальную линию от поверхности до точки
  const createHeightLine = () => {
    if (!map3d || !randomPoint.value) return;

    const scene: Scene = map3d.getCesiumScene();

    // Удаляем предыдущую линию
    if (heightLinePolyline) {
      scene.primitives.remove(heightLinePolyline);
      heightLinePolyline = null;
    }

    // Создаем новую линию от поверхности земли до точки
    const positions = [
      Cartesian3.fromDegrees(randomPoint.value.longitude, randomPoint.value.latitude, 0), // На земле
      Cartesian3.fromDegrees(randomPoint.value.longitude, randomPoint.value.latitude, randomPoint.value.height), // На высоте
    ];

    const polylineCollection = new PolylineCollection();
    polylineCollection.add({
      positions: positions,
      width: 5,
      material: Material.fromType('Color', {
        color: Color.YELLOW,
      }),
      clampToGround: false,
    });

    heightLinePolyline = scene.primitives.add(polylineCollection);
    console.log(`Создана линия высоты ${randomPoint.value.height.toLocaleString()} м`);
  };

  // Переключить отображение линии высоты
  const showHeightLine = () => {
    showLine.value = !showLine.value;

    if (showLine.value) {
      createHeightLine();
    } else {
      // Удаляем линию
      if (heightLinePolyline && map3d) {
        const scene = map3d.getCesiumScene();
        scene.primitives.remove(heightLinePolyline);
        heightLinePolyline = null;
      }
    }
  };

  // Боковой обзор точки для лучшей визуализации высоты
  const sideView = () => {
    if (!map3d || !randomPoint.value) return;

    const scene = map3d.getCesiumScene();

    // Вычисляем оптимальную дистанцию на основе высоты точки
    const distance = Math.max(randomPoint.value.height * 3, 50000);

    // Вычисляем смещение для камеры на основе дистанции
    // Переводим дистанцию в градусы (приблизительно 111км на градус)
    const offsetDegrees = distance / 111000;

    // Позиция камеры для бокового обзора
    const cameraPosition = Cartesian3.fromDegrees(
      randomPoint.value.longitude + offsetDegrees, // Смещение зависит от высоты
      randomPoint.value.latitude,
      randomPoint.value.height * 0.8 // Камера чуть ниже точки для лучшего обзора
    );

    // Сначала устанавливаем камеру в начальную позицию
    scene.camera.setView({
      destination: cameraPosition,
      orientation: {
        heading: CesiumMath.toRadians(-90), // Смотрим на запад (к точке)
        pitch: CesiumMath.toRadians(0), // Горизонтально
        roll: 0,
      },
    });

    // Затем делаем плавный полёт к оптимальной позиции для обзора
    setTimeout(() => {
      const finalCameraPosition = Cartesian3.fromDegrees(
        randomPoint.value!.longitude + offsetDegrees * 0.7, // Ближе к точке
        randomPoint.value!.latitude,
        randomPoint.value!.height + Math.max(randomPoint.value!.height * 0.3, 5000) // Немного выше точки
      );

      scene.camera.flyTo({
        destination: finalCameraPosition,
        duration: 3,
        orientation: {
          heading: CesiumMath.toRadians(-90), // Смотрим на запад
          pitch: CesiumMath.toRadians(-25), // Смотрим немного вниз
          roll: 0,
        },
        complete: () => {
          console.log('Боковой обзор настроен. Дистанция:', distance.toLocaleString(), 'м');
        },
      });
    }, 500);

    console.log(
      'Боковой обзор точки на высоте:',
      randomPoint.value.height.toLocaleString(),
      'м, дистанция камеры:',
      distance.toLocaleString(),
      'м'
    );
  };

  // Добавить контрольную точку на уровне моря для сравнения
  const addSeaLevelPoint = () => {
    if (!vectorSource || !randomPoint.value) return;

    // Создаем точку на уровне моря рядом с основной точкой
    const seaLevelCoordinates: Coordinate = fromLonLat([
      randomPoint.value.longitude + 0.01, // Немного в стороне
      randomPoint.value.latitude,
    ]);
    seaLevelCoordinates.push(0); // Высота 0 метров

    const seaLevelFeature = new Feature({
      geometry: new Point(seaLevelCoordinates),
      name: 'Точка на уровне моря',
      height: 0,
    });

    // Стиль для контрольной точки (синий цвет)
    seaLevelFeature.setStyle(
      new Style({
        image: new Icon({
          src:
            'data:image/svg+xml;utf8,' +
            encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
          <circle cx="16" cy="16" r="12" fill="blue" stroke="white" stroke-width="2"/>
          <text x="16" y="21" text-anchor="middle" fill="white" font-size="16">⚓</text>
        </svg>
      `),
          scale: 1.2,
        }),
        text: new Text({
          text: '0 м (уровень моря)',
          offsetY: -35,
          fill: new Fill({ color: '#fff' }),
          stroke: new Stroke({ color: '#000', width: 3 }),
          font: 'bold 12px sans-serif',
        }),
      })
    );

    vectorSource.addFeature(seaLevelFeature);

    // Добавляем линию между точками, если в 3D режиме
    if (is3D.value && map3d) {
      const scene = map3d.getCesiumScene();

      // Создаем горизонтальную линию между точками на высоте основной точки
      const connectionLine = [
        Cartesian3.fromDegrees(randomPoint.value.longitude, randomPoint.value.latitude, randomPoint.value.height),
        Cartesian3.fromDegrees(
          randomPoint.value.longitude + 0.01,
          randomPoint.value.latitude,
          randomPoint.value.height
        ),
      ];

      const connectionPolyline = new PolylineCollection();
      connectionPolyline.add({
        positions: connectionLine,
        width: 3,
        material: Material.fromType('Color', {
          color: Color.CYAN,
        }),
        clampToGround: false,
      });

      scene.primitives.add(connectionPolyline);

      // Автоматически переключаемся на боковой обзор
      setTimeout(() => {
        sideView();
      }, 1000);
    }

    console.log('Добавлена контрольная точка на уровне моря для сравнения');
  };

  // Функции управления клавиатурой
  const toggleKeyboardControls = () => {
    keyboardEnabled.value = !keyboardEnabled.value;

    if (keyboardEnabled.value) {
      setupKeyboardListeners();
      startKeyboardLoop();
      console.log('Управление клавиатурой включено');
    } else {
      removeKeyboardListeners();
      stopKeyboardLoop();
      console.log('Управление клавиатурой отключено');
    }
  };

  const setupKeyboardListeners = () => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.code.toLowerCase();
      keyboardListeners[key] = true;

      // Предотвращаем стандартное поведение для стрелок
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        event.preventDefault();
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const key = event.code.toLowerCase();
      keyboardListeners[key] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Сохраняем ссылки на функции для последующего удаления
    keyboardHandlers = { handleKeyDown, handleKeyUp };
  };

  const removeKeyboardListeners = () => {
    if (keyboardHandlers) {
      const { handleKeyDown, handleKeyUp } = keyboardHandlers;

      if (handleKeyDown) window.removeEventListener('keydown', handleKeyDown);
      if (handleKeyUp) window.removeEventListener('keyup', handleKeyUp);
      keyboardHandlers = null;
    }
    keyboardListeners = {};
  };

  const startKeyboardLoop = () => {
    const updateCamera = () => {
      if (!keyboardEnabled.value || !is3D.value || !map3d) {
        return;
      }

      const scene = map3d.getCesiumScene();
      const camera = scene.camera;

      // Проверяем, нажат ли Shift для ускорения
      const isShiftPressed = keyboardListeners['shiftleft'] || keyboardListeners['shiftright'];
      const currentMoveSpeed = isShiftPressed ? moveSpeed.value * 3 : moveSpeed.value;

      // Функция для безопасного движения с проверкой высоты
      const safeMove = (moveFunction: () => void) => {
        // Сохраняем текущую позицию
        const originalPosition = camera.position.clone();

        // Выполняем движение
        moveFunction();

        // Проверяем новую высоту
        const newHeight = scene.globe.ellipsoid.cartesianToCartographic(camera.position).height;

        // Если высота меньше минимальной, возвращаем камеру назад
        if (newHeight < 15) {
          camera.position = originalPosition;

          // Поднимаем камеру на безопасную высоту
          const cartographic = scene.globe.ellipsoid.cartesianToCartographic(camera.position);
          cartographic.height = Math.max(cartographic.height, 20);
          camera.position = scene.globe.ellipsoid.cartographicToCartesian(cartographic);
        }
      };

      // Движение вперёд/назад с проверкой
      if (keyboardListeners['keyw'] || keyboardListeners['arrowup']) {
        safeMove(() => camera.moveForward(currentMoveSpeed));
      }
      if (keyboardListeners['keys'] || keyboardListeners['arrowdown']) {
        safeMove(() => camera.moveBackward(currentMoveSpeed));
      }

      // Движение влево/вправо с проверкой
      if (keyboardListeners['keya'] || keyboardListeners['arrowleft']) {
        safeMove(() => camera.moveLeft(currentMoveSpeed));
      }
      if (keyboardListeners['keyd'] || keyboardListeners['arrowright']) {
        safeMove(() => camera.moveRight(currentMoveSpeed));
      }
      // Движение вверх/вниз с проверкой высоты
      if (keyboardListeners['keyq']) {
        camera.moveUp(currentMoveSpeed);
      }
      if (keyboardListeners['keye']) {
        // Проверяем, что камера не опустится ниже минимальной высоты
        const currentHeight = scene.globe.ellipsoid.cartesianToCartographic(camera.position).height;
        if (currentHeight > 15) {
          // Оставляем минимум 15 метров
          camera.moveDown(currentMoveSpeed);
        }
      }

      // Поворот камеры (мышка уже обрабатывается Cesium по умолчанию)
      // Можно добавить клавиши для поворота, но пока оставим мышь

      animationFrameId = requestAnimationFrame(updateCamera);
    };

    updateCamera();
  };

  const stopKeyboardLoop = () => {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  };

  // Настройка управления камерой Cesium
  const setupCesiumCameraControls = () => {
    if (!map3d) return;

    const scene = map3d.getCesiumScene();

    // Настройка контроллера камеры
    const cameraController = scene.screenSpaceCameraController;

    // Настройка минимальной высоты камеры (над землёй)
    cameraController.minimumZoomDistance = 10; // 10 метров над поверхностью

    // Настройка максимальной высоты (опционально)
    cameraController.maximumZoomDistance = 50000000; // 50,000 км

    // Отключаем инверсию через настройку комбинаций клавиш мыши
    // По умолчанию Cesium использует стандартное управление без инверсии

    // Настройка чувствительности и других параметров
    // Понижаем инерцию для более точного управления
    cameraController.inertiaSpin = 0.05; // Меньше инерции при вращении
    cameraController.inertiaTranslate = 0.05; // Меньше инерции при панорамировании
    cameraController.inertiaZoom = 0.05; // Меньше инерции при масштабировании

    console.log('Настройки камеры Cesium применены: мин. высота: 10м, снижена инерция');
  };

  onMounted(() => {
    if (mapContainer.value) {
      try {
        // Создаем векторный слой для точек
        vectorSource = new VectorSource();
        const vectorLayer = new VectorLayer({
          source: vectorSource,
        });

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
        });

        // Создаем OL-Cesium интеграцию
        map3d = new OLCesium({ map: map2d });

        // Настраиваем управление камерой Cesium
        setupCesiumCameraControls();

        // Генерируем случайную точку
        generateRandomPoint();
        createPointFeature();
      } catch (error) {
        console.error('Error initializing map:', error);
      }
    }
  });

  // Очищаем ресурсы при размонтировании
  onUnmounted(() => {
    // Отключаем управление клавиатурой
    if (keyboardEnabled.value) {
      removeKeyboardListeners();
      stopKeyboardLoop();
    }

    if (map3d) {
      map3d.setEnabled(false);
    }
    if (map2d) {
      map2d.getTargetElement()?.remove();
      map2d.dispose();
      map2d = null;
    }
  });

  // Переключение между 2D и 3D режимами
  const toggle2D3D = () => {
    if (map3d) {
      is3D.value = !is3D.value;
      map3d.setEnabled(is3D.value);

      if (is3D.value) {
        console.log('Переключено в 3D режим (Cesium)');
      } else {
        console.log('Переключено в 2D режим (OpenLayers)');
      }
    }
  };

  // Функция сброса вида
  const resetView = () => {
    if (map2d) {
      const view = map2d.getView();
      view.setCenter(fromLonLat([0, 0]));
      view.setZoom(2);

      if (is3D.value && map3d && map3d.getCesiumScene()) {
        const scene = map3d.getCesiumScene();
        scene.camera.setView({
          destination: Cartesian3.fromDegrees(0, 0, 20000000),
          orientation: {
            heading: CesiumMath.toRadians(0),
            pitch: CesiumMath.toRadians(-90),
            roll: 0,
          },
        });
      }
    }
  };

  // Полет к точке
  const flyToPoint = () => {
    if (!map2d || !randomPoint.value) {
      console.log('Карта или точка не инициализированы');
      return;
    }

    console.log(
      `Летим к точке: ${randomPoint.value.longitude.toFixed(4)}°, ${randomPoint.value.latitude.toFixed(4)}°, высота: ${randomPoint.value.height.toLocaleString()} м`
    );

    if (is3D.value && map3d && map3d.getCesiumScene()) {
      // В 3D режиме используем Cesium
      const scene = map3d.getCesiumScene();
      // Используем высоту точки + дополнительная высота для обзора
      const viewHeight = Math.max(randomPoint.value.height + 10000, 30000);
      const destination = Cartesian3.fromDegrees(randomPoint.value.longitude, randomPoint.value.latitude, viewHeight);

      scene.camera.flyTo({
        destination: destination,
        duration: 3,
        complete: () => {
          console.log('Полет завершен в 3D режиме');
        },
      });
    } else {
      // В 2D режиме используем OpenLayers
      const view = map2d.getView();
      const center = fromLonLat([randomPoint.value.longitude, randomPoint.value.latitude]);

      view.animate({
        center: center,
        zoom: 8,
        duration: 2000,
      });

      setTimeout(() => {
        console.log('Полет завершен в 2D режиме');
      }, 2000);
    }
  };

  // Генерируем новую случайную точку
  const generateNewPoint = () => {
    generateRandomPoint();
    createPointFeature();
    console.log('Новая точка создана');
  };
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

  .controls button.active {
    background-color: #28a745;
  }

  .controls button.active:hover {
    background-color: #218838;
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

  .point-info {
    font-weight: bold;
    color: #333;
    padding: 8px 12px;
    background-color: rgba(255, 193, 7, 0.2);
    border-radius: 4px;
    border: 1px solid #ffc107;
    white-space: nowrap;
  }

  .keyboard-info {
    font-size: 12px;
    color: #333;
    padding: 6px 10px;
    background-color: rgba(40, 167, 69, 0.1);
    border-radius: 4px;
    border: 1px solid #28a745;
    white-space: nowrap;
    font-family: 'Courier New', monospace;
  }

  .camera-info {
    font-size: 11px;
    color: #333;
    padding: 4px 8px;
    background-color: rgba(108, 117, 125, 0.1);
    border-radius: 4px;
    border: 1px solid #6c757d;
    white-space: nowrap;
    font-family: 'Courier New', monospace;
  }

  .map-container {
    flex: 1;
    width: 100%;
    height: 0;
    min-height: 0;
    position: relative;
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
