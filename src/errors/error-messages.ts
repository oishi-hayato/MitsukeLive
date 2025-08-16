/**
 * Centralized error message management
 * All error messages used in MLInternalError constructors
 */

export const ERROR_MESSAGES = {
  // 3D Estimator errors
  REAL_WORLD_SIZE_INVALID: "Real world size is invalid",
  BOUNDING_BOX_SIZE_INVALID: "Bounding box size is invalid",
  FOCAL_LENGTH_INVALID: "Focal length is invalid",

  // YOLO Helper errors
  INVALID_RADIAN_VALUE: "Invalid radian value",
  INVALID_IMAGE_DIMENSIONS: "Invalid image dimensions specified",
  RESIZED_IMAGE_EXCEEDS_TARGET: "Resized image exceeds target size",
  INPUT_MUST_BE_3D_TENSOR: "Input image must be a 3D tensor",
  INVALID_TARGET_IMAGE_SIZE: "Invalid target image size",
  INVALID_COORDINATE_VALUES: "Invalid coordinate values detected",
  INVALID_SCALE_VALUE: "Invalid scale value",
  INVALID_PADDING_VALUES: "Invalid padding values detected",
  NEGATIVE_WIDTH_OR_HEIGHT: "Negative width or height specified",
  INVALID_CROPPED_REGION_SIZE: "Invalid cropped region size values detected",
  CROPPED_REGION_MUST_BE_POSITIVE:
    "Cropped region size must be positive values",
  INVALID_CANVAS_SIZE: "Invalid canvas size",
  INVALID_LETTERBOX_INFO: "Invalid letterbox information",

  // Detection Controller errors
  CAMERA_MANAGER_NOT_INITIALIZED: "Camera manager is not initialized",
  CANVAS_MANAGER_NOT_INITIALIZED: "Canvas manager is not initialized",
  MODEL_NOT_INITIALIZED: "Model is not initialized",
  METADATA_NOT_INITIALIZED: "Metadata is not initialized",
  LETTERBOX_TRANSFORM_NOT_GENERATED:
    "Letterbox transformation information was not generated",

  // YOLO Inference errors
  FAILED_TO_LOAD_METADATA: "Failed to load metadata",
  FAILED_TO_LOAD_MODEL: "Failed to load model",

  // Canvas Manager errors
  CANVAS_ELEMENT_NOT_FOUND: "Canvas element not found",
  NOT_A_CANVAS_ELEMENT: "Specified element is not a canvas element",
  FAILED_TO_GET_2D_CONTEXT: "Failed to get 2D context",

  // Camera Manager errors
  VIDEO_ELEMENT_NOT_FOUND: "Video element not found",
  NOT_A_VIDEO_ELEMENT: "Specified element is not a video element",
} as const;

export const CONSOLE_MESSAGES = {
  FATAL_ERROR: "[DetectionController] Fatal error occurred:",
  NON_FATAL_ERROR:
    "[DetectionController] Non-fatal error occurred. Processing continues:",
  UNEXPECTED_ERROR:
    "[DetectionController] Unexpected error occurred. Processing continues:",
} as const;
