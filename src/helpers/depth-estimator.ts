import type { Detection } from "../types";
import { MLInternalError } from "../errors";

/**
 * 動的物体サイズテーブル（実行時に登録可能）
 */
const REGISTERED_OBJECT_SIZES: Record<
  string,
  { width: number; height: number; aspectRatio: number }
> = {};

/**
 * Z軸推定のオプション
 */
export interface DepthEstimationOptions {
  /** カメラの焦点距離（ピクセル単位） */
  focalLength: number;
  /** 画像の幅（ピクセル） */
  imageWidth: number;
  /** 画像の高さ（ピクセル） */
  imageHeight: number;
  /** 物体クラス名（オプション） */
  className?: string;
  /** Z軸傾き推定を有効にする */
  enableOrientationEstimation?: boolean;
  /** 前フレームの検出結果（モーション推定用） */
  previousDetections?: Detection[];
  /** フレーム間の時間差（秒）*/
  deltaTime?: number;
}

/**
 * バウンディングボックスのサイズから深度を推定
 * サイズベース（物体サイズが既知の場合）または相対ベース（サイズ不明の場合）で推定
 *
 * @param boundingBox - バウンディングボックス [x, y, width, height]
 * @param options - 深度推定のオプション
 * @returns 推定深度（メートル単位）
 */
export function estimateDepthFromSize(
  boundingBox: [number, number, number, number],
  options: DepthEstimationOptions
): number {
  const [, , width, height] = boundingBox;
  const {
    focalLength,
    className = "default",
    imageWidth,
    imageHeight,
  } = options;

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

  // 動的に登録された物体サイズがある場合は精密計算
  if (className && REGISTERED_OBJECT_SIZES[className]) {
    const realSize = REGISTERED_OBJECT_SIZES[className];
    const depthFromWidth = (realSize.width * focalLength) / width;
    const depthFromHeight = (realSize.height * focalLength) / height;
    const estimatedDepth = Math.min(depthFromWidth, depthFromHeight);
    return Math.max(0.1, Math.min(100, estimatedDepth));
  }

  // デフォルトは相対的な推定（物体サイズ不要）
  return estimateRelativeDepth(boundingBox, {
    focalLength,
    imageWidth,
    imageHeight,
  });
}

/**
 * 相対的な深度推定（物体サイズが不明な場合）
 * バウンディングボックスのサイズと画像内位置から相対的な距離を推定
 *
 * @param boundingBox - バウンディングボックス [x, y, width, height]
 * @param options - 推定オプション
 * @returns 推定深度（メートル単位、相対値）
 */
function estimateRelativeDepth(
  boundingBox: [number, number, number, number],
  options: { focalLength: number; imageWidth: number; imageHeight: number }
): number {
  const [x, y, width, height] = boundingBox;
  const { focalLength, imageWidth, imageHeight } = options;

  // バウンディングボックスの面積比から基本推定
  const boxArea = width * height;
  const imageArea = imageWidth * imageHeight;
  const areaRatio = boxArea / imageArea;

  // 面積比から距離を逆算（経験的な式）
  // 大きな物体ほど近く、小さな物体ほど遠いと仮定
  const baseDepth = Math.sqrt(1 / areaRatio) * (focalLength / 100);

  // 画像内位置による補正
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const normalizedX = centerX / imageWidth;
  const normalizedY = centerY / imageHeight;

  // 中央からの距離（遠近感の補正）
  const distanceFromCenter = Math.sqrt(
    Math.pow(normalizedX - 0.5, 2) + Math.pow(normalizedY - 0.5, 2)
  );

  // 中央に近いほど近く、端に行くほど遠いと仮定
  const positionFactor = 1 + distanceFromCenter * 0.5;

  const estimatedDepth = baseDepth * positionFactor;

  // 現実的な範囲に制限（0.5m～50m）
  return Math.max(0.5, Math.min(50, estimatedDepth));
}

/**
 * モーション解析による深度推定（物体サイズ不要）
 * フレーム間の動きから視差を計算して深度を推定
 *
 * @param currentDetection - 現在フレームの検出結果
 * @param previousDetections - 前フレームの検出結果配列
 * @param options - 推定オプション
 * @returns 推定深度（メートル単位）またはnull（推定不可）
 */
export function estimateDepthFromMotion(
  currentDetection: Detection,
  previousDetections: Detection[],
  options: {
    deltaTime: number;
    focalLength: number;
    cameraMotion?: { x: number; y: number };
  }
): number | null {
  const { deltaTime, focalLength, cameraMotion = { x: 0, y: 0 } } = options;

  if (!previousDetections.length || deltaTime <= 0) {
    return null;
  }

  // 最も近い前フレームの検出結果を見つける
  const currentCenter = getCenterPoint(currentDetection.boundingBox);
  let closestPrevious: Detection | null = null;
  let minDistance = Infinity;

  for (const prev of previousDetections) {
    const prevCenter = getCenterPoint(prev.boundingBox);
    const distance = Math.sqrt(
      Math.pow(currentCenter.x - prevCenter.x, 2) +
        Math.pow(currentCenter.y - prevCenter.y, 2)
    );

    if (distance < minDistance) {
      minDistance = distance;
      closestPrevious = prev;
    }
  }

  if (!closestPrevious || minDistance > 100) {
    // 100px以上離れていると別物体とみなす
    return null;
  }

  // 視差計算
  const prevCenter = getCenterPoint(closestPrevious.boundingBox);
  const disparity = {
    x: currentCenter.x - prevCenter.x - cameraMotion.x,
    y: currentCenter.y - prevCenter.y - cameraMotion.y,
  };

  // 視差の大きさから深度を推定
  const disparityMagnitude = Math.sqrt(
    disparity.x * disparity.x + disparity.y * disparity.y
  );

  if (disparityMagnitude < 1) {
    // 動きが小さすぎる場合
    return null;
  }

  // 基本的な視差-深度の関係（経験的）
  // 近い物体ほど大きく動き、遠い物体ほど小さく動く
  const velocity = disparityMagnitude / deltaTime; // ピクセル/秒
  const estimatedDepth = (focalLength * 0.1) / Math.max(velocity * 0.01, 0.1);

  return Math.max(0.5, Math.min(100, estimatedDepth));
}

/**
 * バウンディングボックスの中心点を取得
 */
function getCenterPoint(boundingBox: [number, number, number, number]): {
  x: number;
  y: number;
} {
  const [x, y, width, height] = boundingBox;
  return {
    x: x + width / 2,
    y: y + height / 2,
  };
}

/**
 * 画像内の位置に基づく深度補正
 * 透視投影の効果を考慮し、画像の下部ほど近く、上部ほど遠いとみなす
 *
 * @param boundingBox - バウンディングボックス [x, y, width, height]
 * @param baseDepth - 基本深度（メートル単位）
 * @param options - 深度推定のオプション
 * @returns 補正された深度（メートル単位）
 */
export function adjustDepthByPosition(
  boundingBox: [number, number, number, number],
  baseDepth: number,
  options: DepthEstimationOptions
): number {
  const [, y, , height] = boundingBox;
  const { imageWidth, imageHeight } = options;

  // 入力値の検証
  if (imageWidth <= 0 || imageHeight <= 0) {
    throw new MLInternalError("画像サイズが不正です", "INVALID_IMAGE_SIZE");
  }

  if (baseDepth <= 0) {
    throw new MLInternalError("基本深度が不正です", "INVALID_BASE_DEPTH");
  }

  // バウンディングボックスのボトムを計算
  const bottomY = y + height;

  // 正規化された縦位置（0.0=上端, 1.0=下端）
  const normalizedBottomY = bottomY / imageHeight;

  // 位置による補正係数（画像下部ほど近い）
  // 物体の底辺位置を重視した補正
  const positionFactor = 1.0 - normalizedBottomY * 0.4;

  // 補正係数を適用（0.6～1.4の範囲で調整）
  const adjustmentFactor = 0.6 + positionFactor * 0.8;

  return baseDepth * adjustmentFactor;
}

/**
 * バウンディングボックスの形状から物体の傾きを推定
 * アスペクト比の変化から pitch と roll を推定
 *
 * @param boundingBox - バウンディングボックス [x, y, width, height]
 * @param options - 深度推定のオプション
 * @returns 推定された傾き角度 {pitch, roll}（度単位）
 */
export function estimateOrientation(
  boundingBox: [number, number, number, number],
  options: DepthEstimationOptions
): { pitch: number; roll: number } {
  const [, , width, height] = boundingBox;
  const { className = "default", imageHeight } = options;

  // 入力値の検証
  if (width <= 0 || height <= 0) {
    return { pitch: 0, roll: 0 };
  }

  // 現在のアスペクト比
  const currentAspectRatio = width / height;

  // 登録された物体サイズがある場合はそれを使用、なければ一般的な推定
  let expectedAspectRatio = 1.0; // デフォルト値
  if (className && REGISTERED_OBJECT_SIZES[className]) {
    expectedAspectRatio = REGISTERED_OBJECT_SIZES[className].aspectRatio;
  } else {
    // アスペクト比から物体タイプを推定
    if (currentAspectRatio < 0.5) {
      expectedAspectRatio = 0.4; // 縦長物体（人、ボトルなど）
    } else if (currentAspectRatio > 1.5) {
      expectedAspectRatio = 1.8; // 横長物体（車、テーブルなど）
    } else {
      expectedAspectRatio = 1.0; // 正方形に近い物体
    }
  }

  // アスペクト比の変化からroll推定（左右傾き）
  const aspectRatioDiff = currentAspectRatio - expectedAspectRatio;
  const roll = Math.max(-45, Math.min(45, aspectRatioDiff * 20)); // -45～45度に制限

  // バウンディングボックスの位置と形状からpitch推定（上下傾き）
  const centerY = boundingBox[1] + height / 2;
  const normalizedCenterY = centerY / imageHeight;

  // 画像上部にある物体は手前に傾いている可能性が高い
  // 画像下部にある物体は奥に傾いている可能性が高い
  const positionBasedPitch = (0.5 - normalizedCenterY) * 20; // -10～10度

  // 高さの変化からも推定（縦に圧縮されていると奥向き）
  const heightRatio = height / width;
  const expectedHeightRatio = 1 / expectedAspectRatio;
  const heightBasedPitch = (expectedHeightRatio - heightRatio) * 15; // 最大±15度

  const pitch = Math.max(
    -30,
    Math.min(30, positionBasedPitch + heightBasedPitch)
  );

  return { pitch, roll };
}

/**
 * 検出結果に深度情報を追加
 *
 * @param detections - 検出結果の配列
 * @param options - 深度推定のオプション
 * @returns 深度情報が追加された検出結果の配列
 */
export function addDepthToDetections(
  detections: Detection[],
  options: DepthEstimationOptions
): Detection[] {
  if (!detections || detections.length === 0) {
    return detections;
  }

  return detections.map((detection) => {
    try {
      let finalDepth: number;

      // モーション推定を試行（前フレームデータがある場合）
      if (options.previousDetections && options.deltaTime) {
        const motionDepth = estimateDepthFromMotion(
          detection,
          options.previousDetections,
          {
            deltaTime: options.deltaTime,
            focalLength: options.focalLength,
          }
        );

        if (motionDepth !== null) {
          // モーション推定成功
          finalDepth = motionDepth;
        } else {
          // モーション推定失敗、サイズベース推定にフォールバック
          const baseDepth = estimateDepthFromSize(
            detection.boundingBox,
            options
          );
          finalDepth = adjustDepthByPosition(
            detection.boundingBox,
            baseDepth,
            options
          );
        }
      } else {
        // サイズベース推定
        const baseDepth = estimateDepthFromSize(detection.boundingBox, options);
        finalDepth = adjustDepthByPosition(
          detection.boundingBox,
          baseDepth,
          options
        );
      }

      const result: Detection = {
        ...detection,
        depth: finalDepth,
      };

      // 傾き推定が有効な場合は傾き情報も追加
      if (options.enableOrientationEstimation) {
        result.orientation = estimateOrientation(
          detection.boundingBox,
          options
        );
      }

      return result;
    } catch (error) {
      // エラーが発生した場合は深度情報なしで返す
      console.warn(`[DepthEstimator] 深度推定に失敗しました:`, error);
      return detection;
    }
  });
}

/**
 * 物体クラス名の登録
 * カスタム物体クラスの実世界サイズを設定
 *
 * @param className - クラス名
 * @param realSize - 実世界サイズ（メートル単位）
 */
export function registerObjectSize(
  className: string,
  realSize: { width: number; height: number; aspectRatio?: number }
): void {
  if (!className || className.trim().length === 0) {
    throw new MLInternalError("クラス名が不正です", "INVALID_CLASS_NAME");
  }

  if (realSize.width <= 0 || realSize.height <= 0) {
    throw new MLInternalError("実世界サイズが不正です", "INVALID_REAL_SIZE");
  }

  const aspectRatio = realSize.aspectRatio ?? realSize.width / realSize.height;

  REGISTERED_OBJECT_SIZES[className.toLowerCase()] = {
    width: realSize.width,
    height: realSize.height,
    aspectRatio,
  };
}

/**
 * 簡単な物体サイズ登録（幅と高さのみ指定）
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
  registerObjectSize(className, { width, height });
}

/**
 * 複数の物体サイズを一度に登録
 *
 * @param sizes - 物体サイズのマップ
 */
export function setObjectSizes(
  sizes: Record<string, { width: number; height: number }>
): void {
  for (const [className, size] of Object.entries(sizes)) {
    registerObjectSize(className, size);
  }
}


/**
 * 登録済み物体クラスの一覧を取得
 *
 * @returns 物体クラス名の配列
 */
export function getRegisteredClasses(): string[] {
  return Object.keys(REGISTERED_OBJECT_SIZES);
}
