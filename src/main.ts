// Public API
export type { ObjectDetectorOptions, Detection, ARDetection } from "./types";
export type { MLClientError } from "./errors";
export {
  startFlashEffect,
  type VisualEffectOptions,
} from "./lib/visual-effects";
export { type ThreeDEstimationOptions } from "./types";
export type { DetectionController } from "./lib/detection-controller";

import { DetectionController } from "./lib/detection-controller";
import type { ObjectDetectorOptions } from "./types";
import { MLClientError } from "./errors";

/**
 * Main function
 */
export async function createDetector(
  videoElementId: string,
  canvasElementId: string,
  modelPath: string,
  metadataPath: string,
  options: ObjectDetectorOptions = {}
): Promise<DetectionController> {
  const detectionController = new DetectionController(
    modelPath,
    metadataPath,
    options
  );

  try {
    await detectionController.initialize(videoElementId, canvasElementId);
    return detectionController;
  } catch (error: unknown) {
    throw new MLClientError(error as Error);
  }
}
