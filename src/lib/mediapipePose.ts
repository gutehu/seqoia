/**
 * Une seule instance MediaPipe Pose pour toute l'app.
 * Évite "Module.arguments has been replaced" (Emscripten) quand plusieurs
 * composants ou le Strict Mode déclenchent plusieurs initialisations.
 */

let poseInstance: any = null;
let initPromise: Promise<any> | null = null;

const CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404";

function locateFile(file: string): string {
  if (file === "pose_solution_packed_assets_loader.js" && typeof window !== "undefined") {
    return window.location.origin + "/pose_solution_packed_assets_loader.js";
  }
  return `${CDN}/${file}`;
}

/**
 * Retourne la même instance Pose, en l'initialisant une seule fois.
 */
export async function getSharedPose(): Promise<any> {
  if (poseInstance) return poseInstance;
  if (initPromise) return initPromise;

  const mod = await import("@mediapipe/pose");
  const PoseConstructor =
    (typeof globalThis !== "undefined" && (globalThis as any).Pose) ||
    (typeof window !== "undefined" && (window as any).Pose);
  if (!PoseConstructor || typeof PoseConstructor !== "function") {
    throw new Error("MediaPipe Pose constructor not found on global");
  }

  const pose = new PoseConstructor({ locateFile });
  pose.setOptions({
    modelComplexity: 0,
    smoothLandmarks: true,
    minDetectionConfidence: 0.3,
    minTrackingConfidence: 0.3,
  });

  initPromise = pose.initialize().then(() => {
    poseInstance = pose;
    return pose;
  });

  return initPromise;
}
