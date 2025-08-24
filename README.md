<p align="center">
  <img src="https://raw.githubusercontent.com/oishi-hayato/MitsukeLive/refs/heads/main/assets/LOGO.png" alt="MitsukeLive Logo" width="300">
</p>

# MitsukeLive

MitsukeLive is a browser-based real-time object detection library using TensorFlow.js and YOLO models, with flexible post-detection customization.

MitsukeLive provides two detection modes:

| Mode      | Features                                                                                        |
| --------- | ----------------------------------------------------------------------------------------------- |
| **2D**    | Basic object detection with 2D center coordinates                                               |
| **3D/AR** | Object detection with 3D position and orientation, integrated with Three.js for AR applications |

## Example

To start the demo application:

```bash
npm run example
```

Access http://localhost:3000 in your browser to view two demos:

- [2d.html](http://localhost:3000/2d.html) - 2D
- [3d.html](http://localhost:3000/3d.html) - 3D/AR

## API Parameters

### ObjectDetectorOptions

| Parameter                            | Type       | Default   | Description                                                          |
| ------------------------------------ | ---------- | --------- | -------------------------------------------------------------------- |
| `detection.inferenceInterval`        | `number`   | `500`     | Inference execution interval (milliseconds)                          |
| `detection.scoreThreshold`           | `number`   | `0.7`     | Minimum confidence score for detection (0.0-1.0)                     |
| `threeDEstimation.objectSize.width`  | `number`   | -         | Real object width in meters (required for 3D mode)                   |
| `threeDEstimation.objectSize.height` | `number`   | -         | Real object height in meters (required for 3D mode)                  |
| `threeDEstimation.cameraFov`         | `number`   | `50`      | Camera field of view in degrees                                      |
| `performance.backend`                | `string`   | `"webgl"` | TensorFlow.js backend (`"webgl"`, `"webgpu"`, `"wasm"`, `"cpu"`)     |
| `performance.memoryThreshold`        | `number`   | `50`      | Tensor count threshold for memory cleanup                            |
| `onDetection`                        | `function` | -         | Callback for detection results (not called when detection is paused) |
| `onCameraReady`                      | `function` | -         | Callback when camera is ready                                        |
| `onCameraNotAllowed`                 | `function` | -         | Callback when camera access is denied                                |

### Detection Result Properties

| Property      | Type                               | Description                                      |
| ------------- | ---------------------------------- | ------------------------------------------------ |
| `boundingBox` | `[number, number, number, number]` | Object position and size `[centerX, centerY, width, height]` |
| `angle`       | `number`                           | Rotation angle in degrees                        |
| `score`       | `number`                           | Confidence score (0.0-1.0)                       |

### ARDetection Additional Properties (3D Mode)

| Property            | Type     | Description                                 |
| ------------------- | -------- | ------------------------------------------- |
| `depth`             | `number` | Distance from camera in meters              |
| `orientation.pitch` | `number` | Up-down tilt angle (-90 to 90 degrees)      |
| `orientation.roll`  | `number` | Left-right tilt angle (-180 to 180 degrees) |

## DetectionController Methods

### pause(options?)

Pause detection processing.

```typescript
// Pause both camera and detection (default behavior)
detector.pause();
detector.pause({ pauseCamera: true });

// Pause only detection, keep camera running
detector.pause({ pauseCamera: false });
```

### resume()

Resume detection processing.

```typescript
detector.resume();
```

## Partners

This project is supported by the following partners:

<a href="https://irdl.jp/"><img src="https://irdl.jp/img/irdl/logo.webp" alt="ITO REAL DESIGN Lab." width="300"></a>

## License

[Apache License 2.0](LICENSE)
