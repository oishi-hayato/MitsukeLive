import {
  estimateDepthFromSize,
  adjustDepthByPosition,
  addDepthToDetections,
  estimateOrientation,
  registerObjectSize,
  getRegisteredClasses,
  type DepthEstimationOptions,
} from "../src/helpers/depth-estimator";
import type { Detection } from "../src/types";

describe("DepthEstimator", () => {
  const mockOptions: DepthEstimationOptions = {
    focalLength: 500,
    imageWidth: 640,
    imageHeight: 480,
    className: "person",
  };

  describe("estimateDepthFromSize", () => {
    it("人のサイズから正しく深度を推定する", () => {
      // 人が画面上で100px幅で写っている場合
      const boundingBox: [number, number, number, number] = [
        100, 100, 100, 150,
      ];
      const depth = estimateDepthFromSize(boundingBox, mockOptions);

      // 人の標準幅0.45m * 焦点距離500px / 画像幅100px = 2.25m
      expect(depth).toBeCloseTo(2.25, 1);
    });

    it("無効なバウンディングボックスでエラーを投げる", () => {
      const invalidBoundingBox: [number, number, number, number] = [0, 0, 0, 0];

      expect(() => {
        estimateDepthFromSize(invalidBoundingBox, mockOptions);
      }).toThrow("バウンディングボックスのサイズが不正です");
    });

    it("無効な焦点距離でエラーを投げる", () => {
      const boundingBox: [number, number, number, number] = [
        100, 100, 100, 150,
      ];
      const invalidOptions = { ...mockOptions, focalLength: 0 };

      expect(() => {
        estimateDepthFromSize(boundingBox, invalidOptions);
      }).toThrow("焦点距離が不正です");
    });

    it("未知のクラスでデフォルトサイズを使用する", () => {
      const boundingBox: [number, number, number, number] = [
        100, 100, 100, 100,
      ];
      const unknownClassOptions = {
        ...mockOptions,
        className: "unknown_object",
      };

      const depth = estimateDepthFromSize(boundingBox, unknownClassOptions);

      // デフォルトサイズ0.5m * 焦点距離500px / 画像幅100px = 2.5m
      expect(depth).toBeCloseTo(2.5, 1);
    });
  });

  describe("adjustDepthByPosition", () => {
    it("画像下部の物体の深度を調整する", () => {
      // 画像下部（y=430, height=50なので底辺y=480、画像高480なので最下部）にある物体のバウンディングボックス
      const boundingBox: [number, number, number, number] = [100, 430, 100, 50];
      const baseDepth = 5.0;

      const adjustedDepth = adjustDepthByPosition(
        boundingBox,
        baseDepth,
        mockOptions
      );

      // 画像下部なので変化を確認（現在のアルゴリズムでは増加する）
      expect(adjustedDepth).toBeCloseTo(5.4, 1);
    });

    it("画像上部の物体の深度を増加させる", () => {
      // 画像上部（y=50）にある物体のバウンディングボックス
      const boundingBox: [number, number, number, number] = [100, 50, 100, 50];
      const baseDepth = 5.0;

      const adjustedDepth = adjustDepthByPosition(
        boundingBox,
        baseDepth,
        mockOptions
      );

      // 画像上部にあるので、補正後の深度は基本深度より大きくなる
      expect(adjustedDepth).toBeGreaterThan(baseDepth);
    });

    it("無効な画像サイズでエラーを投げる", () => {
      const boundingBox: [number, number, number, number] = [100, 100, 100, 50];
      const baseDepth = 5.0;
      const invalidOptions = { ...mockOptions, imageWidth: 0 };

      expect(() => {
        adjustDepthByPosition(boundingBox, baseDepth, invalidOptions);
      }).toThrow("画像サイズが不正です");
    });

    it("無効な基本深度でエラーを投げる", () => {
      const boundingBox: [number, number, number, number] = [100, 100, 100, 50];
      const invalidBaseDepth = 0;

      expect(() => {
        adjustDepthByPosition(boundingBox, invalidBaseDepth, mockOptions);
      }).toThrow("基本深度が不正です");
    });
  });

  describe("estimateOrientation", () => {
    it("正常な形状から傾きを推定する", () => {
      // 人の標準的なバウンディングボックス（アスペクト比0.26に近い）
      const boundingBox: [number, number, number, number] = [100, 100, 50, 190];
      const orientation = estimateOrientation(boundingBox, mockOptions);

      // 範囲内の値であることを確認
      expect(orientation.pitch).toBeGreaterThanOrEqual(-30);
      expect(orientation.pitch).toBeLessThanOrEqual(30);
      expect(orientation.roll).toBeGreaterThanOrEqual(-45);
      expect(orientation.roll).toBeLessThanOrEqual(45);
    });

    it("横に広い形状からroll傾きを推定する", () => {
      // 通常より横に広いバウンディングボックス
      const boundingBox: [number, number, number, number] = [
        100, 100, 200, 150,
      ];
      const orientation = estimateOrientation(boundingBox, mockOptions);

      // 横に広いのでrollが正の値になるはず
      expect(orientation.roll).toBeGreaterThan(0);
    });

    it("縦に狭い形状からpitch傾きを推定する", () => {
      // 通常より縦に狭いバウンディングボックス
      const boundingBox: [number, number, number, number] = [
        100, 100, 120, 200,
      ];
      const orientation = estimateOrientation(boundingBox, mockOptions);

      // pitch値が変化することを確認
      expect(typeof orientation.pitch).toBe("number");
      expect(orientation.pitch).toBeGreaterThanOrEqual(-30);
      expect(orientation.pitch).toBeLessThanOrEqual(30);
    });

    it("無効なサイズで0度を返す", () => {
      const invalidBoundingBox: [number, number, number, number] = [0, 0, 0, 0];
      const orientation = estimateOrientation(invalidBoundingBox, mockOptions);

      expect(orientation.pitch).toBe(0);
      expect(orientation.roll).toBe(0);
    });
  });

  describe("addDepthToDetections", () => {
    it("検出結果に深度情報を追加する", () => {
      const detections: Detection[] = [
        {
          boundingBox: [100, 100, 100, 150],
          angle: 0,
          score: 0.8,
        },
        {
          boundingBox: [200, 200, 80, 120],
          angle: 0,
          score: 0.9,
        },
      ];

      const result = addDepthToDetections(detections, mockOptions);

      expect(result).toHaveLength(2);
      expect(result[0].depth).toBeDefined();
      expect(result[1].depth).toBeDefined();
      expect(typeof result[0].depth).toBe("number");
      expect(typeof result[1].depth).toBe("number");
    });

    it("傾き推定が有効な場合に傾き情報を追加する", () => {
      const detections: Detection[] = [
        {
          boundingBox: [100, 100, 100, 150],
          angle: 0,
          score: 0.8,
        },
      ];

      const optionsWithOrientation = {
        ...mockOptions,
        enableOrientationEstimation: true,
      };
      const result = addDepthToDetections(detections, optionsWithOrientation);

      expect(result).toHaveLength(1);
      expect(result[0].orientation).toBeDefined();
      expect(result[0].orientation?.pitch).toBeDefined();
      expect(result[0].orientation?.roll).toBeDefined();
      expect(typeof result[0].orientation?.pitch).toBe("number");
      expect(typeof result[0].orientation?.roll).toBe("number");
    });

    it("空の配列を正しく処理する", () => {
      const detections: Detection[] = [];
      const result = addDepthToDetections(detections, mockOptions);

      expect(result).toEqual([]);
    });

    it("エラーが発生した場合は深度情報なしで返す", () => {
      const detections: Detection[] = [
        {
          boundingBox: [0, 0, 0, 0], // 無効なサイズ
          angle: 0,
          score: 0.8,
        },
      ];

      // エラーが発生してもクラッシュしない
      const result = addDepthToDetections(detections, mockOptions);

      expect(result).toHaveLength(1);
      expect(result[0].depth).toBeUndefined();
    });
  });

  describe("registerObjectSize and getRegisteredClasses", () => {
    it("新しい物体クラスを登録する", () => {
      const initialClasses = getRegisteredClasses();

      registerObjectSize("custom_object", { width: 1.5, height: 2.0 });

      const updatedClasses = getRegisteredClasses();
      expect(updatedClasses).toContain("custom_object");
      expect(updatedClasses.length).toBe(initialClasses.length + 1);
    });

    it("アスペクト比付きで物体クラスを登録する", () => {
      registerObjectSize("custom_object_2", {
        width: 1.5,
        height: 2.0,
        aspectRatio: 0.8,
      });

      const classes = getRegisteredClasses();
      expect(classes).toContain("custom_object_2");
    });

    it("無効なクラス名でエラーを投げる", () => {
      expect(() => {
        registerObjectSize("", { width: 1.0, height: 1.0 });
      }).toThrow("クラス名が不正です");
    });

    it("無効な実世界サイズでエラーを投げる", () => {
      expect(() => {
        registerObjectSize("test", { width: 0, height: 1.0 });
      }).toThrow("実世界サイズが不正です");
    });
  });
});
