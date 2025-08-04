/**
 * 物体検出結果を表すインターフェース
 */
export interface Detection {
  /** バウンディングボックス [x, y, width, height] */
  boundingBox: [number, number, number, number];
  /** 回転角度（度）- デフォルト値は0度 */
  angle: number;
  /** 信頼度スコア（0.0-1.0） */
  score: number;
  /** 推定Z軸座標（メートル単位、0に近いほど手前） */
  depth?: number;
  /** Z軸回りの傾き角度（pitch: 上下傾き、roll: 左右傾き）度単位 */
  orientation?: {
    pitch: number; // 上下傾き（-90～90度）
    roll: number; // 左右傾き（-180～180度）
  };
}

/**
 * 物体検出器の設定オプション
 */
export interface ObjectDetectorOptions {
  /** TensorFlow.jsモデルファイルへのパス（必須） */
  modelPath: string;
  /** YOLOメタデータファイルへのパス（必須） */
  metadataPath: string;
  /** 推論実行の間隔（ミリ秒）。デフォルト: 500ms */
  inferenceInterval?: number;
  /** 検出の最低信頼度スコア。デフォルト: 0.7 */
  scoreThreshold?: number;
  /** メモリクリーンアップを実行するテンソル数の闾値。デフォルト: 50 */
  memoryThreshold?: number;
  /** TensorFlow.jsバックエンド。デフォルト: 'webgl' */
  backend?: "webgl" | "webgpu" | "wasm" | "cpu";
  /** Z軸推定を有効にする。デフォルト: false */
  enableDepthEstimation?: boolean;
  /** カメラの焦点距離（ピクセル単位）。デフォルト: 500 */
  focalLength?: number;
  /** Z軸傾き推定を有効にする。デフォルト: false */
  enableOrientationEstimation?: boolean;
  /** 物体検出時に呼び出されるコールバック関数 */
  onDetection?: (detection: Detection) => void;
  /** カメラの初期化完了時に呼び出されるコールバック関数 */
  onCameraReady?: () => void;
  /** カメラアクセスが許可されていない時に呼び出されるコールバック関数 */
  onCameraNotAllowed?: () => void;
}

/**
 * YOLO推論インスタンスの内部設定オプション
 * @internal
 */
export interface YOLOInferenceOptions {
  /** TensorFlow.jsモデルファイルへのパス */
  modelPath: string;
  /** YOLOメタデータファイルへのパス */
  metadataPath: string;
  /** 検出の最低信頼度スコア。デフォルト: 0.7 */
  scoreThreshold?: number;
  /** メモリクリーンアップを実行するテンソル数の闾値。デフォルト: 50 */
  memoryThreshold?: number;
  /** Z軸推定を有効にする。デフォルト: false */
  enableDepthEstimation?: boolean;
  /** カメラの焦点距離（ピクセル単位）。デフォルト: 500 */
  focalLength?: number;
  /** Z軸傾き推定を有効にする。デフォルト: false */
  enableOrientationEstimation?: boolean;
}

/**
 * レターボックス変換の情報を格納するインターフェース
 * 画像をモデルの入力サイズに合わせるための変換パラメータを保持します
 *
 * @interface LetterboxInfo
 * @description アスペクト比を維持したままリサイズし、パディングで調整する際の変換情報
 */
export interface LetterboxInfo {
  /** スケール率 */
  scale: number;
  /** 上余白 */
  top: number;
  /** 左余白 */
  left: number;
  /** パディング適用前の幅 */
  scaledWidth: number;
  /** パディング適用前の高さ */
  scaledHeight: number;
  /** クロップ幅 */
  croppedWidth?: number;
  /** クロップ高さ */
  croppedHeight?: number;
}

/**
 * YOLOメタデータの型定義
 */
export interface YOLOMetadata {
  /** モデルの入力画像サイズ [width, height] */
  imgsz: [number, number];
  /** クラス名の配列 */
  names: Record<number, string>;
  /** クラスの総数 */
  nc: number;
}
