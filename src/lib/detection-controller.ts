import * as tf from "@tensorflow/tfjs";
import { MLInternalError } from "../errors";
import { add3DToDetection } from "../helpers/3d-helper";
import { cropNormalizedVideoTensor } from "../helpers/tensor-helper";
import { letterboxTransform } from "../helpers/yolo-helper";
import type {
  ARDetection,
  Detection,
  LetterboxInfo,
  ObjectDetectorOptions,
} from "../types";
import { CameraManager } from "./camera-manager";
import { CanvasManager } from "./canvas-manager";
import { WorkerQueueController } from "./worker-queue-controller";
import { YOLOInference } from "./yolo-inference";

// Type definitions
type TensorFlowBackend = "webgl" | "webgpu" | "wasm" | "cpu";

// Constant definitions
const DEFAULT_INFERENCE_INTERVAL_MS = 150; // ~6.7fps - balance for hand shake tolerance and performance
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
  private workerQueueController: WorkerQueueController | null = null; // Worker queue controller with fallback

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

    // Initialize Worker queue controller with fallback
    this.workerQueueController = new WorkerQueueController(
      this.onDetection,
      this.detectionIntervalMs,
    );
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
      // Wrap unknown errors in MLInternalError
      throw new MLInternalError("CAMERA_SETUP_FAILED");
    }

    this.setupCanvas(canvasElementId);
    // Start detection loop and queue processor
    this.startDetectionLoop();

    // Start Worker queue processing
    this.workerQueueController?.start();
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
    // Calculate crop region based on aspect ratio
    const { cropX, cropY, croppedWidth, croppedHeight } =
      this.calculateCropRegion();

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
   * Start real-time detection loop with single slot control
   */
  private startDetectionLoop(): void {
    this.scheduleDetection();
  }

  /**
   * Schedule detection execution with single slot control
   */
  private scheduleDetection(): void {
    const schedule = () => {
      this.detectionIntervalId = setTimeout(() => {
        // Execute detection asynchronously
        queueMicrotask(() => {
          this.executeDetectionCycle();
        });

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
      // Wrap unexpected errors in MLInternalError
      const wrappedError = new MLInternalError(
        "UNEXPECTED_DETECTION_ERROR",
        true,
        error as Error,
      );
      this.handleMLError(wrappedError);
    }
  }

  /**
   * Handle ML-related errors
   * @param error MLInternalError instance
   */
  private handleMLError(error: MLInternalError): void {
    if (error.fatal) {
      this.handleFatalError(error);
    }
  }

  /**
   * Handle fatal errors
   * @param error Fatal error
   */
  private handleFatalError(error: MLInternalError): void {
    this.pause();
    throw error;
  }

  /**
   * Handle detection results
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

      this.workerQueueController?.enqueueResult(result as ARDetection);
    } else {
      this.workerQueueController?.enqueueResult(null);
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

    // Stop detection worker and queue processor
    this.workerQueueController?.stop();

    // Reset detection flags
    this.isDetectionRunning = false;

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
      this.startDetectionLoop();
      this.workerQueueController?.start();
    };

    if (this.video.paused) {
      await this.video.play().catch(() => {});
    }
    setTimeout(restartDetection, RESUME_DELAY_MS);
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

    // Dispose detection worker and queue processor
    this.workerQueueController?.dispose();
    this.workerQueueController = null;

    // Reset detection flags
    this.isDetectionRunning = false;

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
    try {
      await tf.setBackend(this.backend);
      await tf.ready();
    } catch (error) {
      throw new MLInternalError(
        "TENSORFLOW_BACKEND_SETUP_FAILED",
        true,
        error as Error,
      );
    }
  }
}
