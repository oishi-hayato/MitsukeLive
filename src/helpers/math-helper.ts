import { MLInternalError } from "../errors";

// Constants
const RADIANS_TO_DEGREES = 180 / Math.PI;

/**
 * Convert radians to degrees
 *
 * @param radians - Radian value (finite numbers only. NaN, Infinity, -Infinity are invalid)
 * @returns Degree value (radian value × 180 / π)
 */
export function convertRadiansToDegrees(radians: number): number {
  if (!Number.isFinite(radians)) {
    throw new MLInternalError("INVALID_RADIAN_VALUE", false);
  }

  return radians * RADIANS_TO_DEGREES;
}

/**
 * Convert degrees to radians
 *
 * @param degrees - Degree value (finite numbers only. NaN, Infinity, -Infinity are invalid)
 * @returns Radian value (degree value × π / 180)
 */
export function convertDegreesToRadians(degrees: number): number {
  if (!Number.isFinite(degrees)) {
    throw new MLInternalError("INVALID_DEGREE_VALUE", false);
  }

  return degrees / RADIANS_TO_DEGREES;
}
