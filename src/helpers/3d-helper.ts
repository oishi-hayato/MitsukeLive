import { MLInternalError } from "../errors";
import { Detection, ARDetection } from "../types";

// Constants
const CONSISTENCY_EPS = 0.25; // 25% tolerance for width/height-based depth agreement
const DIVISION_SAFETY_EPSILON = 1e-6; // small value to prevent division by zero

/**
 * Get focal length scale factor for common web cameras
 *
 * @returns Focal length scale factor (fixed at 0.8 for simplicity)
 */
function getFocalScale(): number {
  // Empirical value for common web cameras and smartphone cameras
  return 0.8;
}

/**
 * Physics-based pitch estimation from aspect ratio change
 * @param ratioDiff Relative difference in aspect ratio
 * @returns Pitch angle in degrees
 */
function calculatePitchFromRatio(ratioDiff: number): number {
  const absRatio = Math.abs(ratioDiff);
  const sign = Math.sign(ratioDiff); // Fixed sign: upward=positive, downward=negative

  // Physics-based calculation: ratio_diff = 1/cos(pitch) - 1
  // Therefore: pitch = arccos(1 / (ratio_diff + 1))
  const cosineValue = 1 / (absRatio + 1);

  // Ensure valid range for arccos
  const clampedCosine = Math.max(0, Math.min(1, cosineValue));
  const pitchRadians = Math.acos(clampedCosine);
  const pitchDegrees = (pitchRadians * 180) / Math.PI;

  return sign * pitchDegrees;
}

/**
 * Calculate both pitch and roll from aspect ratio analysis
 * @param currentAspectRatio Observed aspect ratio from bounding box
 * @param expectedAspectRatio Expected aspect ratio of object
 * @param angle YOLO rotation angle (determines whether aspect ratio change indicates pitch or roll)
 * @returns Object with pitch and roll angles
 */
function calculateOrientationFromAspectRatio(
  currentAspectRatio: number,
  expectedAspectRatio: number,
  angle: number
): { pitch: number; roll: number } {
  // Determine if the aspect ratio change is primarily due to pitch or roll rotation
  if (Math.abs(angle) < 5) {
    // Small YOLO angle - aspect ratio change likely due to pitch (forward/backward tilt)
    const ratioDiff =
      (currentAspectRatio - expectedAspectRatio) / expectedAspectRatio;
    const pitch = calculatePitchFromRatio(ratioDiff);
    return { pitch, roll: 0 };
  }

  if (Math.abs(angle) > 85) {
    // Large YOLO angle - object is rotated ~90°, aspect ratio change indicates roll
    const ratioDiff =
      (currentAspectRatio - expectedAspectRatio) / expectedAspectRatio;
    const roll = calculatePitchFromRatio(ratioDiff);
    return { pitch: 0, roll };
  }

  // Mixed case: linear interpolation between pitch and roll based on angle
  const normalizedAngle = Math.abs(angle) / 90; // 0 to 1
  const pitchWeight = 1 - normalizedAngle;
  const rollWeight = normalizedAngle;

  const totalRatioDiff =
    (currentAspectRatio - expectedAspectRatio) / expectedAspectRatio;

  const pitch = calculatePitchFromRatio(totalRatioDiff * pitchWeight);
  const roll = calculatePitchFromRatio(totalRatioDiff * rollWeight);

  return { pitch, roll };
}

/**
 * Estimate 3D information from bounding box
 *
 * @param boundingBox [x, y, width, height] in pixels
 * @param imageWidth Image width in pixels
 * @param objectSize Real-world object size in meters
 * @param angle Bounding box rotation angle in degrees
 */
export function estimate3DInfo(
  boundingBox: [number, number, number, number],
  imageWidth: number,
  objectSize: { width: number; height: number },
  angle: number
) {
  const [, , width, height] = boundingBox;

  // Use default configuration values
  const focalScale = getFocalScale();

  // Calculate focal length in pixels
  const focalLength = focalScale * imageWidth;

  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new MLInternalError("BOUNDING_BOX_SIZE_INVALID");
  }

  if (focalLength <= 0) {
    throw new MLInternalError("FOCAL_LENGTH_INVALID");
  }

  // Real-world object size
  const realSize = {
    width: objectSize.width,
    height: objectSize.height,
    aspectRatio: objectSize.width / objectSize.height,
  };

  // Depth estimation (fusion based on width/height consistency)
  const depthFromWidth = (realSize.width * focalLength) / width;
  const depthFromHeight = (realSize.height * focalLength) / height;

  const relDiff =
    Math.abs(depthFromWidth - depthFromHeight) /
    Math.max(
      Math.max(depthFromWidth, depthFromHeight),
      DIVISION_SAFETY_EPSILON
    );

  let depth =
    relDiff <= CONSISTENCY_EPS
      ? 0.5 * (depthFromWidth + depthFromHeight)
      : height > width
      ? depthFromHeight
      : depthFromWidth;

  // No artificial depth constraints - let physics and detection limits apply naturally

  const orientation = estimateOrientation(boundingBox, realSize, angle);

  return {
    depth,
    orientation,
  };
}

/**
 * Estimate orientation (pitch and roll) from bounding box using aspect ratio analysis
 */
function estimateOrientation(
  boundingBox: [number, number, number, number],
  realSize: { width: number; height: number; aspectRatio: number },
  angle: number = 0
): { pitch: number; roll: number } {
  const [, , width, height] = boundingBox;

  if (width <= 0 || height <= 0) {
    return { pitch: 0, roll: 0 };
  }

  const currentAspectRatio = width / height;
  const expectedAspectRatio = realSize.aspectRatio;

  return calculateOrientationFromAspectRatio(
    currentAspectRatio,
    expectedAspectRatio,
    angle
  );
}

/**
 * Add 3D information to detection result
 */
export function add3DToDetection(
  detection: Detection,
  imageWidth: number,
  objectSize: { width: number; height: number }
): ARDetection {
  const info = estimate3DInfo(
    detection.boundingBox,
    imageWidth,
    objectSize,
    detection.angle
  );

  return {
    ...detection,
    depth: info.depth,
    orientation: info.orientation,
  };
}
