import { MLInternalError } from "../errors";

/**
 * Class for canvas configuration and resize management
 */
export class CanvasManager {
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  private resizeTimeout: number | null = null;
  private handleResize: (() => void) | null = null;

  private constructor(
    canvas: HTMLCanvasElement,
    context: CanvasRenderingContext2D,
  ) {
    this.canvas = canvas;
    this.context = context;
  }

  /**
   * Set up canvas element
   */
  static setup(canvasElementId: string): CanvasManager {
    const element = document.getElementById(canvasElementId);

    if (!element) {
      throw new MLInternalError("CANVAS_ELEMENT_NOT_FOUND");
    }

    if (!(element instanceof HTMLCanvasElement)) {
      throw new MLInternalError("NOT_A_CANVAS_ELEMENT");
    }

    const canvas = element;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new MLInternalError("FAILED_TO_GET_2D_CONTEXT");
    }

    // Canvas size update function
    const updateCanvasSize = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
        canvas.style.width = `${parent.clientWidth}px`;
        canvas.style.height = `${parent.clientHeight}px`;
      }
    };

    updateCanvasSize();
    const canvasManager = new CanvasManager(canvas, context);

    // Performance optimization for resize events
    canvasManager.handleResize = () => {
      if (canvasManager.resizeTimeout) {
        clearTimeout(canvasManager.resizeTimeout);
      }
      canvasManager.resizeTimeout = window.setTimeout(() => {
        updateCanvasSize();
      }, 150);
    };

    window.addEventListener("resize", canvasManager.handleResize);

    return canvasManager;
  }

  get element(): HTMLCanvasElement {
    return this.canvas;
  }

  get ctx(): CanvasRenderingContext2D {
    return this.context;
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
  }
}
