import type { ARDetection, Detection } from "../types";
import { applyMailboxQueueLogic, isQueueEmpty } from "../workers/queue-logic";

/**
 * Detection Queue Processor
 * Handles queue logic with processing limit control for main thread
 */
export class DetectionQueueProcessor {
  private resultQueue: ARDetection | null | undefined = undefined; // Single slot queue (undefined = empty)
  private queueProcessorId: number | null = null; // Queue processor interval ID
  private processingCount = 0; // Current number of items being processed
  private maxProcessingCount: number; // Maximum concurrent processing items
  private intervalMs: number; // Processing interval

  private onDetection: (detection: Detection | ARDetection | null) => void;
  private onError?: (error: unknown) => void;

  /**
   * Initialize queue processor
   * @param onDetection Callback for detection results
   * @param intervalMs Processing interval in milliseconds
   * @param maxProcessingCount Maximum concurrent processing items (default: 3)
   * @param onError Optional callback for handling errors in detection callback
   */
  constructor(
    onDetection: (detection: Detection | ARDetection | null) => void,
    intervalMs: number,
    maxProcessingCount = 3,
    onError?: (error: unknown) => void,
  ) {
    this.onDetection = onDetection;
    this.onError = onError;
    this.intervalMs = intervalMs;
    this.maxProcessingCount = maxProcessingCount;
  }

  /**
   * Enqueue detection result with queue logic
   * @param result Detection result (ARDetection or null)
   */
  public enqueueResult(result: ARDetection | null): void {
    // Check if main thread is overloaded
    if (this.processingCount >= this.maxProcessingCount) {
      // Drop the result if processing limit exceeded
      return;
    }

    this.resultQueue = applyMailboxQueueLogic(this.resultQueue, result);
  }

  /**
   * Process queue
   */
  private processResultQueue(): void {
    if (
      !isQueueEmpty(this.resultQueue) &&
      this.processingCount < this.maxProcessingCount
    ) {
      const result = this.resultQueue;
      this.resultQueue = undefined; // Clear queue

      this.processingCount++;

      // Process result asynchronously and decrement counter when done
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

  /**
   * Start queue processor
   */
  public start(): void {
    if (this.queueProcessorId !== null) {
      return; // Already running
    }

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

  /**
   * Get current processing count
   */
  public getProcessingCount(): number {
    return this.processingCount;
  }

  /**
   * Get maximum processing count
   */
  public getMaxProcessingCount(): number {
    return this.maxProcessingCount;
  }

  /**
   * Set maximum processing count
   */
  public setMaxProcessingCount(count: number): void {
    this.maxProcessingCount = count;
  }

  /**
   * Check if queue is active
   */
  public isActive(): boolean {
    return this.queueProcessorId !== null;
  }
}
