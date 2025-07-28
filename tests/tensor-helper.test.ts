import * as tf from "@tensorflow/tfjs";
import { cropNormalizedVideoTensor } from "../src/helpers/tensor-helper";

describe("TensorHelper", () => {
  let mockVideoElement: HTMLVideoElement;
  let mockFullTensor: jest.Mocked<tf.Tensor3D>;
  let mockCroppedTensor: jest.Mocked<tf.Tensor3D>;

  beforeEach(() => {
    // Create mock video element
    mockVideoElement = {
      videoWidth: 640,
      videoHeight: 480,
    } as HTMLVideoElement;

    // Create mock cropped tensor
    mockCroppedTensor = {
      dispose: jest.fn(),
    } as any;

    // Create mock full tensor with required methods
    mockFullTensor = {
      toFloat: jest.fn().mockReturnThis(),
      div: jest.fn().mockReturnThis(),
      slice: jest.fn().mockReturnValue(mockCroppedTensor),
    } as any;

    // Mock tf.browser.fromPixels to return our mock tensor
    (tf.browser.fromPixels as jest.Mock).mockReturnValue(mockFullTensor);
    (tf.scalar as jest.Mock).mockReturnValue({ scalar: 255.0 });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("cropNormalizedVideoTensor", () => {
    it("should create cropped normalized tensor from video element", () => {
      const cropX = 10;
      const cropY = 20;
      const width = 200;
      const height = 150;

      const result = cropNormalizedVideoTensor(
        mockVideoElement,
        cropX,
        cropY,
        width,
        height
      );

      // Full image tensor should be created first
      expect(tf.browser.fromPixels).toHaveBeenCalledWith(mockVideoElement);
      expect(mockFullTensor.toFloat).toHaveBeenCalled();
      expect(mockFullTensor.div).toHaveBeenCalled();
      expect(tf.scalar).toHaveBeenCalledWith(255.0);

      // Then sliced to crop region
      expect(mockFullTensor.slice).toHaveBeenCalledWith(
        [Math.floor(cropY), Math.floor(cropX), 0],
        [Math.floor(height), Math.floor(width), 3]
      );

      expect(result).toBe(mockCroppedTensor);
    });

    it("should handle fractional crop coordinates", () => {
      const cropX = 10.7;
      const cropY = 20.3;
      const width = 200.9;
      const height = 150.1;

      cropNormalizedVideoTensor(
        mockVideoElement,
        cropX,
        cropY,
        width,
        height
      );

      // Should floor the coordinates
      expect(mockFullTensor.slice).toHaveBeenCalledWith(
        [20, 10, 0], // Math.floor applied
        [150, 200, 3] // Math.floor applied
      );
    });

    it("should handle different video dimensions", () => {
      const largeVideoElement = {
        videoWidth: 1920,
        videoHeight: 1080,
      } as HTMLVideoElement;

      cropNormalizedVideoTensor(largeVideoElement, 0, 0, 100, 100);

      expect(tf.browser.fromPixels).toHaveBeenCalledWith(largeVideoElement);
    });
  });
});
