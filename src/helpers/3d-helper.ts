import type { Detection, ThreeDEstimationOptions } from "../types";
import { MLInternalError } from "../errors";

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
 * バウンディングボックスから3D情報を推定
 *
 * @param boundingBox - バウンディングボックス [x, y, width, height]
 * @param options - 3D推定のオプション
 * @returns 3D情報（深度と傾き）
 */
export function estimate3DInfo(
  boundingBox: [number, number, number, number],
  imageWidth: number,
  options: ThreeDEstimationOptions
): ThreeDInfo {
  const [, , width, height] = boundingBox;
  const { objectSize } = options;

  // 焦点距離を画像幅から自動推定
  const focalLength = imageWidth;

  // 入力値の検証
  if (width <= 0 || height <= 0) {
    throw new MLInternalError("BOUNDING_BOX_SIZE_INVALID");
  }

  if (focalLength <= 0) {
    throw new MLInternalError("FOCAL_LENGTH_INVALID");
  }

  // オプションから物体サイズを取得
  const realSize = {
    width: objectSize.width,
    height: objectSize.height,
    aspectRatio: objectSize.width / objectSize.height,
  };

  // 深度推定
  const depthFromWidth = (realSize.width * focalLength) / width;
  const depthFromHeight = (realSize.height * focalLength) / height;
  const depth = Math.max(
    0.01,
    Math.min(10, Math.min(depthFromWidth, depthFromHeight))
  );

  const result: ThreeDInfo = { depth };

  // 傾き推定を実行
  result.orientation = estimateOrientation(boundingBox, realSize);

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
  imageWidth: number,
  options: ThreeDEstimationOptions
): Detection {
  try {
    const threeDInfo = estimate3DInfo(
      detection.boundingBox,
      imageWidth,
      options
    );

    return {
      ...detection,
      depth: threeDInfo.depth,
      orientation: threeDInfo.orientation,
    };
  } catch (error) {
    return detection;
  }
}
