import type { Detection, ARDetection } from "../types";

/**
 * Visual effect configuration options
 */
export interface VisualEffectOptions {
  /** Flash interval (milliseconds). Default: 500ms */
  interval?: number;
  /** Flash duration (milliseconds). Default: 2000ms (ignored if count is specified) */
  duration?: number;
  /** Number of flashes. When specified, duration is ignored */
  count?: number;
  /** Border color. Default: '#ff0000' */
  color?: string;
  /** Border thickness. Default: 3 */
  lineWidth?: number;
}

/**
 * Draw flashing detection box effect on canvas
 *
 * @param canvas - Target canvas element for drawing
 * @param detection - Detection result
 * @param options - Flash configuration options
 * @returns Promise resolved when flash effect completes
 */
export function startFlashEffect(
  canvas: HTMLCanvasElement,
  detection: Detection | ARDetection,
  options: VisualEffectOptions = {},
): Promise<void> {
  const {
    interval = 500,
    duration = 2000,
    count,
    color = "#ff0000",
    lineWidth = 3,
  } = options;

  return new Promise<void>((resolve) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas 2D context not available");
    }

    let isVisible = true;
    let stopTimeout: number;
    let completedFlashes = 0;

    // Function to draw the box
    const drawBox = () => {
      // Clear the canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (!isVisible) return;

      const [x, y, w, h] = detection.boundingBox;
      const angle = detection.angle * (Math.PI / 180);

      // Save context state
      ctx.save();

      // Reset transformation and apply new transformation
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.translate(x, y);
      ctx.rotate(angle);

      // Draw bounding box
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.strokeRect(-w / 2, -h / 2, w, h);

      // Restore context state
      ctx.restore();
    };

    // Stop processing
    const stop = () => {
      clearInterval(flashInterval);
      clearTimeout(stopTimeout);
      // Finally clear the canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      resolve();
    };

    // Flash animation
    const flashInterval = window.setInterval(() => {
      drawBox(); // Draw with current isVisible state
      isVisible = !isVisible; // Switch to next state

      // Check if count is specified
      if (count !== undefined) {
        // Count completed flashes when box becomes invisible
        if (!isVisible) {
          completedFlashes++;
          if (completedFlashes >= count) {
            stop();
          }
        }
      }
    }, interval);

    // Timeout for duration-based mode (only when count is not specified)
    if (count === undefined) {
      stopTimeout = window.setTimeout(stop, duration);
    }
  });
}
