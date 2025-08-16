import type * as tf from "@tensorflow/tfjs";
import type { LetterboxInfo, Detection } from "../types";
import { MLInternalError } from "../errors";

// 型エイリアス
type BoundingBox = [number, number, number, number];
type Rect = { x: number; y: number; width: number; height: number };
type PaddingList = [[number, number], [number, number], [number, number]];

// 定数
const RADIANS_TO_DEGREES = 180 / Math.PI;

/**
 * ラジアンから度への変換
 *
 * @param radians - ラジアン値（有限の数値のみ。NaN、Infinity、-Infinityは無効）
 * @returns 度数値（ラジアン値 × 180 / π）
 */
export function convertRadiansToDegrees(radians: number): number {
  if (!Number.isFinite(radians)) {
    throw new MLInternalError("INVALID_RADIAN_VALUE", false);
  }

  return radians * RADIANS_TO_DEGREES;
}

/**
 * アスペクト比維持でのスケール計算
 *
 * @param sourceWidth - 元画像の幅
 * @param sourceHeight - 元画像の高さ
 * @param targetWidth - 目標幅
 * @param targetHeight - 目標高さ
 * @returns スケール情報オブジェクト
 */
export function calculateOptimalScale(
  originalWidth: number,
  originalHeight: number,
  targetWidth: number = 640,
  targetHeight: number = 640
): { scaleRatio: number; scaledWidth: number; scaledHeight: number } {
  if (originalWidth <= 0 || originalHeight <= 0) {
    throw new MLInternalError("INVALID_IMAGE_DIMENSIONS");
  }

  const scaleRatio = Math.min(
    targetWidth / originalWidth,
    targetHeight / originalHeight
  );
  const scaledWidth = Math.round(originalWidth * scaleRatio);
  const scaledHeight = Math.round(originalHeight * scaleRatio);

  return { scaleRatio, scaledWidth, scaledHeight };
}

/**
 * レターボックス処理のための中央揃えパディングを計算
 * TensorFlow.js の pad にそのまま渡せる形式で返す
 *
 * @param scaledWidth - スケール後の幅
 * @param scaledHeight - スケール後の高さ
 * @param targetWidth - 目標幅
 * @param targetHeight - 目標高さ
 * @returns パディング情報オブジェクト
 */
export function calculatePadding(
  scaledWidth: number,
  scaledHeight: number,
  letterboxWidth: number = 640,
  letterboxHeight: number = 640
): {
  top: number;
  left: number;
  paddingList: PaddingList;
} {
  if (scaledWidth > letterboxWidth || scaledHeight > letterboxHeight) {
    throw new MLInternalError("RESIZED_IMAGE_EXCEEDS_TARGET");
  }

  const paddingWidth = letterboxWidth - scaledWidth;
  const paddingHeight = letterboxHeight - scaledHeight;
  const top = Math.floor(paddingHeight / 2);
  const bottom = paddingHeight - top;
  const left = Math.floor(paddingWidth / 2);
  const right = paddingWidth - left;

  const paddingList: PaddingList = [
    [top, bottom],
    [left, right],
    [0, 0],
  ];

  return { top, left, paddingList };
}

/**
 * YOLO入力用のレターボックス変換
 *
 * @param image - 変換対象の3次元画像テンソル [height, width, channels]
 * @param targetShape - 目標サイズ [height, width]（デフォルト: [640, 640]）
 * @returns 変換後の画像テンソルと変換情報
 */
export function letterboxTransform(
  image: tf.Tensor3D,
  letterboxShape: [number, number] = [640, 640]
): { output: tf.Tensor3D; letterboxInfo: LetterboxInfo } {
  // 入力検証: 3次元テンソルかどうか
  if (image.shape.length !== 3) {
    throw new MLInternalError("INPUT_MUST_BE_3D_TENSOR");
  }

  // 入力検証: 目標サイズが正の値かどうか
  const [letterboxHeight, letterboxWidth] = letterboxShape;
  if (letterboxWidth <= 0 || letterboxHeight <= 0) {
    throw new MLInternalError("INVALID_TARGET_IMAGE_SIZE");
  }

  const [originalHeight, originalWidth] = image.shape;

  // アスペクト比を維持したスケールとリサイズ後のサイズを計算
  const { scaleRatio, scaledWidth, scaledHeight } = calculateOptimalScale(
    originalWidth,
    originalHeight,
    letterboxWidth,
    letterboxHeight
  );

  // リサイズ後のテンソル（中間オブジェクト）
  const resizedImage = image.resizeBilinear([scaledHeight, scaledWidth]);

  try {
    // レターボックス用のパディング量を計算
    const { top, left, paddingList } = calculatePadding(
      scaledWidth,
      scaledHeight,
      letterboxWidth,
      letterboxHeight
    );

    // レターボックス処理でパディングを追加した画像
    const paddedImage = resizedImage.pad(paddingList, 0) as tf.Tensor3D;

    return {
      output: paddedImage,
      letterboxInfo: {
        scale: scaleRatio,
        top,
        left,
        scaledWidth,
        scaledHeight,
      },
    };
  } finally {
    // 中間テンソルの確実な破棄（メモリリーク防止）
    resizedImage.dispose();
  }
}

/**
 * レターボックス座標を元画像座標に変換
 *
 * @param x - レターボックス座標のX位置（ピクセル単位）
 * @param y - レターボックス座標のY位置（ピクセル単位）
 * @param width - レターボックス座標の幅（ピクセル単位、>= 0）
 * @param height - レターボックス座標の高さ（ピクセル単位、>= 0）
 * @param scale - レターボックス変換時のスケール（> 0）
 * @param top - 上パディング（ピクセル単位）
 * @param left - 左パディング（ピクセル単位）
 * @returns 元画像座標（ピクセル単位）
 */
export function letterboxToOriginal(
  x: number,
  y: number,
  width: number,
  height: number,
  scale: number,
  top: number,
  left: number
): Rect {
  // 入力検証: 有限数値かどうか
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  ) {
    throw new MLInternalError("INVALID_COORDINATE_VALUES", false);
  }

  if (!Number.isFinite(scale) || scale <= 0) {
    throw new MLInternalError("INVALID_SCALE_VALUE", false);
  }

  if (!Number.isFinite(top) || !Number.isFinite(left)) {
    throw new MLInternalError("INVALID_PADDING_VALUES", false);
  }

  // 幅と高さが負の値の場合はエラー
  if (width < 0 || height < 0) {
    throw new MLInternalError("NEGATIVE_WIDTH_OR_HEIGHT", false);
  }

  return {
    x: (x - left) / scale,
    y: (y - top) / scale,
    width: width / scale,
    height: height / scale,
  };
}

/**
 * 元画像座標をキャンバス座標に変換
 *
 * @param rect - 元画像座標の矩形情報
 * @param canvasElement - キャンバス要素
 * @param croppedRegionSize - クロップ領域のサイズ情報
 * @returns キャンバス座標
 */
export function originalToCanvas(
  rect: Rect,
  canvasElement: HTMLCanvasElement,
  croppedSize: { width: number; height: number }
): Rect {
  // 入力検証: 有限数値かどうか
  if (
    !Number.isFinite(rect.x) ||
    !Number.isFinite(rect.y) ||
    !Number.isFinite(rect.width) ||
    !Number.isFinite(rect.height)
  ) {
    throw new MLInternalError("INVALID_COORDINATE_VALUES", false);
  }

  if (
    !Number.isFinite(croppedSize.width) ||
    !Number.isFinite(croppedSize.height)
  ) {
    throw new MLInternalError("INVALID_CROPPED_REGION_SIZE", false);
  }

  if (croppedSize.width <= 0 || croppedSize.height <= 0) {
    throw new MLInternalError("CROPPED_REGION_MUST_BE_POSITIVE", false);
  }

  if (canvasElement.width <= 0 || canvasElement.height <= 0) {
    throw new MLInternalError("INVALID_CANVAS_SIZE", false);
  }

  // 幅と高さが負の値の場合はエラー
  if (rect.width < 0 || rect.height < 0) {
    throw new MLInternalError("NEGATIVE_WIDTH_OR_HEIGHT", false);
  }

  // クロップ領域からキャンバスへのアスペクト比維持スケール計算
  const scaleX = canvasElement.width / croppedSize.width;
  const scaleY = canvasElement.height / croppedSize.height;
  const scale = Math.min(scaleX, scaleY);

  return {
    x: rect.x * scale,
    y: rect.y * scale,
    width: rect.width * scale,
    height: rect.height * scale,
  };
}

/**
 * YOLO出力の座標をキャンバス描画用座標に変換
 *
 * @param predictions - 変換対象の検出結果配列（空配列の場合は空配列を返す）
 * @param letterboxInfo - レターボックス変換時の情報（croppedWidth/Heightは必須）
 * @param canvasElement - 描画対象のキャンバス要素（サイズ > 0である必要あり）
 * @returns キャンバス座標系に変換された検出結果配列
 */
export function transformToCanvas(
  predictions: Detection[],
  letterboxInfo: LetterboxInfo,
  canvasElement: HTMLCanvasElement
): Detection[] {
  // 入力検証
  if (!predictions || predictions.length === 0) {
    return [];
  }

  if (!canvasElement || canvasElement.width <= 0 || canvasElement.height <= 0) {
    throw new MLInternalError("INVALID_CANVAS_SIZE");
  }

  const { scale, top, left, croppedWidth, croppedHeight } = letterboxInfo;

  // 必須フィールドの検証
  if (
    !Number.isFinite(scale) ||
    scale <= 0 ||
    !Number.isFinite(top) ||
    !Number.isFinite(left) ||
    !croppedWidth ||
    !croppedHeight ||
    croppedWidth <= 0 ||
    croppedHeight <= 0
  ) {
    throw new MLInternalError("INVALID_LETTERBOX_INFO");
  }

  // フィルタリングと変換を同時に実行（無効な項目をスキップ）
  const validTransformedPredictions: Detection[] = [];

  for (const prediction of predictions) {
    const { boundingBox, angle, score } = prediction;

    // 基本検証（無効な場合はスキップ）
    if (
      !boundingBox ||
      boundingBox.length !== 4 ||
      boundingBox.some((val) => !Number.isFinite(val)) ||
      !Number.isFinite(score) ||
      !Number.isFinite(angle)
    ) {
      continue;
    }
    const [x, y, width, height] = boundingBox;

    // サイズ検証（負の値はスキップ）
    if (width < 0 || height < 0) {
      continue;
    }

    try {
      // レターボックス座標から元画像座標に逆変換
      const originalRect = letterboxToOriginal(
        x,
        y,
        width,
        height,
        scale,
        top,
        left
      );

      // 元画像座標からキャンバス座標に変換
      const canvasRect = originalToCanvas(originalRect, canvasElement, {
        width: croppedWidth,
        height: croppedHeight,
      });

      const canvasBBox: BoundingBox = [
        canvasRect.x,
        canvasRect.y,
        canvasRect.width,
        canvasRect.height,
      ];

      validTransformedPredictions.push({
        boundingBox: canvasBBox,
        angle: convertRadiansToDegrees(angle),
        score,
      });
    } catch (error) {
      // 座標変換エラーの場合はスキップして継続
      continue;
    }
  }

  return validTransformedPredictions;
}

/**
 * 閾値以上の検出結果を取得（スコア降順）
 *
 * @param data - モデル出力データの2次元配列 [x[], y[], width[], height[], score[], angle?[]]
 * @param numDetections - 検出数（>= 0）
 * @param scoreThreshold - スコア閾値（0.0-1.0）
 * @returns スコア閾値以上の検出結果配列（スコア降順）
 */
export function findValidDetections(
  data: number[][],
  numDetections: number,
  scoreThreshold: number
): Detection[] {
  // 入力検証
  if (
    !data ||
    data.length < 5 || // 最低5個の配列が必要（boundingBox用4個 + score用1個）
    !Number.isFinite(numDetections) ||
    numDetections < 0 ||
    !Number.isFinite(scoreThreshold) ||
    scoreThreshold < 0 ||
    scoreThreshold > 1
  ) {
    return [];
  }

  // 各配列の最小長チェック
  const minRequiredLength = Math.min(
    data[0]?.length || 0,
    data[1]?.length || 0,
    data[2]?.length || 0,
    data[3]?.length || 0,
    data[4]?.length || 0
  );

  if (minRequiredLength === 0) {
    return [];
  }

  // 実際の検出数を制限
  const actualDetections = Math.min(numDetections, minRequiredLength);

  const validDetections: Detection[] = [];

  for (let i = 0; i < actualDetections; i++) {
    const score = data[4][i];

    // スコア値の検証
    if (!Number.isFinite(score) || score <= scoreThreshold) {
      continue;
    }

    // バウンディングボックスの検証
    const x = data[0][i];
    const y = data[1][i];
    const width = data[2][i];
    const height = data[3][i];

    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width < 0 ||
      height < 0
    ) {
      continue;
    }

    // 角度の取得と検証
    let angle = 0;
    if (data[5] && i < data[5].length) {
      const angleValue = data[5][i];
      angle = Number.isFinite(angleValue) ? angleValue : 0;
    }

    const detectionBBox: BoundingBox = [x, y, width, height];
    validDetections.push({
      boundingBox: detectionBBox,
      angle,
      score,
    });
  }

  // スコア降順でソート
  return validDetections.sort((a, b) => b.score - a.score);
}
