import * as tf from "@tensorflow/tfjs";
import { CameraManager } from "./camera-manager";
import { CanvasManager } from "./canvas-manager";
import { YOLOInference } from "./yolo-inference";
import { MLInternalError } from "../errors";
import { cropNormalizedVideoTensor } from "../helpers/tensor-helper";
import { letterboxTransform } from "../helpers/yolo-helper";
import type {
  ObjectDetectorOptions,
  Detection,
  LetterboxInfo,
  YOLOMetadata,
} from "../types";

// 型定義
type TensorFlowBackend = "webgl" | "webgpu" | "wasm" | "cpu";

// 定数定義
const DEFAULT_INFERENCE_INTERVAL_MS = 500;
const DEFAULT_BACKEND: TensorFlowBackend = "webgl";
const RESUME_DELAY_MS = 1000;
const BYTES_TO_MB = 1024 * 1024;

/**
 * 物体検出コントローラー
 * カメラ、キャンバス、YOLO推論を統合管理し、リアルタイム検出ループを実行
 * エラー発生時も検出処理を継続するためのfatal/非fatalエラーハンドリングを実装
 */
// 検出状態の定義
enum DetectionState {
  IDLE = "idle", // アイドル状態（検出可能）
  PROCESSING = "processing", // 検出処理実行中
  PAUSED = "paused", // 一時停止中
}

export class DetectionController {
  private detectionIntervalMs: number; // 検出実行間隔（ミリ秒）
  private yoloInference: YOLOInference; // YOLO推論インスタンス
  private detectionState = DetectionState.IDLE; // 現在の検出状態
  private lastDetectionTimestamp = 0; // 最後の検出実行時刻
  private cameraManager: CameraManager | null = null; // カメラ管理インスタンス
  private canvasManager: CanvasManager | null = null; // キャンバス管理インスタンス
  private backend: TensorFlowBackend; // TensorFlow.jsバックエンド
  private animationFrameId: number | null = null; // アニメーションフレームID

  // パフォーマンス最適化用キャッシュ
  private cachedCropRegion?: ReturnType<typeof this.calculateCropRegion>; // クロップ領域キャッシュ
  private lastVideoDimensions?: { width: number; height: number }; // 前回のビデオサイズ
  private lastCanvasDimensions?: { width: number; height: number }; // 前回のキャンバスサイズ

  private onDetection: (detection: Detection) => void; // 検出結果コールバック
  private onCameraReady: () => void; // カメラ準備完了コールバック
  private onCameraNotAllowed: () => void; // カメラアクセス拒否コールバック

  /**
   * コントローラーの初期設定
   * @param options 物体検出の設定オプション（モデル、メタデータパス、推論間隔等）
   */
  constructor(options: ObjectDetectorOptions) {
    this.detectionIntervalMs =
      options.inferenceInterval || DEFAULT_INFERENCE_INTERVAL_MS;
    this.backend = options.backend || DEFAULT_BACKEND;

    // YOLO設定
    this.yoloInference = new YOLOInference({
      modelPath: options.modelPath,
      metadataPath: options.metadataPath,
      scoreThreshold: options.scoreThreshold,
      memoryThreshold: options.memoryThreshold,
      enableDepthEstimation: options.enableDepthEstimation,
      focalLength: options.focalLength,
      enableOrientationEstimation: options.enableOrientationEstimation,
    });

    this.onDetection = options.onDetection || (() => {});
    this.onCameraReady = options.onCameraReady || (() => {});
    this.onCameraNotAllowed = options.onCameraNotAllowed || (() => {});
  }

  /**
   * コントローラーの初期化とリアルタイム検出開始
   * @param videoElementId カメラ映像を表示するvideo要素のID
   * @param canvasElementId 検出結果を描画するcanvas要素のID
   */
  public async initialize(
    videoElementId: string,
    canvasElementId: string
  ): Promise<void> {
    // TensorFlow.jsバックエンド設定
    await this.setupBackend();

    await this.yoloInference.initialize();

    try {
      await this.setupCamera(videoElementId);
    } catch (error: unknown) {
      // カメラアクセス拒否
      if (error instanceof Error && error.name === "NotAllowedError") {
        this.onCameraNotAllowed();
        return;
      }
      throw error;
    }

    this.setupCanvas(canvasElementId);
    this.startDetectionLoop();
  }

  private async setupCamera(videoElementId: string): Promise<void> {
    this.cameraManager = await CameraManager.setup(
      videoElementId,
      this.onCameraReady
    );
  }

  private setupCanvas(canvasElementId: string): void {
    this.canvasManager = CanvasManager.setup(canvasElementId);
  }

  /**
   * 物体検出処理の実行
   * クロップ、推論、結果処理を一連で実行し、検出結果を返す
   * @returns 検出結果の配列（キャンバス座標系）
   */
  private async detectObjects(): Promise<Detection[]> {
    // アスペクト比に基づくクロップ領域を計算（キャッシュ利用）
    const { cropX, cropY, croppedWidth, croppedHeight } =
      this.getCachedCropRegion();

    // テンソル作成とYOLO推論を実行
    const { detectionResults } = await this.preprocessVideoFrameAndPredict(
      cropX,
      cropY,
      croppedWidth,
      croppedHeight
    );

    // 検出結果の処理
    this.handleDetectionResults(detectionResults);

    // キャンバスをクリアして次の描画に備える
    const canvas = this.canvas;
    const context = this.canvasContext;
    context.clearRect(0, 0, canvas.width, canvas.height);

    return detectionResults;
  }

  /**
   * リアルタイム検出ループの開始
   * requestAnimationFrameを使用して継続的に物体検出を実行
   * エラー発生時もfatal/非fatalに応じて適切にハンドリング
   */
  private startDetectionLoop(): void {
    const detectionLoop = async () => {
      const currentTime = Date.now();

      // 実行条件チェック（アイドル状態かつ間隔条件を満たす）
      if (this.shouldExecuteDetection(currentTime)) {
        this.detectionState = DetectionState.PROCESSING;
        this.lastDetectionTimestamp = currentTime;

        try {
          await this.detectObjects();
        } catch (error) {
          this.handleDetectionError(error);
        } finally {
          if (this.detectionState === DetectionState.PROCESSING) {
            this.detectionState = DetectionState.IDLE;
          }
        }
      }

      // 次フレームで再実行
      this.animationFrameId = requestAnimationFrame(detectionLoop);
    };

    detectionLoop();
  }

  /**
   * 検出エラーのハンドリング
   * @param error 発生したエラー
   */
  private handleDetectionError(error: unknown): void {
    if (error instanceof MLInternalError) {
      this.handleMLError(error);
    } else {
      this.handleUnexpectedError(error);
    }
  }

  /**
   * ML関連エラーのハンドリング
   * @param error MLInternalErrorインスタンス
   */
  private handleMLError(error: MLInternalError): void {
    if (error.fatal) {
      this.handleFatalError(error);
    } else {
      this.handleNonFatalError(error);
    }
  }

  /**
   * 致命的エラーのハンドリング
   * @param error 致命的エラー
   */
  private handleFatalError(error: MLInternalError): void {
    console.error("[DetectionController] 致命的エラーが発生しました:", error);
    this.pause();
    throw error;
  }

  /**
   * 非致命的エラーのハンドリング
   * @param error 非致命的エラー
   */
  private handleNonFatalError(error: MLInternalError): void {
    console.warn(
      "[DetectionController] 非致命的エラーが発生しました。処理を継続します:",
      error
    );
  }

  /**
   * 予期しないエラーのハンドリング
   * @param error 予期しないエラー
   */
  private handleUnexpectedError(error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(
      "[DetectionController] 予期しないエラーが発生しました。処理を継続します:",
      errorMessage,
      error
    );
  }

  /**
   * 検出結果のハンドリング
   * @param detectionResults 検出結果配列
   */
  private handleDetectionResults(detectionResults: Detection[]): void {
    if (detectionResults.length > 0) {
      // 最高スコアの検出結果を通知
      this.onDetection(detectionResults[0]);
      // 検出後は一時停止してユーザーの確認を待つ
      this.pause();
    }
  }

  /**
   * 検出実行可否の判定
   * @param currentTime 現在時刻（ミリ秒）
   * @returns 実行可能かどうか
   */
  private shouldExecuteDetection(currentTime: number): boolean {
    return (
      this.detectionState === DetectionState.IDLE &&
      currentTime - this.lastDetectionTimestamp >= this.detectionIntervalMs
    );
  }

  /**
   * 検出処理の一時停止
   * 検出ループは継続するが、実際の推論処理をスキップ
   */
  public pause(): void {
    this.detectionState = DetectionState.PAUSED;
    this.video.pause();
  }

  /**
   * 検出処理の再開
   * 1秒の遅延後に検出処理を再開
   */
  public async resume(): Promise<void> {
    const resetToIdleState = () => {
      this.lastDetectionTimestamp = 0;
      this.detectionState = DetectionState.IDLE;
    };

    if (this.video.paused) {
      try {
        await this.video.play();
      } finally {
        setTimeout(resetToIdleState, RESUME_DELAY_MS);
      }
    } else {
      setTimeout(resetToIdleState, RESUME_DELAY_MS);
    }
  }

  /**
   * ビデオ要素の取得
   * @throws {MLInternalError} カメラマネージャーが初期化されていない場合
   */
  public get video(): HTMLVideoElement {
    if (!this.cameraManager) {
      throw new MLInternalError(
        "カメラマネージャーが初期化されていません",
        "CAMERA_NOT_INITIALIZED"
      );
    }
    return this.cameraManager.video;
  }

  /**
   * キャンバス要素の取得
   * @throws {MLInternalError} キャンバスマネージャーが初期化されていない場合
   */
  public get canvas(): HTMLCanvasElement {
    if (!this.canvasManager) {
      throw new MLInternalError(
        "キャンバスマネージャーが初期化されていません",
        "CANVAS_NOT_INITIALIZED"
      );
    }
    return this.canvasManager.element;
  }

  /**
   * 2Dコンテキストの取得
   * @throws {MLInternalError} キャンバスマネージャーが初期化されていない場合
   */
  public get canvasContext(): CanvasRenderingContext2D {
    if (!this.canvasManager) {
      throw new MLInternalError(
        "キャンバスマネージャーが初期化されていません",
        "CANVAS_NOT_INITIALIZED"
      );
    }
    return this.canvasManager.ctx;
  }

  /**
   * モデルインスタンスの取得
   * @throws {MLInternalError} モデルが初期化されていない場合
   */
  public get modelInstance(): tf.GraphModel {
    const model = this.yoloInference.modelInstance;
    if (!model) {
      throw new MLInternalError(
        "モデルが初期化されていません",
        "MODEL_NOT_INITIALIZED"
      );
    }
    return model;
  }

  /**
   * メタデータの取得
   * @throws {MLInternalError} メタデータが初期化されていない場合
   */
  public get metadataInstance(): YOLOMetadata {
    const metadata = this.yoloInference.metadataInstance;
    if (!metadata) {
      throw new MLInternalError(
        "メタデータが初期化されていません",
        "METADATA_NOT_INITIALIZED"
      );
    }
    return metadata;
  }

  /**
   * ビデオフレームからテンソルを作成し、YOLO推論を実行してキャンバス座標系の検出結果を返す
   * メモリ管理を適切に行い、中間テンソルは確実に破棄する
   *
   * @param cropX クロップ開始X座標（ピクセル単位）
   * @param cropY クロップ開始Y座標（ピクセル単位）
   * @param croppedWidth クロップ幅（ピクセル単位）
   * @param croppedHeight クロップ高さ（ピクセル単位）
   * @returns キャンバス座標系の検出結果とレターボックス情報
   */
  private async preprocessVideoFrameAndPredict(
    cropX: number,
    cropY: number,
    croppedWidth: number,
    croppedHeight: number
  ): Promise<{
    detectionResults: Detection[];
    letterboxInfo: LetterboxInfo;
  }> {
    let preprocessedInputTensor: tf.Tensor4D | null = null;
    let letterboxTransformInfo: LetterboxInfo | undefined;

    try {
      // tf.tidyで中間テンソルのメモリを自動管理
      preprocessedInputTensor = tf.tidy(() => {
        // ビデオフレームを正規化して指定領域をクロップ
        const normalizedCroppedTensor = cropNormalizedVideoTensor(
          this.video,
          cropX,
          cropY,
          croppedWidth,
          croppedHeight
        );

        // YOLOモデルの入力サイズに合わせてレターボックス変換
        const {
          output: paddedTensor,
          letterboxInfo: letterboxTransformResult,
        } = letterboxTransform(
          normalizedCroppedTensor,
          this.metadataInstance.imgsz
        );

        // 座標変換に必要なクロップ情報を追加
        letterboxTransformInfo = {
          ...letterboxTransformResult,
          croppedWidth,
          croppedHeight,
        };

        // バッチ次元を追加してモデル入力形式に変換
        return paddedTensor.expandDims(0) as tf.Tensor4D;
      });

      // letterboxTransformInfo の確認
      if (!letterboxTransformInfo) {
        throw new MLInternalError(
          "レターボックス変換情報が生成されませんでした",
          "LETTERBOX_INFO_MISSING"
        );
      }

      // YOLO推論とキャンバス座標系への変換
      const detectionResults = await this.yoloInference.predict(
        preprocessedInputTensor,
        letterboxTransformInfo,
        this.canvas
      );

      return { detectionResults, letterboxInfo: letterboxTransformInfo };
    } finally {
      if (preprocessedInputTensor) {
        preprocessedInputTensor.dispose();
      }
    }
  }

  /**
   * キャッシュを利用したクロップ領域の取得
   * ビデオとキャンバスサイズに変更がない場合はキャッシュされた値を返す
   * @returns クロップ領域の座標と寸法
   */
  private getCachedCropRegion(): {
    cropX: number;
    cropY: number;
    croppedWidth: number;
    croppedHeight: number;
  } {
    const video = this.video;
    const canvas = this.canvas;
    const currentVideoDimensions = {
      width: video.videoWidth,
      height: video.videoHeight,
    };
    const currentCanvasDimensions = {
      width: canvas.width,
      height: canvas.height,
    };

    // キャッシュが有効かチェック（ビデオとキャンバス両方のサイズ）
    if (
      this.cachedCropRegion &&
      this.lastVideoDimensions &&
      this.lastCanvasDimensions &&
      this.lastVideoDimensions.width === currentVideoDimensions.width &&
      this.lastVideoDimensions.height === currentVideoDimensions.height &&
      this.lastCanvasDimensions.width === currentCanvasDimensions.width &&
      this.lastCanvasDimensions.height === currentCanvasDimensions.height
    ) {
      return this.cachedCropRegion;
    }

    // 新しく計算してキャッシュ
    this.cachedCropRegion = this.calculateCropRegion();
    this.lastVideoDimensions = currentVideoDimensions;
    this.lastCanvasDimensions = currentCanvasDimensions;
    return this.cachedCropRegion;
  }

  /**
   * ビデオとキャンバスのアスペクト比に基づくクロップ領域の計算
   * アスペクト比の違いを調整して適切な領域を抽出
   * @returns クロップ領域の座標と寸法
   */
  private calculateCropRegion(): {
    cropX: number;
    cropY: number;
    croppedWidth: number;
    croppedHeight: number;
  } {
    const video = this.video;
    const canvas = this.canvas;

    const videoAspectRatio = video.videoWidth / video.videoHeight;
    const canvasAspectRatio = canvas.width / canvas.height;

    // デフォルト（全体使用）
    let cropX = 0;
    let cropY = 0;
    let croppedWidth = video.videoWidth;
    let croppedHeight = video.videoHeight;

    // 横長映像の場合
    if (videoAspectRatio > canvasAspectRatio) {
      croppedWidth = video.videoHeight * canvasAspectRatio;
      cropX = (video.videoWidth - croppedWidth) / 2;
      // 縦長映像の場合
    } else if (videoAspectRatio < canvasAspectRatio) {
      croppedHeight = video.videoWidth / canvasAspectRatio;
      cropY = (video.videoHeight - croppedHeight) / 2;
    }

    return { cropX, cropY, croppedWidth, croppedHeight };
  }

  /**
   * 全リソースの解放とメモリクリーンアップ
   * カメラ、キャンバス、推論インスタンスを適切に破棄
   */
  public dispose(): void {
    this.detectionState = DetectionState.PAUSED;

    // アニメーションフレームのキャンセル
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    // カメラ破棄
    if (this.cameraManager) {
      this.cameraManager.dispose();
      this.cameraManager = null;
    }

    // キャンバス破棄
    if (this.canvasManager) {
      this.canvasManager.dispose();
      this.canvasManager = null;
    }

    // キャッシュクリア
    this.cachedCropRegion = undefined;
    this.lastVideoDimensions = undefined;
    this.lastCanvasDimensions = undefined;

    // 推論インスタンス破棄
    this.yoloInference.dispose();

    // 最終メモリ状態
    const memoryStats = tf.memory();
    console.info(
      `Disposed - Final memory state: ${memoryStats.numTensors} tensors, ${(
        memoryStats.numBytes / BYTES_TO_MB
      ).toFixed(2)}MB`
    );
  }

  /**
   * TensorFlow.jsバックエンドの設定と初期化
   * 指定されたバックエンド（webgl/webgpu/cpu等）を設定
   */
  private async setupBackend(): Promise<void> {
    await tf.setBackend(this.backend);
    await tf.ready();
  }
}
