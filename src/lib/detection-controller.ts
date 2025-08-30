import * as tf from "@tensorflow/tfjs";
import { CameraManager } from "./camera-manager";
import { CanvasManager } from "./canvas-manager";
import { YOLOInference } from "./yolo-inference";
import { MLInternalError } from "../errors";
import { CONSOLE_MESSAGES } from "../errors/error-messages";
import { cropNormalizedVideoTensor } from "../helpers/tensor-helper";
import { letterboxTransform } from "../helpers/yolo-helper";
import { add3DToDetection } from "../helpers/3d-helper";
import type {
  ObjectDetectorOptions,
  Detection,
  ARDetection,
  LetterboxInfo,
} from "../types";

// Type definitions
type TensorFlowBackend = "webgl" | "webgpu" | "wasm" | "cpu";

// Constant definitions
const DEFAULT_INFERENCE_INTERVAL_MS = 50;
const DEFAULT_BACKEND: TensorFlowBackend = "webgl";
const RESUME_DELAY_MS = 1000;
const BYTES_TO_MB = 1024 * 1024;

/**
 * Object Detection Controller
 * Integrates camera, canvas, and YOLO inference management and runs real-time detection loops
 * Implements fatal/non-fatal error handling to continue detection processing even when errors occur
 */
// Detection state definitions
enum DetectionState {
  IDLE = "idle", // Idle state (detection ready)
  PROCESSING = "processing", // Detection processing in progress
  PAUSED = "paused", // Paused
  DETECTION_PAUSED = "detection_paused", // Detection paused (camera continues)
}

export class DetectionController {
  private detectionIntervalMs: number; // Detection execution interval (milliseconds)
  private yoloInference: YOLOInference; // YOLO inference instance
  private detectionState = DetectionState.IDLE; // Current detection state
  private lastDetectionTimestamp = 0; // Last detection execution time
  private cameraManager: CameraManager | null = null; // Camera management instance
  private canvasManager: CanvasManager | null = null; // Canvas management instance
  private backend: TensorFlowBackend; // TensorFlow.js backend
  private detectionIntervalId: number | null = null; // Detection interval ID
  private isDetectionRunning = false; // Flag to prevent overlapping detections

  // Single slot control for 1 frame = 1 detection max
  private inFlight = false; // Detection processing in worker
  private hasResult = false; // Unprocessed result available
  private latestResult: Detection | null = null; // Latest detection result (single slot)
  private rafId: number | null = null; // RequestAnimationFrame ID

  // Performance optimization cache
  private cachedCropRegion?: ReturnType<typeof this.calculateCropRegion>; // Crop region cache
  private lastVideoDimensions?: { width: number; height: number }; // Previous video dimensions
  private lastCanvasDimensions?: { width: number; height: number }; // Previous canvas dimensions

  private onDetection: (detection: Detection | ARDetection | null) => void; // Detection result callback
  private onCameraReady: () => void; // Camera ready callback
  private onCameraNotAllowed: () => void; // Camera access denied callback

  // 3D estimation settings
  private enable3D: boolean; // Whether to enable 3D estimation

  private threeDOptions?: ObjectDetectorOptions["threeDEstimation"]; // 3D estimation options

  /**
   * Controller initial configuration
   * @param modelPath Path to TensorFlow.js model file
   * @param metadataPath Path to YOLO metadata file
   * @param options Object detection configuration options (inference interval, etc.)
   */
  constructor(
    modelPath: string,
    metadataPath: string,
    options: ObjectDetectorOptions = {},
  ) {
    this.detectionIntervalMs =
      options.detection?.inferenceInterval || DEFAULT_INFERENCE_INTERVAL_MS;
    this.backend = options.performance?.backend || DEFAULT_BACKEND;

    // YOLO configuration
    this.yoloInference = new YOLOInference({
      modelPath,
      metadataPath,
      scoreThreshold: options.detection?.scoreThreshold,
      memoryThreshold: options.performance?.memoryThreshold,
    });

    this.onDetection = options.onDetection || (() => {});
    this.onCameraReady = options.onCameraReady || (() => {});
    this.onCameraNotAllowed = options.onCameraNotAllowed || (() => {});

    // 3D estimation configuration
    this.enable3D = !!options.threeDEstimation;
    this.threeDOptions = options.threeDEstimation;
  }

  /**
   * Controller initialization and real-time detection start
   * @param videoElementId ID of video element to display camera feed
   * @param canvasElementId ID of canvas element to draw detection results
   */
  public async initialize(
    videoElementId: string,
    canvasElementId: string,
  ): Promise<void> {
    // TensorFlow.js backend configuration
    await this.setupBackend();

    await this.yoloInference.initialize();

    try {
      await this.setupCamera(videoElementId);
    } catch (error: unknown) {
      // Camera access denied
      if (error instanceof Error && error.name === "NotAllowedError") {
        this.onCameraNotAllowed();
        return;
      }
      throw error;
    }

    this.setupCanvas(canvasElementId);
    this.startDetectionLoop();
  }

  private async setupCamera(videoElementId: string): Promise<void> {
    this.cameraManager = await CameraManager.setup(
      videoElementId,
      this.onCameraReady,
    );
  }

  private setupCanvas(canvasElementId: string): void {
    this.canvasManager = CanvasManager.setup(canvasElementId);
  }

  /**
   * Execute object detection processing
   * Performs cropping, inference, and result processing in sequence and returns detection results
   * @returns Array of detection results (in canvas coordinate system)
   */
  private async detectObjects(): Promise<Detection[]> {
    // Calculate crop region based on aspect ratio (using cache)
    const { cropX, cropY, croppedWidth, croppedHeight } =
      this.getCachedCropRegion();

    // Create tensor and run YOLO inference
    const { detectionResults } = await this.preprocessVideoFrameAndPredict(
      cropX,
      cropY,
      croppedWidth,
      croppedHeight,
    );

    // Process detection results
    this.handleDetectionResults(detectionResults);

    // Clear canvas and prepare for next drawing
    const canvas = this.canvas;
    const context = this.canvasContext;
    context.clearRect(0, 0, canvas.width, canvas.height);

    return detectionResults;
  }

  /**
   * Start real-time detection loop using RAF with single slot control
   * 1 frame = max 1 detection result applied
   */
  private startDetectionLoop(): void {
    // Initialize detection scheduling flag
    this.detectionIntervalId = 1; // Set non-null to enable scheduling

    // Start RAF loop for result application
    this.startRAFLoop();

    // Schedule detection requests
    this.scheduleDetection();
  }

  /**
   * Single RAF loop for result application (1 per frame max)
   */
  private startRAFLoop(): void {
    const rafTick = () => {
      // Apply result if available (single slot)
      if (this.hasResult) {
        this.onDetection(this.latestResult); // Can be null
        this.hasResult = false;
        this.latestResult = null;
      }

      // Continue RAF loop
      if (this.rafId !== null) {
        this.rafId = requestAnimationFrame(rafTick);
      }
    };

    this.rafId = requestAnimationFrame(rafTick);
  }

  /**
   * Schedule detection execution (non-blocking)
   */
  private scheduleDetection(): void {
    const schedule = () => {
      setTimeout(() => {
        // Only start new detection if not in flight
        if (!this.inFlight) {
          this.inFlight = true;

          // Execute detection without blocking
          setTimeout(() => {
            this.executeDetectionCycle().finally(() => {
              this.inFlight = false;
            });
          }, 0);
        }

        // Continue scheduling
        if (this.detectionIntervalId !== null) {
          schedule();
        }
      }, this.detectionIntervalMs);
    };

    schedule();
  }

  /**
   * Execute single detection cycle
   */
  private async executeDetectionCycle(): Promise<void> {
    const currentTime = Date.now();

    // Check execution conditions and prevent overlapping detections
    if (!this.shouldExecuteDetection(currentTime) || this.isDetectionRunning) {
      return;
    }

    this.isDetectionRunning = true;
    this.detectionState = DetectionState.PROCESSING;
    this.lastDetectionTimestamp = currentTime;

    try {
      await this.detectObjects();
    } catch (error) {
      this.handleDetectionError(error);
    } finally {
      this.isDetectionRunning = false;
      if (this.detectionState === DetectionState.PROCESSING) {
        this.detectionState = DetectionState.IDLE;
      }
    }
  }

  /**
   * Handle detection errors
   * @param error The error that occurred
   */
  private handleDetectionError(error: unknown): void {
    if (error instanceof MLInternalError) {
      this.handleMLError(error);
    } else {
      this.handleUnexpectedError(error);
    }
  }

  /**
   * Handle ML-related errors
   * @param error MLInternalError instance
   */
  private handleMLError(error: MLInternalError): void {
    if (error.fatal) {
      this.handleFatalError(error);
    } else {
      this.handleNonFatalError(error);
    }
  }

  /**
   * Handle fatal errors
   * @param error Fatal error
   */
  private handleFatalError(error: MLInternalError): void {
    console.error(CONSOLE_MESSAGES.FATAL_ERROR, error);
    this.pause();
    throw error;
  }

  /**
   * Handle non-fatal errors
   * @param error Non-fatal error
   */
  private handleNonFatalError(error: MLInternalError): void {
    console.warn(CONSOLE_MESSAGES.NON_FATAL_ERROR, error);
  }

  /**
   * Handle unexpected errors
   * @param error Unexpected error
   */
  private handleUnexpectedError(error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(CONSOLE_MESSAGES.UNEXPECTED_ERROR, errorMessage, error);
  }

  /**
   * Handle detection results (single slot storage)
   * @param detectionResults Detection results array
   */
  private handleDetectionResults(
    detectionResults: Detection[] | ARDetection[],
  ): void {
    if (detectionResults.length > 0) {
      let result = detectionResults[0];

      // Add 3D information if 3D estimation is enabled and settings are configured
      if (this.enable3D && this.threeDOptions) {
        result = add3DToDetection(
          result,
          this.canvas.width,
          this.threeDOptions.objectSize,
          this.threeDOptions.orientationCoefficients,
        ) as ARDetection;
      }

      // Store in single slot (overwrites previous if exists)
      this.latestResult = result;
      this.hasResult = true;
    } else {
      // Store null result
      this.latestResult = null;
      this.hasResult = true;
    }
  }

  /**
   * Determine whether detection execution is possible
   * @param currentTime Current time (milliseconds)
   * @returns Whether execution is possible
   */
  private shouldExecuteDetection(currentTime: number): boolean {
    return (
      this.detectionState === DetectionState.IDLE &&
      currentTime - this.lastDetectionTimestamp >= this.detectionIntervalMs
    );
  }

  /**
   * Pause detection processing
   * Stops detection interval and RAF loop, optionally pauses camera
   * @param options Pause options. If pauseCamera is false, only pauses detection (camera continues).
   */
  public pause(
    options: { pauseCamera?: boolean } = { pauseCamera: true },
  ): void {
    // Clear detection interval to stop processing
    if (this.detectionIntervalId !== null) {
      clearTimeout(this.detectionIntervalId);
      this.detectionIntervalId = null;
    }

    // Stop RAF loop
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    // Reset detection flags and clear results
    this.isDetectionRunning = false;
    this.inFlight = false;
    this.hasResult = false;
    this.latestResult = null;

    if (options.pauseCamera) {
      this.detectionState = DetectionState.PAUSED;
      this.video.pause();
    } else {
      this.detectionState = DetectionState.DETECTION_PAUSED;
    }
  }

  /**
   * Resume detection processing
   * Restarts detection interval and resumes camera if needed
   */
  public async resume(): Promise<void> {
    const restartDetection = () => {
      this.lastDetectionTimestamp = 0;
      this.detectionState = DetectionState.IDLE;
      // Restart detection interval
      this.startDetectionLoop();
    };

    if (this.video.paused) {
      try {
        await this.video.play();
      } finally {
        setTimeout(restartDetection, RESUME_DELAY_MS);
      }
    } else {
      setTimeout(restartDetection, RESUME_DELAY_MS);
    }
  }

  /**
   * Get video element
   * @throws {MLInternalError} When camera manager is not initialized
   */
  public get video(): HTMLVideoElement {
    if (!this.cameraManager) {
      throw new MLInternalError("CAMERA_MANAGER_NOT_INITIALIZED");
    }
    return this.cameraManager.video;
  }

  /**
   * Get canvas element
   * @throws {MLInternalError} When canvas manager is not initialized
   */
  public get canvas(): HTMLCanvasElement {
    if (!this.canvasManager) {
      throw new MLInternalError("CANVAS_MANAGER_NOT_INITIALIZED");
    }
    return this.canvasManager.element;
  }

  /**
   * Get 2D context
   * @throws {MLInternalError} When canvas manager is not initialized
   */
  public get canvasContext(): CanvasRenderingContext2D {
    if (!this.canvasManager) {
      throw new MLInternalError("CANVAS_MANAGER_NOT_INITIALIZED");
    }
    return this.canvasManager.ctx;
  }

  /**
   * Create tensor from video frame, run YOLO inference, and return detection results in canvas coordinate system
   * Manages memory appropriately and ensures intermediate tensors are disposed
   *
   * @param cropX Crop start X coordinate (in pixels)
   * @param cropY Crop start Y coordinate (in pixels)
   * @param croppedWidth Crop width (in pixels)
   * @param croppedHeight Crop height (in pixels)
   * @returns Detection results and letterbox information in canvas coordinate system
   */
  private async preprocessVideoFrameAndPredict(
    cropX: number,
    cropY: number,
    croppedWidth: number,
    croppedHeight: number,
  ): Promise<{
    detectionResults: Detection[];
    letterboxInfo: LetterboxInfo;
  }> {
    let preprocessedInputTensor: tf.Tensor4D | null = null;
    let letterboxTransformInfo: LetterboxInfo | undefined;

    try {
      // Automatically manage memory for intermediate tensors with tf.tidy
      preprocessedInputTensor = tf.tidy(() => {
        // Normalize video frame and crop specified region
        const normalizedCroppedTensor = cropNormalizedVideoTensor(
          this.video,
          cropX,
          cropY,
          croppedWidth,
          croppedHeight,
        );

        // Apply letterbox transformation to match YOLO model input size
        const {
          output: paddedTensor,
          letterboxInfo: letterboxTransformResult,
        } = letterboxTransform(
          normalizedCroppedTensor,
          this.yoloInference.metadataInstance.imgsz,
        );

        // Add crop information needed for coordinate transformation
        letterboxTransformInfo = {
          ...letterboxTransformResult,
          croppedWidth,
          croppedHeight,
        };

        // Add batch dimension and convert to model input format
        return paddedTensor.expandDims(0) as tf.Tensor4D;
      });

      // Verify letterboxTransformInfo
      if (!letterboxTransformInfo) {
        throw new MLInternalError("LETTERBOX_TRANSFORM_NOT_GENERATED");
      }

      // YOLO inference and conversion to canvas coordinate system
      const detectionResults = await this.yoloInference.predict(
        preprocessedInputTensor,
        letterboxTransformInfo,
        this.canvas,
      );

      return { detectionResults, letterboxInfo: letterboxTransformInfo };
    } finally {
      if (preprocessedInputTensor) {
        preprocessedInputTensor.dispose();
      }
    }
  }

  /**
   * Get crop region using cache
   * Returns cached values if there are no changes to video and canvas sizes
   * @returns Coordinates and dimensions of crop region
   */
  private getCachedCropRegion(): {
    cropX: number;
    cropY: number;
    croppedWidth: number;
    croppedHeight: number;
  } {
    const video = this.video;
    const canvas = this.canvas;
    const currentVideoDimensions = {
      width: video.videoWidth,
      height: video.videoHeight,
    };
    const currentCanvasDimensions = {
      width: canvas.width,
      height: canvas.height,
    };

    // Check if cache is valid (both video and canvas sizes)
    if (
      this.cachedCropRegion &&
      this.lastVideoDimensions &&
      this.lastCanvasDimensions &&
      this.lastVideoDimensions.width === currentVideoDimensions.width &&
      this.lastVideoDimensions.height === currentVideoDimensions.height &&
      this.lastCanvasDimensions.width === currentCanvasDimensions.width &&
      this.lastCanvasDimensions.height === currentCanvasDimensions.height
    ) {
      return this.cachedCropRegion;
    }

    // Calculate new values and cache them
    this.cachedCropRegion = this.calculateCropRegion();
    this.lastVideoDimensions = currentVideoDimensions;
    this.lastCanvasDimensions = currentCanvasDimensions;
    return this.cachedCropRegion;
  }

  /**
   * Calculate crop region based on aspect ratios of video and canvas
   * Adjusts for aspect ratio differences to extract appropriate region
   * @returns Coordinates and dimensions of crop region
   */
  private calculateCropRegion(): {
    cropX: number;
    cropY: number;
    croppedWidth: number;
    croppedHeight: number;
  } {
    const video = this.video;
    const canvas = this.canvas;

    const videoAspectRatio = video.videoWidth / video.videoHeight;
    const canvasAspectRatio = canvas.width / canvas.height;

    // Default (use entire area)
    let cropX = 0;
    let cropY = 0;
    let croppedWidth = video.videoWidth;
    let croppedHeight = video.videoHeight;

    // For landscape video
    if (videoAspectRatio > canvasAspectRatio) {
      croppedWidth = video.videoHeight * canvasAspectRatio;
      cropX = (video.videoWidth - croppedWidth) / 2;
      // For portrait video
    } else if (videoAspectRatio < canvasAspectRatio) {
      croppedHeight = video.videoWidth / canvasAspectRatio;
      cropY = (video.videoHeight - croppedHeight) / 2;
    }

    return { cropX, cropY, croppedWidth, croppedHeight };
  }

  /**
   * Release all resources and clean up memory
   * Properly dispose of camera, canvas, and inference instances
   */
  public dispose(): void {
    this.detectionState = DetectionState.PAUSED;

    // Clear detection interval
    if (this.detectionIntervalId !== null) {
      clearTimeout(this.detectionIntervalId);
      this.detectionIntervalId = null;
    }

    // Stop RAF loop
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    // Reset detection flags and clear results
    this.isDetectionRunning = false;
    this.inFlight = false;
    this.hasResult = false;
    this.latestResult = null;

    // Dispose camera
    if (this.cameraManager) {
      this.cameraManager.dispose();
      this.cameraManager = null;
    }

    // Dispose canvas
    if (this.canvasManager) {
      this.canvasManager.dispose();
      this.canvasManager = null;
    }

    // Clear cache
    this.cachedCropRegion = undefined;
    this.lastVideoDimensions = undefined;
    this.lastCanvasDimensions = undefined;

    // Dispose inference instance
    this.yoloInference.dispose();

    // Final memory state
    const memoryStats = tf.memory();
    console.info(
      `Disposed - Final memory state: ${memoryStats.numTensors} tensors, ${(
        memoryStats.numBytes / BYTES_TO_MB
      ).toFixed(2)}MB`,
    );
  }

  /**
   * Configure and initialize TensorFlow.js backend
   * Sets up specified backend (webgl/webgpu/cpu, etc.)
   */
  private async setupBackend(): Promise<void> {
    await tf.setBackend(this.backend);
    await tf.ready();
  }
}
