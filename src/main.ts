// 公開API
export { DetectionController } from "./lib/detection-controller";
export type { ObjectDetectorOptions, Detection } from "./types";
export type { MLClientError } from "./errors";
export {
  startClientFlashEffect,
  type ClientFlashOptions,
} from "./lib/client-flash";

import { DetectionController } from "./lib/detection-controller";
import type { ObjectDetectorOptions } from "./types";
import { MLClientError } from "./errors";

/**
 * メイン関数
 */
export async function createDetector(
  videoElementId: string,
  canvasElementId: string,
  options: ObjectDetectorOptions
): Promise<DetectionController> {
  const detectionController = new DetectionController(options);

  try {
    await detectionController.initialize(videoElementId, canvasElementId);
    return detectionController;
  } catch (error: unknown) {
    throw new MLClientError(error as Error);
  }
}
