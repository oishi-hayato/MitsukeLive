/**
 * Interface representing basic object detection results
 */
export interface Detection {
  /** Bounding box [centerX, centerY, width, height] - center coordinates from YOLO */
  boundingBox: [number, number, number, number];
  /** Yaw angle (degrees) - rotation around Y-axis, default value is 0 degrees → Maps to Three.js rotation.y */
  angle: number;
  /** Confidence score (0.0-1.0) */
  score: number;
}

/**
 * Interface representing detection results for AR mode (with 3D information)
 */
export interface ARDetection extends Detection {
  /** Estimated Z-axis coordinate (in meters, closer to 0 means nearer) */
  depth: number;
  /** Complete 3D orientation angles in degrees (Three.js compatible) */
  orientation: {
    pitch: number; // Up-down tilt (-90 to 90 degrees) → Maps to Three.js rotation.x
    roll: number; // Left-right tilt (-180 to 180 degrees) → Maps to Three.js rotation.z
    yaw: number; // Heading left-right (-180 to 180 degrees) → Maps to Three.js rotation.y (inherited from Detection.angle)
  };
}

/**
 * Configuration options for object detector
 */
export interface ObjectDetectorOptions {
  /** Detection settings */
  detection?: {
    /** Inference execution interval (milliseconds). Default: 500ms */
    inferenceInterval?: number;
    /** Minimum confidence score for detection. Default: 0.7 */
    scoreThreshold?: number;
  };

  /** 3D estimation settings */
  threeDEstimation?: ThreeDEstimationOptions;

  /** Performance settings */
  performance?: {
    /** TensorFlow.js backend. Default: 'webgl' */
    backend?: "webgl" | "webgpu" | "wasm" | "cpu";
    /** Threshold for tensor count to execute memory cleanup. Default: 50 */
    memoryThreshold?: number;
  };

  /**
   * Callback function called during object detection
   * @param detection Detection result (null if no detection, ARDetection when 3D estimation is enabled)
   * Note: This callback is not called when detection is paused with pause({ pauseCamera: false })
   */
  onDetection?: (detection: Detection | ARDetection | null) => void;
  /** Callback function called when camera initialization is complete */
  onCameraReady?: () => void;
  /** Callback function called when camera access is not allowed */
  onCameraNotAllowed?: () => void;
}

/**
 * Internal configuration options for YOLO inference instance
 * @internal
 */
export interface YOLOInferenceOptions {
  /** Path to TensorFlow.js model file */
  modelPath: string;
  /** Path to YOLO metadata file */
  metadataPath: string;
  /** Minimum confidence score for detection. Default: 0.7 */
  scoreThreshold?: number;
  /** Threshold for tensor count to execute memory cleanup. Default: 50 */
  memoryThreshold?: number;
}

/**
 * Interface storing letterbox transformation information
 * Holds transformation parameters for adjusting image to model input size
 *
 * @interface LetterboxInfo
 * @description Transformation information when resizing while maintaining aspect ratio and adjusting with padding
 */
export interface LetterboxInfo {
  /** Scale ratio */
  scale: number;
  /** Top margin */
  top: number;
  /** Left margin */
  left: number;
  /** Width before padding applied */
  scaledWidth: number;
  /** Height before padding applied */
  scaledHeight: number;
  /** Crop width */
  croppedWidth?: number;
  /** Crop height */
  croppedHeight?: number;
}

/**
 * Type definition for YOLO metadata
 */
export interface YOLOMetadata {
  /** Model input image size [width, height] */
  imgsz: [number, number];
  /** Array of class names */
  names: Record<number, string>;
  /** Total number of classes */
  nc: number;
}

/**
 * Options for 3D estimation
 */
export interface ThreeDEstimationOptions {
  /** Real size of object (in meters) */
  objectSize: {
    width: number;
    height: number;
  };
  /** Camera field of view in degrees (default: 50) */
  cameraFov?: number;
  /** Coefficient multipliers for orientation estimation (default: 1.0 for both) */
  orientationCoefficients?: {
    pitch?: number; // Multiplier for pitch estimation (default: 1.0)
    roll?: number; // Multiplier for roll estimation (default: 1.0)
  };
}
