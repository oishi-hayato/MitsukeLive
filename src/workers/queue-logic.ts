/**
 * Single-slot mailbox queue logic
 * Implements the detection result queueing pattern used across the application
 */

/**
 * Applies mailbox queue logic to determine if and how to enqueue an item
 * @param currentQueue Current queue state (undefined = empty, null = failure, other = success)
 * @param newItem New item to potentially enqueue (null = failure, other = success)
 * @returns New queue state, or the unchanged current queue if item should be ignored
 */
export function applyMailboxQueueLogic<T>(
  currentQueue: T | null | undefined,
  newItem: T | null,
): T | null | undefined {
  if (newItem === null) {
    // Failure (null) received
    if (currentQueue === undefined) {
      // If queue is empty → enqueue
      return newItem;
    }
    if (currentQueue !== null) {
      // If queue has success → ignore (don't enqueue)
      return currentQueue;
    }
    // If queue has failure → pass through (don't replace)
    return currentQueue;
  }
  // Success (non-null) received
  // Always update (overwrite with success regardless of queue state)
  return newItem;
}

/**
 * Checks if a queue state represents an empty queue
 * @param queueState Queue state to check
 * @returns True if queue is empty (undefined)
 */
export function isQueueEmpty(queueState: unknown): boolean {
  return queueState === undefined;
}

/**
 * Checks if a queue state represents a success result
 * @param queueState Queue state to check
 * @returns True if queue contains a success result (not null and not undefined)
 */
export function isQueueSuccess(queueState: unknown): boolean {
  return queueState !== null && queueState !== undefined;
}

/**
 * Checks if a queue state represents a failure result
 * @param queueState Queue state to check
 * @returns True if queue contains a failure result (null)
 */
export function isQueueFailure(queueState: unknown): boolean {
  return queueState === null;
}
