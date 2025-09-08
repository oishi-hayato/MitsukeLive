import type * as tf from "@tensorflow/tfjs";
import { MLInternalError } from "../errors";
import type { Detection, LetterboxInfo } from "../types";
import { convertRadiansToDegrees } from "./math-helper";

// Type aliases
type BoundingBox = [number, number, number, number];
type Rect = { x: number; y: number; width: number; height: number };
type PaddingList = [[number, number], [number, number], [number, number]];

/**
 * Validate coordinate values (x, y, width, height)
 */
function validateCoordinates(
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  ) {
    throw new MLInternalError("INVALID_COORDINATE_VALUES", false);
  }
  if (width < 0 || height < 0) {
    throw new MLInternalError("NEGATIVE_WIDTH_OR_HEIGHT", false);
  }
}

// Constants

/**
 * Scale calculation with aspect ratio preservation
 *
 * @param sourceWidth - Original image width
 * @param sourceHeight - Original image height
 * @param targetWidth - Target width
 * @param targetHeight - Target height
 * @returns Scale information object
 */
export function calculateOptimalScale(
  originalWidth: number,
  originalHeight: number,
  targetWidth: number = 640,
  targetHeight: number = 640,
): { scaleRatio: number; scaledWidth: number; scaledHeight: number } {
  if (originalWidth <= 0 || originalHeight <= 0) {
    throw new MLInternalError("INVALID_IMAGE_DIMENSIONS");
  }

  const scaleRatio = Math.min(
    targetWidth / originalWidth,
    targetHeight / originalHeight,
  );
  const scaledWidth = Math.round(originalWidth * scaleRatio);
  const scaledHeight = Math.round(originalHeight * scaleRatio);

  return { scaleRatio, scaledWidth, scaledHeight };
}

/**
 * Calculate center-aligned padding for letterbox processing
 * Returns in format that can be passed directly to TensorFlow.js pad
 *
 * @param scaledWidth - Width after scaling
 * @param scaledHeight - Height after scaling
 * @param targetWidth - Target width
 * @param targetHeight - Target height
 * @returns Padding information object
 */
export function calculatePadding(
  scaledWidth: number,
  scaledHeight: number,
  letterboxWidth: number = 640,
  letterboxHeight: number = 640,
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
 * Letterbox transformation for YOLO input
 *
 * @param image - 3D image tensor to transform [height, width, channels]
 * @param targetShape - Target size [height, width] (default: [640, 640])
 * @returns Transformed image tensor and transformation information
 */
export function letterboxTransform(
  image: tf.Tensor3D,
  letterboxShape: [number, number] = [640, 640],
): { output: tf.Tensor3D; letterboxInfo: LetterboxInfo } {
  // Input validation: Check if 3D tensor
  if (image.shape.length !== 3) {
    throw new MLInternalError("INPUT_MUST_BE_3D_TENSOR");
  }

  // Input validation: Check if target size is positive
  const [letterboxHeight, letterboxWidth] = letterboxShape;
  if (letterboxWidth <= 0 || letterboxHeight <= 0) {
    throw new MLInternalError("INVALID_TARGET_IMAGE_SIZE");
  }

  const [originalHeight, originalWidth] = image.shape;

  // Calculate scale maintaining aspect ratio and post-resize size
  const { scaleRatio, scaledWidth, scaledHeight } = calculateOptimalScale(
    originalWidth,
    originalHeight,
    letterboxWidth,
    letterboxHeight,
  );

  // Resized tensor (intermediate object)
  const resizedImage = image.resizeBilinear([scaledHeight, scaledWidth]);

  try {
    // Calculate padding amount for letterbox
    const { top, left, paddingList } = calculatePadding(
      scaledWidth,
      scaledHeight,
      letterboxWidth,
      letterboxHeight,
    );

    // Image with padding added by letterbox processing
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
    // Ensure disposal of intermediate tensor (prevent memory leak)
    resizedImage.dispose();
  }
}

/**
 * Convert letterbox coordinates to original image coordinates
 *
 * @param x - X position in letterbox coordinates (pixel units)
 * @param y - Y position in letterbox coordinates (pixel units)
 * @param width - Width in letterbox coordinates (pixel units, >= 0)
 * @param height - Height in letterbox coordinates (pixel units, >= 0)
 * @param scale - Scale during letterbox transformation (> 0)
 * @param top - Top padding (pixel units)
 * @param left - Left padding (pixel units)
 * @returns Original image coordinates (pixel units)
 */
export function letterboxToOriginal(
  x: number,
  y: number,
  width: number,
  height: number,
  scale: number,
  top: number,
  left: number,
): Rect {
  // Input validation
  validateCoordinates(x, y, width, height);

  if (!Number.isFinite(scale) || scale <= 0) {
    throw new MLInternalError("INVALID_SCALE_VALUE", false);
  }

  if (!Number.isFinite(top) || !Number.isFinite(left)) {
    throw new MLInternalError("INVALID_PADDING_VALUES", false);
  }

  return {
    x: (x - left) / scale,
    y: (y - top) / scale,
    width: width / scale,
    height: height / scale,
  };
}

/**
 * Convert original image coordinates to canvas coordinates
 *
 * @param rect - Rectangle information in original image coordinates
 * @param canvasElement - Canvas element
 * @param croppedRegionSize - Size information of cropped region
 * @returns Canvas coordinates
 */
export function originalToCanvas(
  rect: Rect,
  canvasElement: HTMLCanvasElement,
  croppedSize: { width: number; height: number },
): Rect {
  // Input validation
  validateCoordinates(rect.x, rect.y, rect.width, rect.height);

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

  // Calculate aspect ratio preserving scale from crop region to canvas
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
 * Convert YOLO output coordinates to canvas drawing coordinates
 *
 * @param predictions - Array of detection results to convert (returns empty array if empty)
 * @param letterboxInfo - Information from letterbox transformation (croppedWidth/Height required)
 * @param canvasElement - Canvas element for drawing (size must be > 0)
 * @returns Array of detection results converted to canvas coordinate system
 */
export function transformToCanvas(
  predictions: Detection[],
  letterboxInfo: LetterboxInfo,
  canvasElement: HTMLCanvasElement,
): Detection[] {
  // Input validation
  if (!predictions || predictions.length === 0) {
    return [];
  }

  if (!canvasElement || canvasElement.width <= 0 || canvasElement.height <= 0) {
    throw new MLInternalError("INVALID_CANVAS_SIZE");
  }

  const { scale, top, left, croppedWidth, croppedHeight } = letterboxInfo;

  // Validate required fields
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

  // Perform filtering and transformation simultaneously (skip invalid items)
  const validTransformedPredictions: Detection[] = [];

  for (const prediction of predictions) {
    const { boundingBox, angle, score } = prediction;

    // Basic validation (skip if invalid)
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

    // Size validation (skip negative values)
    if (width < 0 || height < 0) {
      continue;
    }

    try {
      // Inverse transform from letterbox coordinates to original image coordinates
      const originalRect = letterboxToOriginal(
        x,
        y,
        width,
        height,
        scale,
        top,
        left,
      );

      // Convert from original image coordinates to canvas coordinates
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
      // Skip and continue on coordinate transformation error
      continue;
    }
  }

  return validTransformedPredictions;
}

/**
 * Get detection results above threshold (sorted by score descending)
 *
 * @param data - 2D array of model output data [centerX[], centerY[], width[], height[], score[], angle?[]]
 * @param numDetections - Number of detections (>= 0)
 * @param scoreThreshold - Score threshold (0.0-1.0)
 * @returns Array of detection results above score threshold (sorted by score descending)
 */
export function findValidDetections(
  data: number[][],
  numDetections: number,
  scoreThreshold: number,
): Detection[] {
  if (!data || data.length < 5 || numDetections <= 0) {
    return [];
  }

  const actualDetections = Math.min(numDetections, data[0]?.length || 0);
  const validDetections: Detection[] = [];

  for (let i = 0; i < actualDetections; i++) {
    const detection = createDetectionIfValid(data, i, scoreThreshold);
    if (detection) {
      validDetections.push(detection);
    }
  }

  return validDetections.sort((a, b) => b.score - a.score);
}

/**
 * Create detection object if all values are valid
 */
function createDetectionIfValid(
  data: number[][],
  index: number,
  scoreThreshold: number,
): Detection | null {
  const score = data[4][index];
  if (!Number.isFinite(score) || score <= scoreThreshold) {
    return null;
  }

  const centerX = data[0][index];
  const centerY = data[1][index];
  const width = data[2][index];
  const height = data[3][index];

  if (
    !Number.isFinite(centerX) ||
    !Number.isFinite(centerY) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 0 ||
    height < 0
  ) {
    return null;
  }

  let angle = 0;
  if (data[5] && index < data[5].length) {
    const angleValue = data[5][index];
    angle = Number.isFinite(angleValue) ? angleValue : 0;
  }

  return {
    boundingBox: [centerX, centerY, width, height] as BoundingBox,
    angle,
    score,
  };
}
