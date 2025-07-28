import { MLInternalError } from "../errors";

/**
 * カメラの設定とリサイズ管理を行うクラス
 */
export class CameraManager {
  private videoElement: HTMLVideoElement;
  private resizeTimeout: number | null = null;
  private handleResize: (() => void) | null = null;

  private constructor(videoElement: HTMLVideoElement) {
    this.videoElement = videoElement;
  }

  /**
   * カメラストリームを設定します
   */
  static async setup(
    videoElementId: string,
    onCameraReady: () => void
  ): Promise<CameraManager> {
    const element = document.getElementById(videoElementId);

    if (!element) {
      throw new MLInternalError(
        `ビデオ要素が見つかりません: ${videoElementId}`,
        "VIDEO_ELEMENT_NOT_FOUND"
      );
    }

    if (!(element instanceof HTMLVideoElement)) {
      throw new MLInternalError(
        `指定された要素はビデオ要素ではありません: ${videoElementId}`,
        "ELEMENT_TYPE_MISMATCH"
      );
    }

    const videoElement = element;

    videoElement.autoplay = true;
    videoElement.playsInline = true;
    videoElement.muted = true;

    // ビデオサイズ更新関数
    const updateVideoSize = () => {
      const parent = videoElement.parentElement;
      if (parent) {
        videoElement.style.width = `${parent.clientWidth}px`;
        videoElement.style.height = `${parent.clientHeight}px`;
        videoElement.style.objectFit = "cover";
      }
    };

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
    });

    videoElement.srcObject = stream;

    return new Promise((resolve) => {
      videoElement.onloadedmetadata = () => {
        updateVideoSize();
        const cameraManager = new CameraManager(videoElement);

        // リサイズ時のパフォーマンス最適化
        cameraManager.handleResize = () => {
          if (cameraManager.resizeTimeout) {
            clearTimeout(cameraManager.resizeTimeout);
          }
          cameraManager.resizeTimeout = window.setTimeout(() => {
            updateVideoSize();
          }, 150);
        };

        window.addEventListener("resize", cameraManager.handleResize);
        onCameraReady();
        resolve(cameraManager);
      };
    });
  }

  get video(): HTMLVideoElement {
    return this.videoElement;
  }

  dispose(): void {
    // リサイズ関連のクリーンアップ
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
      this.resizeTimeout = null;
    }

    if (this.handleResize) {
      window.removeEventListener("resize", this.handleResize);
      this.handleResize = null;
    }

    const stream = this.video.srcObject;
    if (stream instanceof MediaStream) {
      for (const track of stream.getTracks()) {
        if (track.readyState === "live") {
          track.stop();
        }
      }
    }

    this.videoElement.srcObject = null;
    this.videoElement.pause();
  }
}
