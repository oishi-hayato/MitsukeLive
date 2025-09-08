/**
 * Three.js Helper Functions for MitsukeLive
 *
 * Utility functions to simplify positioning and animating 3D objects
 * based on MitsukeLive AR detection results. These helpers handle
 * coordinate transformations, smooth animations, and common AR tasks.
 */

import * as THREE from "three";
import { convertDegreesToRadians } from "../helpers/math-helper";
import type { ARDetection } from "../types";

/**
 * Convert detection coordinates to normalized device coordinates (-1 to 1)
 * @param centerX Center X coordinate in detection canvas
 * @param centerY Center Y coordinate in detection canvas
 * @param detectionWidth Detection canvas width
 * @param detectionHeight Detection canvas height
 * @returns Normalized coordinates for Three.js
 */
export function normalizeDetectionCoordinates(
  centerX: number,
  centerY: number,
  detectionWidth: number,
  detectionHeight: number,
): { x: number; y: number } {
  return {
    x: (centerX / detectionWidth) * 2 - 1,
    y: -((centerY / detectionHeight) * 2 - 1),
  };
}

/**
 * Convert normalized coordinates to Three.js world position
 * @param normalizedX Normalized X coordinate (-1 to 1)
 * @param normalizedY Normalized Y coordinate (-1 to 1)
 * @param depth Distance from camera in meters
 * @param aspectRatio Canvas aspect ratio (width/height)
 * @param halfTanFov Half tangent of field of view
 * @returns World position as Vector3
 */
function calculateWorldPosition(
  normalizedX: number,
  normalizedY: number,
  depth: number,
  aspectRatio: number,
  halfTanFov: number,
): THREE.Vector3 {
  const viewHeight = 2 * halfTanFov * depth;
  const viewWidth = viewHeight * aspectRatio;
  return new THREE.Vector3(
    normalizedX * viewWidth * 0.5,
    normalizedY * viewHeight * 0.5,
    -depth,
  );
}

export interface ViewportConfig {
  displayWidth: number;
  displayHeight: number;
  detectionWidth: number;
  detectionHeight: number;
  fov: number;
}

/**
 * Calculate position and transform data without applying to object
 *
 * Returns calculated position, rotation, and scale values for AR objects
 */
function calculateARTransform(
  detection: ARDetection,
  viewport: ViewportConfig,
  halfTanFov: number,
  scaleMultiplier: number = 1.0,
): {
  position: THREE.Vector3;
  rotation: THREE.Vector3;
  scale: THREE.Vector3;
} {
  const [x, y, , height] = detection.boundingBox;

  // Coordinate transformation
  const normalized = normalizeDetectionCoordinates(
    x,
    y,
    viewport.detectionWidth,
    viewport.detectionHeight,
  );
  const aspectRatio = viewport.displayWidth / viewport.displayHeight;
  const position = calculateWorldPosition(
    normalized.x,
    normalized.y,
    detection.depth,
    aspectRatio,
    halfTanFov,
  );

  // Scale calculation
  const viewHeight = 2 * halfTanFov * detection.depth;
  const worldHeight = (height / viewport.detectionHeight) * viewHeight;
  const scale = worldHeight * scaleMultiplier;

  // Rotation calculation
  const rotation = new THREE.Vector3(0, 0, 0);
  if (detection.orientation) {
    rotation.x = convertDegreesToRadians(detection.orientation.pitch);
    rotation.y = convertDegreesToRadians(detection.orientation.yaw);
    rotation.z = convertDegreesToRadians(detection.orientation.roll);
  }

  return {
    position,
    rotation,
    scale: new THREE.Vector3(scale, scale, scale),
  };
}

// ========================================
// Smooth Animation Functions
// ========================================

export interface SmoothTransformState {
  targetPosition: THREE.Vector3;
  targetRotation: THREE.Vector3;
  targetScale: THREE.Vector3;
}

/**
 * Create smooth transform state
 */
export function createSmoothTransformState(): SmoothTransformState {
  return {
    targetPosition: new THREE.Vector3(),
    targetRotation: new THREE.Vector3(),
    targetScale: new THREE.Vector3(1, 1, 1),
  };
}

/**
 * Update smooth transform targets from AR detection
 */
export function updateSmoothTargets(
  state: SmoothTransformState,
  detection: ARDetection,
  viewport: ViewportConfig,
  halfTanFov: number,
  scaleMultiplier: number = 1.0,
): void {
  const transform = calculateARTransform(
    detection,
    viewport,
    halfTanFov,
    scaleMultiplier,
  );
  state.targetPosition.copy(transform.position);
  state.targetRotation.copy(transform.rotation);
  state.targetScale.copy(transform.scale);
}

/**
 * Apply smooth interpolation to object
 */
export function applySmoothTransform(
  object: THREE.Object3D,
  state: SmoothTransformState,
  lerpFactor: number = 0.15,
): void {
  // Smooth interpolation
  object.position.lerp(state.targetPosition, lerpFactor);

  // Rotation interpolation
  object.rotation.x = THREE.MathUtils.lerp(
    object.rotation.x,
    state.targetRotation.x,
    lerpFactor,
  );
  object.rotation.y = THREE.MathUtils.lerp(
    object.rotation.y,
    state.targetRotation.y,
    lerpFactor,
  );
  object.rotation.z = THREE.MathUtils.lerp(
    object.rotation.z,
    state.targetRotation.z,
    lerpFactor,
  );

  object.scale.lerp(state.targetScale, lerpFactor);
}
