# MitsukeLive AR Example

MitsukeLive + Z軸推定機能のシンプルなARデモです。

## 📁 ファイル構成

- `ar-simple.html` - Vue3 + Three.js を使ったシンプルなARアプリ

## 🚀 使用方法

### 1. ローカルサーバーで起動

```bash
# MitsukeLiveプロジェクトのルートで
cd example
python -m http.server 8080
# または
npx serve .
```

### 2. ブラウザでアクセス

```
http://localhost:8080/ar-simple.html
```

### 3. 機能

- 📷 **リアルタイムカメラ映像**
- 🎯 **物体検出 + Z軸推定**
- 📐 **3D姿勢推定（pitch/roll）**
- 🎲 **Three.js 3Dオブジェクト表示**
- ⚡ **点滅エフェクト**
- 🎛️ **検出制御（開始/停止/クリア）**

## 📊 Z軸推定機能

### 物体サイズ登録
```javascript
// 名刺サイズを登録（91mm x 55mm）
MitsukeLive.setObjectSize('business_card', 0.091, 0.055);

// ロゴサイズを登録（50mm x 50mm）
MitsukeLive.setObjectSize('logo', 0.05, 0.05);
```

### 検出結果
```javascript
{
  boundingBox: [x, y, width, height],  // 2D位置
  score: 0.85,                         // 信頼度
  depth: 1.23,                         // 推定深度（メートル）
  orientation: {
    pitch: 5.2,                        // 上下傾き（度）
    roll: -2.8                         // 左右傾き（度）
  }
}
```

### 3D配置
```javascript
// Three.jsでの3D配置
cube.position.set(screenX * depth, screenY * depth, -depth);
cube.rotation.x = THREE.MathUtils.degToRad(pitch);
cube.rotation.z = THREE.MathUtils.degToRad(roll);
```

## 🎮 操作方法

- **▶️/⏸️ボタン**: 検出の開始/停止
- **🗑️ボタン**: 3Dオブジェクトをクリア
- **自動検出**: 物体を検出すると自動で3Dオブジェクトが表示

## 🔧 カスタマイズ

### モデル変更
```javascript
const options = {
  modelPath: '/your-model/model.json',
  metadataPath: '/your-model/metadata.yaml',
  // ...
};
```

### 3Dオブジェクト変更
```javascript
// ar-simple.html の place3DObject 関数内
const geometry = new THREE.SphereGeometry(0.1, 16, 16); // 球体に変更
const material = new THREE.MeshLambertMaterial({ color: 0xff0088 }); // 色変更
```

## 📝 ar-meishiとの違い

| 項目 | ar-meishi | ar-simple |
|------|-----------|-----------|
| フレームワーク | Vue3 + Router | Vue3のみ |
| 3D表示 | なし | Three.js |
| Z軸推定 | なし | あり |
| 傾き推定 | なし | あり |
| コンポーネント | 複数分割 | 単一ファイル |
| ダイアログ | あり | なし |
| スプラッシュ | あり | なし |

シンプルで分かりやすい実装になっています！