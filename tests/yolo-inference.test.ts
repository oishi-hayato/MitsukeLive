import * as tf from "@tensorflow/tfjs";
import { YOLOInference } from "../src/lib/yolo-inference";

describe("YOLOInference", () => {
  let yoloEngine: YOLOInference;
  let mockModel: jest.Mocked<tf.GraphModel>;

  beforeEach(() => {
    yoloEngine = new YOLOInference({
      modelPath: "/test/model.json",
      metadataPath: "/test/metadata.yaml",
      scoreThreshold: 0.5,
    });

    mockModel = {
      predict: jest.fn(),
      dispose: jest.fn(),
    } as any;

    (tf.loadGraphModel as jest.Mock).mockResolvedValue(mockModel);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("initialization", () => {
    it("should initialize with default options", async () => {
      (tf.setBackend as jest.Mock).mockResolvedValue(undefined);
      (tf.ready as jest.Mock).mockResolvedValue(undefined);

      await yoloEngine.initialize();

      // YOLOInference doesn't call tf.ready directly
      expect(tf.loadGraphModel).toHaveBeenCalledWith("/test/model.json");
    });

    it("should throw error when model loading fails", async () => {
      (tf.setBackend as jest.Mock).mockResolvedValue(undefined);
      (tf.ready as jest.Mock).mockResolvedValue(undefined);
      (tf.loadGraphModel as jest.Mock).mockRejectedValue(
        new Error("Network error")
      );

      await expect(yoloEngine.initialize()).rejects.toThrow(
        "モデルの読み込みに失敗しました"
      );
    });
  });

  describe("predict", () => {
    beforeEach(async () => {
      (tf.setBackend as jest.Mock).mockResolvedValue(undefined);
      (tf.ready as jest.Mock).mockResolvedValue(undefined);
      await yoloEngine.initialize();
    });

    it("should throw error when model is not initialized", async () => {
      const uninitializedEngine = new YOLOInference({
        modelPath: "/test/model.json",
        metadataPath: "/test/metadata.yaml",
      });

      const mockTensor = {} as tf.Tensor4D;

      await expect(uninitializedEngine.predict(mockTensor)).rejects.toThrow(
        "モデルが初期化されていません"
      );
    });

    it("should process predictions correctly", async () => {
      const mockInputTensor = {} as tf.Tensor4D;
      const mockResultTensor = {
        squeeze: jest.fn(),
        dispose: jest.fn(),
      } as any;

      const mockSqueezedTensor = {
        shape: [6, 10], // 6 values, 10 detections
        arraySync: jest.fn().mockReturnValue([
          [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000], // x coordinates
          [150, 250, 350, 450, 550, 650, 750, 850, 950, 1050], // y coordinates
          [50, 60, 70, 80, 90, 100, 110, 120, 130, 140], // width
          [30, 40, 50, 60, 70, 80, 90, 100, 110, 120], // height
          [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0.0], // scores
          [1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0], // angles
        ]),
        dispose: jest.fn(),
      } as any;

      mockModel.predict.mockReturnValue(mockResultTensor);
      mockResultTensor.squeeze.mockReturnValue(mockSqueezedTensor);

      const result = await yoloEngine.predict(mockInputTensor);

      // スコア閾値0.5以上の検出が4つ返される（0.9, 0.8, 0.7, 0.6）
      expect(result).toHaveLength(4);
      expect(result[0]).toMatchObject({
        boundingBox: [100, 150, 50, 30],
        angle: 1.5,
        score: 0.9,
      });
      expect(mockResultTensor.dispose).toHaveBeenCalled();
      expect(mockSqueezedTensor.dispose).toHaveBeenCalled();
    });
  });

  describe("dispose", () => {
    it("should dispose model correctly", () => {
      yoloEngine["model"] = mockModel;

      yoloEngine.dispose();

      expect(mockModel.dispose).toHaveBeenCalled();
      expect(yoloEngine["model"]).toBeNull();
    });
  });
});
