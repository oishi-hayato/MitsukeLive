import type * as tf from "@tensorflow/tfjs";
import type { LetterboxInfo, Detection } from "../types";
import { MLInternalError } from "../errors";
import { convertRadiansToDegrees } from "./math-helper";
import { calculate2DCenter } from "./position-helper";

// Type aliases
type BoundingBox = [number, number, number, number];
type Rect = { x: number; y: number; width: number; height: number };
type PaddingList = [[number, number], [number, number], [number, number]];

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
 * Letterbox transformation for YOLO input
 *
 * @param image - 3D image tensor to transform [height, width, channels]
 * @param targetShape - Target size [height, width] (default: [640, 640])
 * @returns Transformed image tensor and transformation information
 */
export function letterboxTransform(
  image: tf.Tensor3D,
  letterboxShape: [number, number] = [640, 640]
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
    letterboxHeight
  );

  // Resized tensor (intermediate object)
  const resizedImage = image.resizeBilinear([scaledHeight, scaledWidth]);

  try {
    // Calculate padding amount for letterbox
    const { top, left, paddingList } = calculatePadding(
      scaledWidth,
      scaledHeight,
      letterboxWidth,
      letterboxHeight
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
  left: number
): Rect {
  // Input validation: Check if finite numbers
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

  // Error if width and height are negative
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
  croppedSize: { width: number; height: number }
): Rect {
  // Input validation: Check if finite numbers
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

  // Error if width and height are negative
  if (rect.width < 0 || rect.height < 0) {
    throw new MLInternalError("NEGATIVE_WIDTH_OR_HEIGHT", false);
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
  canvasElement: HTMLCanvasElement
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
        left
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
      
      const center2D = calculate2DCenter(canvasBBox);

      validTransformedPredictions.push({
        boundingBox: canvasBBox,
        angle: convertRadiansToDegrees(angle),
        score,
        center2D,
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
 * @param data - 2D array of model output data [x[], y[], width[], height[], score[], angle?[]]
 * @param numDetections - Number of detections (>= 0)
 * @param scoreThreshold - Score threshold (0.0-1.0)
 * @returns Array of detection results above score threshold (sorted by score descending)
 */
export function findValidDetections(
  data: number[][],
  numDetections: number,
  scoreThreshold: number
): Detection[] {
  // Input validation
  if (
    !data ||
    data.length < 5 || // Minimum 5 arrays required (4 for boundingBox + 1 for score)
    !Number.isFinite(numDetections) ||
    numDetections < 0 ||
    !Number.isFinite(scoreThreshold) ||
    scoreThreshold < 0 ||
    scoreThreshold > 1
  ) {
    return [];
  }

  // Check minimum length of each array
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

  // Limit actual number of detections
  const actualDetections = Math.min(numDetections, minRequiredLength);

  const validDetections: Detection[] = [];

  for (let i = 0; i < actualDetections; i++) {
    const score = data[4][i];

    // Validate score value
    if (!Number.isFinite(score) || score <= scoreThreshold) {
      continue;
    }

    // Validate bounding box
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

    // Get and validate angle
    let angle = 0;
    if (data[5] && i < data[5].length) {
      const angleValue = data[5][i];
      angle = Number.isFinite(angleValue) ? angleValue : 0;
    }

    const detectionBBox: BoundingBox = [x, y, width, height];
    const center2D = calculate2DCenter(detectionBBox);
    
    validDetections.push({
      boundingBox: detectionBBox,
      angle,
      score,
      center2D,
    });
  }

  // Sort by score descending
  return validDetections.sort((a, b) => b.score - a.score);
}
