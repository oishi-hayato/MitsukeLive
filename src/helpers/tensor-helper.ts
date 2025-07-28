import * as tf from "@tensorflow/tfjs";

/**
 * ビデオ要素から正規化されたテンソルを生成
 * @param videoElement - ビデオ要素
 * @returns 0〜1 に正規化された RGB の tf.Tensor3D
 */
function getNormalizedVideoTensor(videoElement: HTMLVideoElement): tf.Tensor3D {
  return tf.browser.fromPixels(videoElement).toFloat().div(tf.scalar(255.0));
}

/**
 * ビデオ映像の一部を切り出し、正規化テンソルを生成
 * @param videoElement - ビデオ要素
 * @param cropX - クロップの開始 X 座標
 * @param cropY - クロップの開始 Y 座標
 * @param width - クロップする幅
 * @param height - クロップする高さ
 * @returns 指定範囲を切り出した、0〜1 に正規化された RGB の tf.Tensor3D
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
