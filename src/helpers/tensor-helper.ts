import * as tf from "@tensorflow/tfjs";

/**
 * Generate normalized tensor from video element
 * @param videoElement - Video element
 * @returns RGB tf.Tensor3D normalized to 0-1
 */
function getNormalizedVideoTensor(videoElement: HTMLVideoElement): tf.Tensor3D {
  return tf.browser.fromPixels(videoElement).toFloat().div(tf.scalar(255.0));
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
  height: number
): tf.Tensor3D {
  const fullImage = getNormalizedVideoTensor(videoElement);

  return fullImage.slice(
    [Math.floor(cropY), Math.floor(cropX), 0],
    [Math.floor(height), Math.floor(width), 3]
  );
}
