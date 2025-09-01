import { MLInternalError } from "../errors";
import type { ARDetection, Detection } from "../types";
import DetectionWorker from "../workers/detection-worker?worker";

/**
 * Main Thread Queue Processor
 * Handles queue logic with processing limit control for main thread
 */
class MainThreadQueueProcessor {
  private resultQueue: ARDetection | null | undefined = undefined;
  private queueProcessorId: number | null = null;
  private processingCount = 0;
  private maxProcessingCount: number;
  private intervalMs: number;

  constructor(
    private onDetection: (detection: Detection | ARDetection | null) => void,
    intervalMs: number,
    maxProcessingCount = 3,
    private onError?: (error: unknown) => void,
  ) {
    this.intervalMs = intervalMs;
    this.maxProcessingCount = maxProcessingCount;
  }

  /**
   * Enqueue detection result with queue logic
   */
  public enqueueResult(result: ARDetection | null): void {
    if (this.processingCount >= this.maxProcessingCount) {
      return; // Drop if processing limit exceeded
    }
    this.resultQueue = this.applyMailboxQueueLogic(this.resultQueue, result);
  }

  /**
   * Start queue processor
   */
  public start(): void {
    if (this.queueProcessorId !== null) return;
    this.queueProcessorId = setInterval(() => {
      this.processResultQueue();
    }, this.intervalMs);
  }

  /**
   * Stop queue processor
   */
  public stop(): void {
    if (this.queueProcessorId !== null) {
      clearInterval(this.queueProcessorId);
      this.queueProcessorId = null;
    }
  }

  private processResultQueue(): void {
    if (
      !this.isQueueEmpty(this.resultQueue) &&
      this.processingCount < this.maxProcessingCount
    ) {
      const result = this.resultQueue;
      this.resultQueue = undefined;
      this.processingCount++;

      Promise.resolve().then(() => {
        try {
          this.onDetection(result as ARDetection | null);
        } catch (error: unknown) {
          this.onError?.(error);
        } finally {
          this.processingCount--;
        }
      });
    }
  }

  private applyMailboxQueueLogic<T>(
    currentQueue: T | null | undefined,
    newItem: T | null,
  ): T | null | undefined {
    if (newItem === null) {
      if (currentQueue === undefined) return newItem;
      if (currentQueue !== null) return currentQueue;
      return currentQueue;
    }
    return newItem;
  }

  private isQueueEmpty(queueState: unknown): boolean {
    return queueState === undefined;
  }
}

/**
 * Worker Queue Controller
 * Manages Worker-based queue processing with fallback to main thread
 */
export class WorkerQueueController {
  private detectionWorker: Worker | null = null;
  private queueProcessor: MainThreadQueueProcessor | null = null;

  constructor(
    private onDetection: (detection: Detection | ARDetection | null) => void,
    private detectionIntervalMs: number,
  ) {
    this.initializeWorker();
    this.initializeFallbackProcessor();
  }

  /**
   * Initialize Web Worker with error handling
   */
  private initializeWorker(): void {
    try {
      this.detectionWorker = new DetectionWorker();

      this.detectionWorker.onerror = (error) => {
        new MLInternalError(
          "WORKER_RUNTIME_ERROR",
          false,
          error instanceof Error ? error : new Error(String(error)),
        );
      };

      this.detectionWorker.onmessage = (event) => {
        const { type, payload } = event.data;
        if (type === "process" && payload && "item" in payload) {
          this.onDetection(payload.item);
        }
      };
    } catch (error) {
      this.detectionWorker = null;
    }
  }

  /**
   * Initialize fallback queue processor for main thread
   */
  private initializeFallbackProcessor(): void {
    this.queueProcessor = new MainThreadQueueProcessor(
      this.onDetection,
      this.detectionIntervalMs,
      3, // maxProcessingCount
      (error: unknown) => {
        console.error("Detection callback error:", error);
      },
    );
  }

  /**
   * Enqueue detection result with Worker/fallback logic
   * @param result Detection result or null for failure
   */
  public enqueueResult(result: ARDetection | null): void {
    if (this.detectionWorker) {
      this.detectionWorker.postMessage({
        type: "enqueue",
        payload: { item: result },
      });
    } else {
      // Fallback to main thread queue processor if Worker unavailable
      this.queueProcessor?.enqueueResult(result);
    }
  }

  /**
   * Start queue processing with Worker/fallback logic
   */
  public start(): void {
    if (this.detectionWorker) {
      this.detectionWorker.postMessage({
        type: "start",
        payload: { intervalMs: this.detectionIntervalMs },
      });
    } else {
      // Fallback to main thread queue processor if Worker unavailable
      this.queueProcessor?.start();
    }
  }

  /**
   * Stop queue processing with Worker/fallback logic
   */
  public stop(): void {
    if (this.detectionWorker) {
      this.detectionWorker.postMessage({ type: "stop" });
    } else {
      // Fallback to main thread queue processor
      this.queueProcessor?.stop();
    }
  }

  /**
   * Dispose resources and cleanup
   */
  public dispose(): void {
    if (this.detectionWorker) {
      this.detectionWorker.postMessage({ type: "dispose" });
      this.detectionWorker.terminate();
      this.detectionWorker = null;
    }

    this.queueProcessor?.stop();
    this.queueProcessor = null;
  }

  /**
   * Check if Worker is available
   */
  public get hasWorker(): boolean {
    return this.detectionWorker !== null;
  }
}
