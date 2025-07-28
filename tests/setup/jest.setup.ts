// Jest setup file for MitsukeLive tests

// Mock TensorFlow.js for testing
jest.mock("@tensorflow/tfjs", () => ({
  browser: {
    fromPixels: jest.fn(),
  },
  scalar: jest.fn(),
  tidy: jest.fn((fn) => fn()),
  memory: jest.fn(() => ({
    numTensors: 0,
    numBytes: 0,
  })),
  setBackend: jest.fn(),
  ready: jest.fn(() => Promise.resolve()),
  loadGraphModel: jest.fn(),
  disposeVariables: jest.fn(),
}));

// Mock HTMLVideoElement
Object.defineProperty(window, "HTMLVideoElement", {
  writable: true,
  value: jest.fn().mockImplementation(() => ({
    play: jest.fn(() => Promise.resolve()),
    pause: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    videoWidth: 640,
    videoHeight: 480,
    paused: false,
  })),
});

// Mock HTMLCanvasElement
Object.defineProperty(window, "HTMLCanvasElement", {
  writable: true,
  value: jest.fn().mockImplementation(() => ({
    getContext: jest.fn(() => ({
      clearRect: jest.fn(),
      drawImage: jest.fn(),
    })),
    width: 640,
    height: 480,
  })),
});

// Mock requestAnimationFrame
globalThis.requestAnimationFrame = jest.fn((cb) => {
  setTimeout(cb, 0);
  return 0;
});

// Mock fetch for metadata loading
globalThis.fetch = jest.fn(() =>
  Promise.resolve({
    text: () => Promise.resolve("imgsz: [640, 640]"),
  })
) as jest.Mock;
