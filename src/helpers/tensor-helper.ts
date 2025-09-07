import * as tf from "@tensorflow/tfjs";
import { MLInternalError } from "../errors";

/**
 * Generate normalized tensor from video element
 * @param videoElement - Video element
 * @returns RGB tf.Tensor3D normalized to 0-1
 */
function getNormalizedVideoTensor(videoElement: HTMLVideoElement): tf.Tensor3D {
  if (
    !videoElement ||
    videoElement.videoWidth === 0 ||
    videoElement.videoHeight === 0
  ) {
    throw new MLInternalError("VIDEO_NOT_READY_FOR_TENSOR_CONVERSION", true);
  }

  try {
    return tf.tidy(() => {
      const pixelTensor = tf.browser.fromPixels(videoElement);
      const floatTensor = pixelTensor.toFloat();
      return floatTensor.div(tf.scalar(255.0));
    });
  } catch (error) {
    throw new MLInternalError(
      "FAILED_TO_CREATE_VIDEO_TENSOR",
      true,
      error as Error,
    );
  }
}

/**
 * Crop a portion of video footage and generate normalized tensor
 * @param videoElement - Video element
 * @param cropX - Crop start X coordinate
 * @param cropY - Crop start Y coordinate
 * @param width - Width to crop
 * @param height - Height to crop
 * @returns RGB tf.Tensor3D normalized to 0-1 from the specified range
 */
export function cropNormalizedVideoTensor(
  videoElement: HTMLVideoElement,
  cropX: number,
  cropY: number,
  width: number,
  height: number,
): tf.Tensor3D {
  // Validate parameters
  if (
    !Number.isFinite(cropX) ||
    !Number.isFinite(cropY) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    cropX < 0 ||
    cropY < 0 ||
    width <= 0 ||
    height <= 0
  ) {
    throw new MLInternalError("INVALID_CROP_PARAMETERS", true);
  }

  const fullImage = getNormalizedVideoTensor(videoElement);

  try {
    const croppedTensor = fullImage.slice(
      [Math.floor(cropY), Math.floor(cropX), 0],
      [Math.floor(height), Math.floor(width), 3],
    );
    fullImage.dispose();
    return croppedTensor;
  } catch (error) {
    fullImage.dispose();
    throw new MLInternalError("TENSOR_CROP_FAILED", true, error as Error);
  }
}
