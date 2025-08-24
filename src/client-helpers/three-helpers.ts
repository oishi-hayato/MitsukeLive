/**
 * Three.js Helper Functions for MitsukeLive
 *
 * Utility functions to simplify positioning and animating 3D objects
 * based on MitsukeLive AR detection results. These helpers handle
 * coordinate transformations, smooth animations, and common AR tasks.
 */

import * as THREE from "three";
import type { ARDetection } from "../types";
import { convertDegreesToRadians } from "../helpers/math-helper";

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
export function calculateWorldPosition(
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
 * Position AR object at center coordinates (simplest API)
 */
export function positionARObjectAtCenter(
  object3D: THREE.Object3D,
  centerX: number,
  centerY: number,
  depth: number,
  viewport: ViewportConfig,
  halfTanFov: number,
  scale?: number,
): void {
  const normalized = normalizeDetectionCoordinates(
    centerX,
    centerY,
    viewport.detectionWidth,
    viewport.detectionHeight,
  );

  const aspectRatio = viewport.displayWidth / viewport.displayHeight;
  const position = calculateWorldPosition(
    normalized.x,
    normalized.y,
    depth,
    aspectRatio,
    halfTanFov,
  );

  object3D.position.copy(position);
  object3D.scale.set(scale || 1, scale || 1, scale || 1);
  object3D.visible = true;
}

/**
 * Position AR object at normalized coordinates (-1 to 1)
 */
export function positionARObjectAtNDC(
  object3D: THREE.Object3D,
  normalizedX: number,
  normalizedY: number,
  depth: number,
  viewport: ViewportConfig,
  halfTanFov: number,
  scale?: number,
): void {
  const aspectRatio = viewport.displayWidth / viewport.displayHeight;
  const position = calculateWorldPosition(
    normalizedX,
    normalizedY,
    depth,
    aspectRatio,
    halfTanFov,
  );

  object3D.position.copy(position);
  object3D.scale.set(scale || 1, scale || 1, scale || 1);
  object3D.visible = true;
}

/**
 * Position AR object using screen ratio (0-1)
 */
export function positionARObjectAtRatio(
  object3D: THREE.Object3D,
  xRatio: number, // 0 = left, 1 = right
  yRatio: number, // 0 = top, 1 = bottom
  depth: number,
  viewport: ViewportConfig,
  halfTanFov: number,
  scale?: number,
): void {
  const centerX = xRatio * viewport.detectionWidth;
  const centerY = yRatio * viewport.detectionHeight;

  positionARObjectAtCenter(
    object3D,
    centerX,
    centerY,
    depth,
    viewport,
    halfTanFov,
    scale,
  );
}

/**
 * Preset positions for common placements
 */
export const ARPositions = {
  center: (
    object3D: THREE.Object3D,
    depth: number,
    viewport: ViewportConfig,
    halfTanFov: number,
    scale?: number,
  ) =>
    positionARObjectAtRatio(
      object3D,
      0.5,
      0.5,
      depth,
      viewport,
      halfTanFov,
      scale,
    ),

  topLeft: (
    object3D: THREE.Object3D,
    depth: number,
    viewport: ViewportConfig,
    halfTanFov: number,
    scale?: number,
  ) =>
    positionARObjectAtRatio(
      object3D,
      0.1,
      0.1,
      depth,
      viewport,
      halfTanFov,
      scale,
    ),

  topRight: (
    object3D: THREE.Object3D,
    depth: number,
    viewport: ViewportConfig,
    halfTanFov: number,
    scale?: number,
  ) =>
    positionARObjectAtRatio(
      object3D,
      0.9,
      0.1,
      depth,
      viewport,
      halfTanFov,
      scale,
    ),

  bottomLeft: (
    object3D: THREE.Object3D,
    depth: number,
    viewport: ViewportConfig,
    halfTanFov: number,
    scale?: number,
  ) =>
    positionARObjectAtRatio(
      object3D,
      0.1,
      0.9,
      depth,
      viewport,
      halfTanFov,
      scale,
    ),

  bottomRight: (
    object3D: THREE.Object3D,
    depth: number,
    viewport: ViewportConfig,
    halfTanFov: number,
    scale?: number,
  ) =>
    positionARObjectAtRatio(
      object3D,
      0.9,
      0.9,
      depth,
      viewport,
      halfTanFov,
      scale,
    ),
};

// ========================================
// Top-Level Group Processing
// ========================================

/**
 * Process top-level Group with AR detection
 * Complete processing by just passing the top-level Group
 */
export function processTopLevelGroup(
  group: THREE.Group,
  detection: ARDetection,
  viewport: ViewportConfig,
  halfTanFov: number,
  scaleMultiplier: number = 1.0,
): void {
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
    rotation.z = convertDegreesToRadians(detection.orientation.roll);
  }

  // Update entire Group
  group.position.copy(position);
  group.rotation.setFromVector3(rotation);
  group.scale.set(scale, scale, scale);
  group.visible = true;
}

/**
 * Simple Group positioning with center coordinates
 * Position Group with center coordinates
 */
export function positionTopLevelGroup(
  group: THREE.Group,
  centerX: number,
  centerY: number,
  depth: number,
  viewport: ViewportConfig,
  halfTanFov: number,
  scale: number = 1.0,
): void {
  const normalized = normalizeDetectionCoordinates(
    centerX,
    centerY,
    viewport.detectionWidth,
    viewport.detectionHeight,
  );
  const aspectRatio = viewport.displayWidth / viewport.displayHeight;
  const position = calculateWorldPosition(
    normalized.x,
    normalized.y,
    depth,
    aspectRatio,
    halfTanFov,
  );

  group.position.copy(position);
  group.scale.set(scale, scale, scale);
  group.visible = true;
}

/**
 * Hide Group and all its children
 * Hide entire Group
 */
export function hideTopLevelGroup(group: THREE.Group): void {
  group.visible = false;
  group.traverse((child) => {
    child.visible = false;
  });
}

/**
 * Show Group and all its children
 * Show entire Group
 */
export function showTopLevelGroup(group: THREE.Group): void {
  group.visible = true;
  group.traverse((child) => {
    child.visible = true;
  });
}

/**
 * Find objects in Group for raycasting
 * Search objects within Group (for click handling)
 */
export function getGroupObjects(
  group: THREE.Group,
  recursive: boolean = true,
): THREE.Object3D[] {
  const objects: THREE.Object3D[] = [];

  if (recursive) {
    group.traverse((child) => {
      if (child !== group && child instanceof THREE.Mesh) {
        objects.push(child);
      }
    });
  } else {
    for (const child of group.children) {
      if (child instanceof THREE.Mesh) {
        objects.push(child);
      }
    }
  }

  return objects;
}

/**
 * Calculate position and transform data without applying to object
 *
 * Returns calculated position, rotation, and scale values for AR objects
 */
export function calculateARTransform(
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
