# MitsukeLive

MitsukeLive は、TensorFlow.js と YOLO モデルを使用したリアルタイム物体検出ライブラリです。

## 説明

MitsukeLive は2つの検出モードを提供します：

| モード | 特徴 |
|--------|------|
| **2D検出モード** | 基本的な物体検出<br>検出時に一時停止し、結果を表示 |
| **3D/ARモード** | 3D情報付きの高度な物体検出<br>連続検出でリアルタイム体験 |

## Example

デモアプリケーションを起動するには：

```bash
npm run example
```

ブラウザで http://localhost:3000 にアクセスして、2 つのデモを確認できます：

- [object-detection-2d.html](http://localhost:3000/object-detection-2d.html) - 基本的な 2D 物体検出
- [object-detection-ar.html](http://localhost:3000/object-detection-ar.html) - AR モード（3D 情報付き）

## ライセンス

Apache License 2.0 - 詳細は[LICENSE](LICENSE)ファイルを参照してください。
