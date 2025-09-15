import * as ol from 'ol';
import Map from 'ol/Map';
import View from 'ol/View';
import { Coordinate } from 'ol/coordinate';
import { ProjectionLike } from 'ol/proj';
import Point from 'ol/geom/Point';

import * as Cesium from 'cesium';

declare global {
  // Расширяем Cesium при необходимости
  namespace Cesium {
    interface SceneOptions {
      canvas?: HTMLCanvasElement;
      scene3DOnly?: boolean;
      [key: string]: unknown; // Для расширения
    }
  }
}

/**
 * Состояние вычисления BoundingSphere.
 */
export enum BoundingSphereState {
  DONE = 0,
  PENDING= 1,
  FAILED= 2,
};

type BoundingSphereState = typeof BoundingSphereState[keyof typeof BoundingSphereState];

/**
 * Параметры для конструктора OLCesium.
 */
export interface OLCesiumOptions {
  /**
   * OpenLayers карта, которую нужно отобразить в Cesium.
   */
  map: Map;

  /**
   * Целевой элемент (DOM или ID), куда будет добавлен Cesium-контейнер.
   * Если не указан — Cesium накладывается поверх карты.
   */
  target?: HTMLElement | string;

  /**
   * Функция создания кастомных синхронизаторов.
   * По умолчанию создаются Raster, Vector и Overlay синхронизаторы.
   */
  createSynchronizers?: (
    map: Map,
    scene: Cesium.Scene,
    dataSourceCollection: Cesium.DataSourceCollection
  ) => AbstractSynchronizer[];

  /**
   * Функция, возвращающая текущее время в формате JulianDate.
   * По умолчанию — `Cesium.JulianDate.now()`.
   */
  time?: () => Cesium.JulianDate;

  /**
   * Предотвращать ли передачу событий мыши/касания в OpenLayers при активном Cesium?
   * Только в режиме наложения (over-map).
   */
  stopOpenLayersEventsPropagation?: boolean;

  /**
   * Дополнительные опции для создания Cesium.Scene.
   */
  sceneOptions?: Cesium.SceneOptions;
}

/**
 * Абстрактный базовый класс для всех синхронизаторов.
 */
export abstract class AbstractSynchronizer {
  constructor(map: Map, scene: Cesium.Scene);

  /**
   * Запускает синхронизацию между OL и Cesium.
   */
  synchronize(): void;

  /**
   * Удаляет все созданные ресурсы.
   */
  destroyAll(): void;
}

/**
 * Класс синхронизации растровых слоёв.
 */
export class RasterSynchronizer extends AbstractSynchronizer {}

/**
 * Класс синхронизации векторных слоёв.
 */
export class VectorSynchronizer extends AbstractSynchronizer {}

/**
 * Класс синхронизации оверлеев (Overlays).
 */
export class OverlaySynchronizer extends AbstractSynchronizer {}

/**
 * Класс управления камерой между OL и Cesium.
 */
export class Camera {
  constructor(scene: Cesium.Scene, map: Map);

  /**
   * Прочитать положение камеры из OpenLayers View.
   */
  readFromView(): void;

  /**
   * Обновить OpenLayers View на основе текущей камеры Cesium.
   */
  updateView(): void;

  /**
   * Проверить изменение камеры и обновить 2D-вид при необходимости.
   */
  checkCameraChange(): void;

  /**
   * Уничтожить камеру и связанные ресурсы.
   */
  destroy(): void;
}

/**
 * Автоматический цикл рендеринга для оптимизации производительности.
 */
export class AutoRenderLoop {
  constructor(olCesium: OLCesium);

  /**
   * Перезапустить цикл рендеринга.
   */
  restartRenderLoop(): void;

  /**
   * Уничтожить цикл.
   */
  destroy(): void;
}

/**
 * Основной класс интеграции OpenLayers и Cesium.
 */
class OLCesium {
  constructor(options: OLCesiumOptions);

  /**
   * Уничтожить все ресурсы Cesium.
   */
  destroy(): void;

  /**
   * Включить или выключить 3D-режим.
   */
  setEnabled(enable: boolean): void;

  /**
   * Получить текущее состояние включения.
   */
  getEnabled(): boolean;

  /**
   * Нагрев Cesium-сцены для быстрого переключения в 3D.
   * @param height Высота камеры при нагреве.
   * @param timeout Время ожидания в миллисекундах.
   */
  warmUp(height: number, timeout: number): void;

  /**
   * Блокировать рендеринг Cesium для экономии ресурсов.
   */
  setBlockCesiumRendering(block: boolean): void;

  /**
   * Включить автоматический цикл рендеринга (экспериментально).
   */
  enableAutoRenderLoop(): void;

  /**
   * Получить экземпляр AutoRenderLoop.
   */
  getAutoRenderLoop(): AutoRenderLoop | null;

  /**
   * Установить масштаб разрешения рендеринга (для оптимизации качества/производительности).
   * 1.0 — полное разрешение, <1.0 — снижение качества.
   */
  setResolutionScale(value: number): void;

  /**
   * Установить целевую частоту кадров (FPS).
   * Используйте `Number.POSITIVE_INFINITY` для максимальной скорости.
   */
  setTargetFrameRate(value: number): void;

  /**
   * Установить поведение синхронизации обратно в 2D.
   * true — только после окончания движения камеры.
   * false — постоянно.
   */
  setRefresh2DAfterCameraMoveEndOnly(value: boolean): void;

  /**
   * Получить доступ к камере Cesium.
   */
  getCamera(): Camera;

  /**
   * Получить связанную карту OpenLayers.
   */
  getOlMap(): Map;

  /**
   * Получить view OpenLayers.
   */
  getOlView(): View;

  /**
   * Получить сцену Cesium.
   */
  getCesiumScene(): Cesium.Scene;

  /**
   * Получить коллекцию источников данных Cesium.
   */
  getDataSources(): Cesium.DataSourceCollection;

  /**
   * Получить дисплей источников данных.
   */
  getDataSourceDisplay(): Cesium.DataSourceDisplay;

  /**
   * Получить или установить отслеживаемый feature (OL Feature).
   * При установке — камера будет следовать за точкой этого объекта.
   */
  trackedFeature: ol.Feature<Point> | null;

  /**
   * Установить отслеживаемый объект (feature). Может быть `null` для отключения.
   */
  set trackedFeature(feature: ol.Feature<Point> | null);

  /**
   * Получить отслеживаемый объект (entity) в Cesium.
   */
  get trackedEntity(): Cesium.Entity | null;
}

// Экспорт по умолчанию
export default OLCesium;

// Именованный экспорт типа
export type { OLCesium };

// ----------------------------------------
// Вспомогательные функции (из util.js и core.js)
// ----------------------------------------

/**
 * Проверяет, поддерживает ли браузер CSS свойство `image-rendering` со значением `pixelated`.
 */
export function supportsImageRenderingPixelated(): boolean;

/**
 * Возвращает значение `image-rendering`, подходящее для пиксельного рендера.
 * Например: `'pixelated'` или `'-moz-crisp-edges'`.
 */
export function imageRenderingValue(): string;

/**
 * Преобразует координату из EPSG:4326 в Cesium Cartesian3.
 */
export function ol4326CoordinateToCesiumCartesian(coordinate: Coordinate): Cesium.Cartesian3;

/**
 * Получить трансформационную функцию между проекциями.
 */
export function getTransform(from: ProjectionLike, to: ProjectionLike): (coordinates: Coordinate) => Coordinate;