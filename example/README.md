# MitsukeLive Examples

MitsukeLive ライブラリの使用例です。

## Examples

### 1. object-detection-2d.html

基本的な 2D 物体検出のデモです。

**特徴:**

- シンプルな物体検出
- 信頼度と位置情報の表示
- 検出時の点滅エフェクト

**使用方法:**

```bash
# ローカルサーバーを起動してアクセス
python -m http.server 8000
# ブラウザで http://localhost:8000/example/object-detection-2d.html
```

### 2. object-detection-3d.html

3D 情報付きの物体検出デモです。

**特徴:**

- 基本の物体検出 + 3D 推定機能
- 深度（距離）と傾きの情報表示
- 物体サイズの事前登録が必要

**使用方法:**

```bash
# ローカルサーバーを起動してアクセス
python -m http.server 8000
# ブラウザで http://localhost:8000/example/object-detection-3d.html
```

## ファイル構成

```
example/
├── README.md                    # このファイル
├── object-detection-2d.html     # 2D検出デモ
├── object-detection-3d.html     # 3D検出デモ
├── style.css                    # 共通スタイル
└── models/                      # YOLOモデルファイル
    ├── model.json
    ├── metadata.yaml
    └── group1-shard*.bin
```

## 注意事項

- HTTPS または localhost でのアクセスが必要（カメラアクセスのため）
- 検出対象の物体サイズを事前に登録すると 3D 推定の精度が向上します
- モデルファイル（example/models/）が必要です

## API 使用例

### 基本的な 2D 検出

```javascript
import * as MitsukeLive from "../dist/index.js";

const detector = new MitsukeLive.DetectionController({
  modelPath: "models/model.json",
  metadataPath: "models/metadata.yaml",
  onDetection: (detection) => {
    console.log("検出:", detection);
  },
});

await detector.initialize("video", "canvas");
```

### 3D 情報付き検出

```javascript
import * as MitsukeLive from "../dist/index.js";

// 物体サイズを登録
MitsukeLive.setObjectSize(0.091, 0.055); // 91mm x 55mm

const detector = new MitsukeLive.DetectionController({
  model: {
    modelPath: "models/model.json",
    metadataPath: "models/metadata.yaml",
  },
  threeDEstimation: {
    objectSize: {
      width: 0.02, // 2cm
      height: 0.02, // 2cm
    },
  },
  callbacks: {
    onDetection: (detection) => {
      console.log("3D検出:", detection);
    },
  },
});

await detector.initialize("video", "canvas");
```
