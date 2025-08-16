import type { Detection } from "../types";
import * as THREE from "three";


/**
 * 3D位置計算のオプション
 */
export interface Position3DOptions {
  /** Three.jsのカメラオブジェクト */
  camera: THREE.Camera;
  /** キャンバスの幅 */
  canvasWidth: number;
  /** キャンバスの高さ */
  canvasHeight: number;
  /** 最小Z距離（デフォルト: 2.0） */
  minDepth?: number;
}

/**
 * 3D位置情報
 */
export interface Position3D {
  /** ワールドX座標 */
  x: number;
  /** ワールドY座標 */
  y: number;
  /** ワールドZ座標 */
  z: number;
}

/**
 * 相対配置のオプション
 */
export interface RelativePositionOptions extends Position3DOptions {
  /** X軸のオフセット（検出オブジェクト中心からの相対位置） */
  offsetX?: number;
  /** Y軸のオフセット（検出オブジェクト中心からの相対位置） */
  offsetY?: number;
  /** Z軸のオフセット（検出オブジェクト中心からの相対位置） */
  offsetZ?: number;
}

/**
 * 検出されたオブジェクトの画面座標から3Dワールド座標を計算
 *
 * @param detection 検出結果
 * @param options 3D位置計算のオプション
 * @returns 3Dワールド座標
 */
export function calculate3DPosition(
  detection: Detection,
  options: Position3DOptions
): Position3D {
  const { camera, canvasWidth, canvasHeight, minDepth = 2.0 } = options;

  // 検出されたバウンディングボックスの情報を取得
  const [x, y] = detection.boundingBox;

  // client-flashと同じ座標計算（translateの位置が実際の中心）
  const centerX = x;
  const centerY = y;

  const vector = new THREE.Vector3();

  // キャンバス座標系をThree.jsの正規化デバイス座標に変換
  vector.x = (centerX / canvasWidth) * 2 - 1;
  vector.y = -(centerY / canvasHeight) * 2 + 1; // Y軸反転
  vector.z = 0.5; // 中間の深度値

  // 正規化デバイス座標からワールド座標に変換
  vector.unproject(camera);

  // 深度を使用してZ位置を設定
  const depth = detection.depth || 1.0;
  const targetZ = -Math.max(minDepth, depth);

  // カメラからオブジェクトへの方向ベクトル
  const direction = vector.sub(camera.position).normalize();

  // 指定されたZ位置でのワールド座標を計算
  const distance = Math.abs(targetZ - camera.position.z);
  const worldPosition = camera.position
    .clone()
    .add(direction.multiplyScalar(distance));
  worldPosition.z = targetZ;

  return {
    x: worldPosition.x,
    y: worldPosition.y,
    z: worldPosition.z,
  };
}

/**
 * バウンディングボックスのサイズに基づいて3Dオブジェクトのスケールを計算
 *
 * @param detection 検出結果
 * @param canvasWidth キャンバスの幅
 * @param canvasHeight キャンバスの高さ
 * @param baseScale 基準スケール（デフォルト: 2.0）
 * @returns 計算されたスケール値
 */
export function calculate3DScale(
  detection: Detection,
  canvasWidth: number,
  canvasHeight: number,
  baseScale: number = 2.0
): number {
  const [, , width, height] = detection.boundingBox;
  const depth = detection.depth || 1.0;

  // バウンディングボックスの画面占有率
  const boxSizeRatio = Math.sqrt(
    (width * height) / (canvasWidth * canvasHeight)
  );

  // 深度スケール（基準値を大きく）
  const depthScale = Math.max(0.5, Math.min(3.0, 1.0 / depth));

  // 最終スケール（基準値を適用）
  const sizeScale = boxSizeRatio * depthScale * baseScale;

  // 範囲制限
  return Math.max(0.1, Math.min(2.5, sizeScale));
}

/**
 * 検出オブジェクトの中心を原点とした相対位置でオブジェクトを配置
 *
 * @param detection 検出結果
 * @param options 相対配置のオプション
 * @returns 相対配置された3Dワールド座標
 */
export function calculateRelativePosition(
  detection: Detection,
  options: RelativePositionOptions
): Position3D {
  const { offsetX = 0, offsetY = 0, offsetZ = 0 } = options;

  // まず検出オブジェクトの中心位置を計算
  const centerPosition = calculate3DPosition(detection, options);

  // 検出オブジェクトの中心を原点として、相対オフセットを適用
  const relativePosition = new THREE.Vector3(
    centerPosition.x + offsetX,
    centerPosition.y + offsetY,
    centerPosition.z + offsetZ
  );

  return {
    x: relativePosition.x,
    y: relativePosition.y,
    z: relativePosition.z,
  };
}

/**
 * 複数のオブジェクトを検出オブジェクト中心の相対位置に配置
 *
 * @param detection 基準となる検出結果
 * @param objectPositions オブジェクトの相対位置配列 [{offsetX, offsetY, offsetZ}, ...]
 * @param options 基本の3D位置計算オプション
 * @returns 各オブジェクトの3D位置配列
 */
export function calculateMultipleRelativePositions(
  detection: Detection,
  objectPositions: Array<{
    offsetX?: number;
    offsetY?: number;
    offsetZ?: number;
  }>,
  options: Position3DOptions
): Position3D[] {
  return objectPositions.map((offset) =>
    calculateRelativePosition(detection, { ...options, ...offset })
  );
}
