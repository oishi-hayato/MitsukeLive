import type { Detection } from "../types";
import { MLInternalError } from "../errors";

/**
 * 3D推定のオプション
 */
export interface ThreeDEstimationOptions {
  /** カメラの焦点距離（ピクセル単位） */
  focalLength: number;
  /** 画像の幅（ピクセル） */
  imageWidth: number;
  /** 画像の高さ（ピクセル） */
  imageHeight: number;
  /** 物体クラス名（必須） */
  className: string;
  /** Z軸傾き推定を有効にする */
  enableOrientationEstimation?: boolean;
}

/**
 * 3D情報（深度と傾き）
 */
export interface ThreeDInfo {
  /** 推定深度（メートル単位） */
  depth: number;
  /** 傾き角度（pitch: 上下傾き、roll: 左右傾き）度単位 */
  orientation?: {
    pitch: number;
    roll: number;
  };
}

/**
 * 物体サイズテーブル（実行時に登録可能）
 */
const REGISTERED_OBJECT_SIZES: Record<
  string,
  { width: number; height: number; aspectRatio: number }
> = {};

/**
 * 物体サイズを登録
 *
 * @param className - 物体クラス名
 * @param width - 幅（メートル単位）
 * @param height - 高さ（メートル単位）
 */
export function setObjectSize(
  className: string,
  width: number,
  height: number
): void {
  if (!className || className.trim().length === 0) {
    throw new MLInternalError("クラス名が不正です", "INVALID_CLASS_NAME");
  }

  if (width <= 0 || height <= 0) {
    throw new MLInternalError("実世界サイズが不正です", "INVALID_REAL_SIZE");
  }

  const aspectRatio = width / height;

  REGISTERED_OBJECT_SIZES[className.toLowerCase()] = {
    width,
    height,
    aspectRatio,
  };
}

/**
 * 登録済み物体クラスの一覧を取得
 */
export function getRegisteredClasses(): string[] {
  return Object.keys(REGISTERED_OBJECT_SIZES);
}

/**
 * バウンディングボックスから3D情報を推定
 *
 * @param boundingBox - バウンディングボックス [x, y, width, height]
 * @param options - 3D推定のオプション
 * @returns 3D情報（深度と傾き）
 */
export function estimate3DInfo(
  boundingBox: [number, number, number, number],
  options: ThreeDEstimationOptions
): ThreeDInfo {
  const [, , width, height] = boundingBox;
  const { focalLength, className } = options;

  // 入力値の検証
  if (width <= 0 || height <= 0) {
    throw new MLInternalError(
      "バウンディングボックスのサイズが不正です",
      "INVALID_BOUNDING_BOX_SIZE"
    );
  }

  if (focalLength <= 0) {
    throw new MLInternalError("焦点距離が不正です", "INVALID_FOCAL_LENGTH");
  }

  // 物体サイズが登録されているかチェック
  const normalizedClassName = className.toLowerCase();
  if (!REGISTERED_OBJECT_SIZES[normalizedClassName]) {
    throw new MLInternalError(
      `物体サイズが登録されていません: ${className}`,
      "OBJECT_SIZE_NOT_REGISTERED"
    );
  }

  const realSize = REGISTERED_OBJECT_SIZES[normalizedClassName];

  // 深度推定
  const depthFromWidth = (realSize.width * focalLength) / width;
  const depthFromHeight = (realSize.height * focalLength) / height;
  const depth = Math.max(
    0.01,
    Math.min(10, Math.min(depthFromWidth, depthFromHeight))
  );

  const result: ThreeDInfo = { depth };

  // 傾き推定が有効な場合
  if (options.enableOrientationEstimation) {
    result.orientation = estimateOrientation(boundingBox, realSize);
  }

  return result;
}

/**
 * バウンディングボックスの形状から物体の傾きを推定
 */
function estimateOrientation(
  boundingBox: [number, number, number, number],
  realSize: { width: number; height: number; aspectRatio: number }
): { pitch: number; roll: number } {
  const [, , width, height] = boundingBox;

  if (width <= 0 || height <= 0) {
    return { pitch: 0, roll: 0 };
  }

  // 現在のアスペクト比
  const currentAspectRatio = width / height;
  const expectedAspectRatio = realSize.aspectRatio;

  // アスペクト比の変化からroll推定（左右傾き）
  const aspectRatioDiff = currentAspectRatio - expectedAspectRatio;
  const roll = Math.max(-45, Math.min(45, aspectRatioDiff * 20));

  // 高さの変化からpitch推定（上下傾き）
  const heightRatio = height / width;
  const expectedHeightRatio = 1 / expectedAspectRatio;
  const pitch = Math.max(
    -30,
    Math.min(30, (expectedHeightRatio - heightRatio) * 15)
  );

  return { pitch, roll };
}

/**
 * 検出結果に3D情報を追加（プラスα処理）
 *
 * @param detection - 検出結果
 * @param options - 3D推定のオプション
 * @returns 3D情報が追加された検出結果
 */
export function add3DToDetection(
  detection: Detection,
  options: ThreeDEstimationOptions
): Detection {
  try {
    const threeDInfo = estimate3DInfo(detection.boundingBox, options);

    return {
      ...detection,
      depth: threeDInfo.depth,
      orientation: threeDInfo.orientation,
    };
  } catch (error) {
    // 3D推定に失敗した場合は元の検出結果をそのまま返す
    console.warn(`[3DEstimator] 3D推定に失敗しました:`, error);
    return detection;
  }
}

/**
 * 複数の検出結果に3D情報を追加
 *
 * @param detections - 検出結果の配列
 * @param options - 3D推定のオプション
 * @returns 3D情報が追加された検出結果の配列
 */
export function add3DToDetections(
  detections: Detection[],
  options: ThreeDEstimationOptions
): Detection[] {
  return detections.map((detection) => add3DToDetection(detection, options));
}
