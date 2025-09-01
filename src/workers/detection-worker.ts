/// <reference lib="webworker" />

import { WorkerQueueManager } from "./worker-queue-manager";

// Initialize queue manager
const queueManager = new WorkerQueueManager();

self.onmessage = (event) => {
  const { type, payload } = event.data;

  switch (type) {
    case "start":
      if (payload?.intervalMs) {
        queueManager.start(payload.intervalMs);
      }
      break;
    case "stop":
      queueManager.stop();
      break;
    case "enqueue":
      if (payload && "item" in payload) {
        queueManager.enqueue(payload.item);
      }
      break;
    case "dispose":
      queueManager.stop();
      break;
  }
};
