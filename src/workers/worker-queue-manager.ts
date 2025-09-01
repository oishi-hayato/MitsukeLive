import { applyMailboxQueueLogic, isQueueEmpty } from "./queue-logic";

/**
 * Worker Queue Manager
 * Handles queue logic for Web Workers with single-slot mailbox pattern
 */
export class WorkerQueueManager<T = unknown> {
  private queue: T | null | undefined = undefined;
  private intervalId: number | null = null;
  private isRunning = false;

  /**
   * Process queue and send items via postMessage
   */
  private processQueue(): void {
    if (!this.isRunning || isQueueEmpty(this.queue)) {
      return;
    }

    const item = this.queue;
    this.queue = undefined;

    self.postMessage({
      type: "process",
      payload: { item },
    });
  }

  /**
   * Enqueue item with mailbox logic
   * @param item Item to enqueue (null for failure, other values for success)
   */
  public enqueue(item: T | null): void {
    if (!this.isRunning) return;

    this.queue = applyMailboxQueueLogic(this.queue, item);
  }

  /**
   * Start queue processing
   * @param intervalMs Processing interval in milliseconds
   */
  public start(intervalMs: number): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.intervalId = setInterval(() => this.processQueue(), intervalMs);
  }

  /**
   * Stop queue processing
   */
  public stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Get current running status
   */
  public getIsRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get current queue status (for debugging)
   */
  public getQueueStatus(): {
    isEmpty: boolean;
    hasItem: boolean;
    item?: T | null;
  } {
    return {
      isEmpty: isQueueEmpty(this.queue),
      hasItem: !isQueueEmpty(this.queue),
      item: this.queue,
    };
  }
}
