import { MLInternalError } from "../errors";
import type { ARDetection, Detection } from "../types";

// Constants
const CONSISTENCY_EPS = 0.25; // 25% tolerance for width/height-based depth agreement
const DIVISION_SAFETY_EPSILON = 1e-6; // small value to prevent division by zero
const FOCAL_SCALE = 0.8; // Empirical value for common web cameras and smartphone cameras

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
 * Calculate complete 3D orientation from aspect ratio analysis
 * @param currentAspectRatio Observed aspect ratio from bounding box
 * @param expectedAspectRatio Expected aspect ratio of object
 * @param angle YOLO rotation angle (yaw component)
 * @param coefficients Multipliers for pitch and roll estimation
 * @returns Object with pitch, roll, and yaw angles
 */
function calculateOrientationFromAspectRatio(
  currentAspectRatio: number,
  expectedAspectRatio: number,
  angle: number,
  coefficients: { pitch: number; roll: number } = { pitch: 1.0, roll: 1.0 },
): { pitch: number; roll: number; yaw: number } {
  // Determine if the aspect ratio change is primarily due to pitch or roll rotation
  if (Math.abs(angle) < 5) {
    // Small YOLO angle - aspect ratio change likely due to pitch (forward/backward tilt)
    const ratioDiff =
      (currentAspectRatio - expectedAspectRatio) / expectedAspectRatio;
    const pitch = calculatePitchFromRatio(ratioDiff) * coefficients.pitch;
    return { pitch, roll: 0, yaw: angle };
  }

  if (Math.abs(angle) > 85) {
    // Large YOLO angle - object is rotated ~90°, aspect ratio change indicates roll
    const ratioDiff =
      (currentAspectRatio - expectedAspectRatio) / expectedAspectRatio;
    const roll = calculatePitchFromRatio(ratioDiff) * coefficients.roll;
    return { pitch: 0, roll, yaw: angle };
  }

  // Mixed case: linear interpolation between pitch and roll based on angle
  const normalizedAngle = Math.abs(angle) / 90; // 0 to 1
  const pitchWeight = 1 - normalizedAngle;
  const rollWeight = normalizedAngle;

  const totalRatioDiff =
    (currentAspectRatio - expectedAspectRatio) / expectedAspectRatio;

  const pitch =
    calculatePitchFromRatio(totalRatioDiff * pitchWeight) * coefficients.pitch;
  const roll =
    calculatePitchFromRatio(totalRatioDiff * rollWeight) * coefficients.roll;

  return { pitch, roll, yaw: angle };
}

/**
 * Estimate 3D information from bounding box
 *
 * @param boundingBox [x, y, width, height] in pixels
 * @param imageWidth Image width in pixels
 * @param objectSize Real-world object size in meters
 * @param angle Bounding box rotation angle in degrees
 * @param orientationCoefficients Optional multipliers for pitch/roll estimation
 */
export function estimate3DInfo(
  boundingBox: [number, number, number, number],
  imageWidth: number,
  objectSize: { width: number; height: number },
  angle: number,
  orientationCoefficients?: { pitch?: number; roll?: number },
) {
  const [, , width, height] = boundingBox;

  // Calculate focal length in pixels
  const focalLength = FOCAL_SCALE * imageWidth;

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
      DIVISION_SAFETY_EPSILON,
    );

  const depth =
    relDiff <= CONSISTENCY_EPS
      ? 0.5 * (depthFromWidth + depthFromHeight)
      : height > width
        ? depthFromHeight
        : depthFromWidth;

  // No artificial depth constraints - let physics and detection limits apply naturally

  const coefficients = {
    pitch: orientationCoefficients?.pitch ?? 1.0,
    roll: orientationCoefficients?.roll ?? 1.0,
  };
  const orientation = estimateOrientation(
    boundingBox,
    realSize,
    angle,
    coefficients,
  );

  return {
    depth,
    orientation,
  };
}

/**
 * Estimate complete 3D orientation (pitch, roll, and yaw) from bounding box and angle
 */
function estimateOrientation(
  boundingBox: [number, number, number, number],
  realSize: { width: number; height: number; aspectRatio: number },
  angle: number = 0,
  coefficients: { pitch: number; roll: number } = { pitch: 1.0, roll: 1.0 },
): { pitch: number; roll: number; yaw: number } {
  const [, , width, height] = boundingBox;

  if (width <= 0 || height <= 0) {
    return { pitch: 0, roll: 0, yaw: angle };
  }

  const currentAspectRatio = width / height;
  const expectedAspectRatio = realSize.aspectRatio;

  return calculateOrientationFromAspectRatio(
    currentAspectRatio,
    expectedAspectRatio,
    angle,
    coefficients,
  );
}

/**
 * Add 3D information to detection result
 */
export function add3DToDetection(
  detection: Detection,
  imageWidth: number,
  objectSize: { width: number; height: number },
  orientationCoefficients?: { pitch?: number; roll?: number },
): ARDetection {
  const info = estimate3DInfo(
    detection.boundingBox,
    imageWidth,
    objectSize,
    detection.angle,
    orientationCoefficients,
  );

  return {
    ...detection,
    depth: info.depth,
    orientation: info.orientation,
  };
}
