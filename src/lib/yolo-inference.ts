import * as tf from "@tensorflow/tfjs";
import { load } from "js-yaml";
import { MLInternalError } from "../errors";
import type {
  Detection,
  YOLOInferenceOptions,
  LetterboxInfo,
  YOLOMetadata,
} from "../types";
import { transformToCanvas, findValidDetections } from "../helpers/yolo-helper";

/**
 * YOLO Inference Instance
 * Real-time object detection using TensorFlow.js
 */
export class YOLOInference {
  private model: tf.GraphModel | null = null; // Loaded YOLO model
  private metadata: YOLOMetadata | null = null; // Model metadata information
  private scoreThreshold: number; // Minimum confidence score for detection
  private memoryThreshold: number; // Memory cleanup threshold

  /**
   * YOLO inference configuration
   */
  constructor(private options: YOLOInferenceOptions) {
    this.scoreThreshold = options.scoreThreshold || 0.7;
    this.memoryThreshold = options.memoryThreshold || 50;
  }

  /**
   * Initialize inference engine (metadata → model loading)
   */
  public async initialize(): Promise<void> {
    await this.loadMetadata();
    await this.loadModel();
  }

  /**
   * Execute object detection
   */
  public async predict(
    imageTensor: tf.Tensor4D,
    letterboxInfo?: LetterboxInfo,
    canvasElement?: HTMLCanvasElement,
  ): Promise<Detection[]> {
    if (!this.model) {
      throw new MLInternalError("MODEL_NOT_INITIALIZED");
    }

    const results = this.model.predict(imageTensor) as tf.Tensor;
    try {
      let predictions = this.processRawPredictions(results);

      // Coordinate transformation
      if (letterboxInfo && canvasElement) {
        predictions = transformToCanvas(
          predictions,
          letterboxInfo,
          canvasElement,
        );
      }

      this.logMemoryUsage();
      return predictions;
    } finally {
      results.dispose();
    }
  }

  /**
   * Get metadata
   * @throws {MLInternalError} When metadata is not initialized
   */
  public get metadataInstance(): YOLOMetadata {
    if (!this.metadata) {
      throw new MLInternalError("METADATA_NOT_INITIALIZED");
    }
    return this.metadata;
  }

  /**
   * Get model instance
   * @throws {MLInternalError} When model is not initialized
   */
  public get modelInstance(): tf.GraphModel {
    if (!this.model) {
      throw new MLInternalError("MODEL_NOT_INITIALIZED");
    }
    return this.model;
  }

  /**
   * Release resources
   */
  public dispose(): void {
    if (this.model) {
      this.model.dispose();
      this.model = null;
    }
  }

  /**
   * Load metadata file
   */
  private async loadMetadata(): Promise<void> {
    try {
      const response = await fetch(this.options.metadataPath);
      const text = await response.text();
      this.metadata = load(text) as YOLOMetadata;
    } catch (error: unknown) {
      throw new MLInternalError("FAILED_TO_LOAD_METADATA");
    }
  }

  /**
   * Load YOLO model
   */
  private async loadModel(): Promise<void> {
    try {
      this.model = await tf.loadGraphModel(this.options.modelPath);
    } catch (error: unknown) {
      throw new MLInternalError("FAILED_TO_LOAD_MODEL");
    }
  }

  /**
   * Post-process prediction results
   */
  private processRawPredictions(results: tf.Tensor): Detection[] {
    const squeezed = results.squeeze();

    try {
      const numDetections = squeezed.shape[1] || 0;
      if (numDetections === 0) return [];

      const data = squeezed.arraySync() as number[][];
      const detectionList = findValidDetections(
        data,
        numDetections,
        this.scoreThreshold,
      );

      return detectionList;
    } finally {
      squeezed.dispose();
    }
  }

  /**
   * Monitor memory usage and cleanup
   */
  public logMemoryUsage(): void {
    const memoryInfo = tf.memory();
    console.info(
      `[YOLOEngine] Memory: ${memoryInfo.numTensors} tensors, ${(
        memoryInfo.numBytes / 1024 / 1024
      ).toFixed(2)}MB`,
    );

    if (memoryInfo.numTensors > this.memoryThreshold) {
      console.warn(
        `[YOLOEngine] High tensor count detected: ${memoryInfo.numTensors} (threshold: ${this.memoryThreshold})`,
      );
      this.cleanupMemory();
    }
  }

  /**
   * Execute memory cleanup
   */
  private cleanupMemory(): void {
    tf.disposeVariables();
    const memoryInfo = tf.memory();
    console.info(
      `[YOLOEngine] Memory cleanup completed: ${
        memoryInfo.numTensors
      } tensors, ${(memoryInfo.numBytes / 1024 / 1024).toFixed(2)}MB`,
    );
  }
}
