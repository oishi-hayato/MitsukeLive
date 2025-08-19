/**
 * Interface representing basic object detection results
 */
export interface Detection {
  /** Bounding box [x, y, width, height] */
  boundingBox: [number, number, number, number];
  /** Rotation angle (degrees) - default value is 0 degrees */
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
  /** Tilt angle around Z-axis (pitch: up-down tilt, roll: left-right tilt) in degrees */
  orientation: {
    pitch: number; // Up-down tilt (-90 to 90 degrees)
    roll: number; // Left-right tilt (-180 to 180 degrees)
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
    /** Enable continuous detection mode (don't pause after detection) */
    continuousDetection?: boolean;
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

  /** Callback function called during object detection (null if no detection, ARDetection when 3D estimation is enabled) */
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
}
