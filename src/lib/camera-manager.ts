import { MLInternalError } from "../errors";

/**
 * Class for camera configuration and resize management
 */
export class CameraManager {
  private videoElement: HTMLVideoElement;
  private resizeTimeout: number | null = null;
  private handleResize: (() => void) | null = null;

  private constructor(videoElement: HTMLVideoElement) {
    this.videoElement = videoElement;
  }

  /**
   * Set up camera stream
   */
  static async setup(
    videoElementId: string,
    onCameraReady: () => void,
  ): Promise<CameraManager> {
    const element = document.getElementById(videoElementId);

    if (!element) {
      throw new MLInternalError("VIDEO_ELEMENT_NOT_FOUND");
    }

    if (!(element instanceof HTMLVideoElement)) {
      throw new MLInternalError("NOT_A_VIDEO_ELEMENT");
    }

    const videoElement = element;

    videoElement.autoplay = true;
    videoElement.playsInline = true;
    videoElement.muted = true;

    // Video size update function
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

        // Performance optimization for resize events
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
    // Clean up resize-related resources
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
