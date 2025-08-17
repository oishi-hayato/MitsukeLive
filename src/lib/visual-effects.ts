import type { Detection, ARDetection } from "../types";

/**
 * 視覚エフェクトの設定オプション
 */
export interface VisualEffectOptions {
  /** 点滅の間隔（ミリ秒）。デフォルト: 500ms */
  interval?: number;
  /** 点滅の持続時間（ミリ秒）。デフォルト: 2000ms（countが指定されている場合は無視される） */
  duration?: number;
  /** 点滅回数。指定された場合、durationは無視される */
  count?: number;
  /** 枠線の色。デフォルト: '#ff0000' */
  color?: string;
  /** 枠線の太さ。デフォルト: 3 */
  lineWidth?: number;
}

/**
 * キャンバス上に検出枠の点滅エフェクトを描画します
 *
 * @param canvas - 描画対象のキャンバス要素
 * @param detection - 検出結果
 * @param options - 点滅設定オプション
 * @returns 点滅完了時に解決されるPromise
 */
export function startFlashEffect(
  canvas: HTMLCanvasElement,
  detection: Detection | ARDetection,
  options: VisualEffectOptions = {}
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
    let flashInterval: number;
    let stopTimeout: number;
    let flashCount = 0;

    // 枠を描画する関数
    const drawBox = () => {
      // キャンバスをクリア
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (!isVisible) return;

      const [x, y, w, h] = detection.boundingBox;
      const angle = detection.angle * (Math.PI / 180);

      // コンテキストの状態を保存
      ctx.save();

      // 変換をリセットして新しい変換を適用
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.translate(x, y);
      ctx.rotate(angle);

      // バウンディングボックスを描画
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.strokeRect(-w / 2, -h / 2, w, h);

      // コンテキストの状態を復元
      ctx.restore();
    };

    // 停止処理
    const stop = () => {
      clearInterval(flashInterval);
      clearTimeout(stopTimeout);
      // 最終的にキャンバスをクリア
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      resolve();
    };

    // 点滅アニメーション
    flashInterval = window.setInterval(() => {
      drawBox(); // 現在のisVisibleの状態で描画
      isVisible = !isVisible; // 次の状態に切り替え

      // 回数指定がある場合のチェック
      if (count !== undefined) {
        flashCount++;
        if (flashCount >= count * 2) {
          // on/offで2回カウント
          stop();
        }
      }
    }, interval);

    // 時間指定の場合のタイムアウト（回数指定がない場合のみ）
    if (count === undefined) {
      stopTimeout = window.setTimeout(stop, duration);
    }
  });
}
