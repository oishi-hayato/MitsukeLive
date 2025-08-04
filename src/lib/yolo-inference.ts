import * as tf from "@tensorflow/tfjs";
import { load } from "js-yaml";
import { MLInternalError } from "../errors";
import type {
  Detection,
  YOLOInferenceOptions,
  LetterboxInfo,
  YOLOMetadata,
} from "../types";
import { transformToCanvas, findValidDetections } from "../helpers/yolo-helper";
import {
  addDepthToDetections,
  type DepthEstimationOptions,
} from "../helpers/depth-estimator";

/**
 * YOLO推論インスタンス
 * TensorFlow.jsを使ったリアルタイム物体検出
 */
export class YOLOInference {
  private model: tf.GraphModel | null = null; // 読み込み済みのYOLOモデル
  private metadata: YOLOMetadata | null = null; // モデルのメタデータ情報
  private scoreThreshold: number; // 検出の最低信頼度スコア
  private memoryThreshold: number; // メモリクリーンアップの閾値
  private enableDepthEstimation: boolean; // Z軸推定の有効化フラグ
  private focalLength: number; // カメラの焦点距離
  private enableOrientationEstimation: boolean; // Z軸傾き推定の有効化フラグ

  /**
   * YOLO推論の設定
   */
  constructor(private options: YOLOInferenceOptions) {
    this.scoreThreshold = options.scoreThreshold || 0.7;
    this.memoryThreshold = options.memoryThreshold || 50;
    this.enableDepthEstimation = options.enableDepthEstimation || false;
    this.focalLength = options.focalLength || 500;
    this.enableOrientationEstimation =
      options.enableOrientationEstimation || false;
  }

  /**
   * 推論エンジンの初期化（メタデータ → モデル読み込み）
   */
  public async initialize(): Promise<void> {
    await this.loadMetadata();
    await this.loadModel();
  }

  /**
   * 物体検出の実行
   */
  public async predict(
    imageTensor: tf.Tensor4D,
    letterboxInfo?: LetterboxInfo,
    canvasElement?: HTMLCanvasElement
  ): Promise<Detection[]> {
    if (!this.model) {
      throw new MLInternalError(
        "モデルが初期化されていません",
        "MODEL_NOT_INITIALIZED"
      );
    }

    const results = this.model.predict(imageTensor) as tf.Tensor;
    try {
      let predictions = this.processRawPredictions(results);

      // 座標変換
      if (letterboxInfo && canvasElement) {
        predictions = transformToCanvas(
          predictions,
          letterboxInfo,
          canvasElement
        );
      }

      // Z軸推定の追加
      if (
        (this.enableDepthEstimation || this.enableOrientationEstimation) &&
        canvasElement
      ) {
        const depthOptions: DepthEstimationOptions = {
          focalLength: this.focalLength,
          imageWidth: canvasElement.width,
          imageHeight: canvasElement.height,
          enableOrientationEstimation: this.enableOrientationEstimation,
        };
        predictions = addDepthToDetections(predictions, depthOptions);
      }

      this.logMemoryUsage();
      return predictions;
    } finally {
      results.dispose();
    }
  }

  /**
   * メタデータの取得
   */
  public get metadataInstance(): YOLOMetadata {
    return this.metadata!;
  }

  /**
   * モデルインスタンスの取得
   */
  public get modelInstance(): tf.GraphModel {
    return this.model!;
  }

  /**
   * リソースの解放
   */
  public dispose(): void {
    if (this.model) {
      this.model.dispose();
      this.model = null;
    }
  }

  /**
   * メタデータファイルの読み込み
   */
  private async loadMetadata(): Promise<void> {
    try {
      const response = await fetch(this.options.metadataPath);
      const text = await response.text();
      this.metadata = load(text) as YOLOMetadata;
    } catch (error: unknown) {
      throw new MLInternalError(
        "メタデータの読み込みに失敗しました",
        "METADATA_LOAD_ERROR"
      );
    }
  }

  /**
   * YOLOモデルの読み込み
   */
  private async loadModel(): Promise<void> {
    try {
      this.model = await tf.loadGraphModel(this.options.modelPath);
    } catch (error: unknown) {
      throw new MLInternalError(
        "モデルの読み込みに失敗しました",
        "MODEL_LOAD_ERROR"
      );
    }
  }

  /**
   * 予測結果の後処理
   */
  private processRawPredictions(results: tf.Tensor): Detection[] {
    const squeezed = results.squeeze();

    try {
      const numDetections = squeezed.shape[1] || 0;
      if (numDetections === 0) return [];

      const data = squeezed.arraySync() as number[][];
      const detectionList = findValidDetections(
        data,
        numDetections,
        this.scoreThreshold
      );

      return detectionList;
    } finally {
      squeezed.dispose();
    }
  }

  /**
   * メモリ使用量の監視とクリーンアップ
   */
  public logMemoryUsage(): void {
    const memoryInfo = tf.memory();
    console.info(
      `[YOLOEngine] Memory: ${memoryInfo.numTensors} tensors, ${(
        memoryInfo.numBytes /
        1024 /
        1024
      ).toFixed(2)}MB`
    );

    if (memoryInfo.numTensors > this.memoryThreshold) {
      console.warn(
        `[YOLOEngine] High tensor count detected: ${memoryInfo.numTensors} (threshold: ${this.memoryThreshold})`
      );
      this.cleanupMemory();
    }
  }

  /**
   * メモリクリーンアップの実行
   */
  private cleanupMemory(): void {
    tf.disposeVariables();
    const memoryInfo = tf.memory();
    console.info(
      `[YOLOEngine] Memory cleanup completed: ${
        memoryInfo.numTensors
      } tensors, ${(memoryInfo.numBytes / 1024 / 1024).toFixed(2)}MB`
    );
  }
}
