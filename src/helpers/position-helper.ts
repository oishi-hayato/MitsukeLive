/**
 * Helper functions for calculating object positions from bounding boxes
 * Provides 2D and 3D position calculation utilities
 */

import { convertDegreesToRadians } from "./math-helper";

/**
 * Calculate 2D center position from bounding box
 * @param boundingBox [x, y, width, height] in pixels
 * @returns 2D center coordinates {x, y}
 */
export function calculate2DCenter(
  boundingBox: [number, number, number, number],
): {
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
 * Convert 2D screen coordinates to Three.js space coordinates
 * @param centerX Center X coordinate in canvas pixels
 * @param centerY Center Y coordinate in canvas pixels
 * @param canvasWidth Canvas width in pixels
 * @param canvasHeight Canvas height in pixels
 * @param depth Object depth in meters
 * @param cameraFov Camera field of view in degrees
 * @returns 3D space coordinates {x, y, z}
 */
export function convertToThreeJSSpaceCoordinates(
  centerX: number,
  centerY: number,
  canvasWidth: number,
  canvasHeight: number,
  depth: number,
  cameraFov: number,
): { x: number; y: number; z: number } {
  // Convert FOV to radians and calculate aspect ratio
  const aspect = canvasWidth / canvasHeight;
  const fov = convertDegreesToRadians(cameraFov);

  // Calculate view width and height from FOV
  const viewHeight = 2 * Math.tan(fov / 2) * depth;
  const viewWidth = viewHeight * aspect;

  // Convert to normalized coordinates (-1 to 1)
  const normalizedX = (centerX / canvasWidth) * 2 - 1;
  const normalizedY = -((centerY / canvasHeight) * 2 - 1); // Flip Y axis

  // Convert to space coordinates
  const spaceX = normalizedX * (viewWidth / 2);
  const spaceY = normalizedY * (viewHeight / 2);
  const spaceZ = -depth; // Direction away from camera

  return { x: spaceX, y: spaceY, z: spaceZ };
}
