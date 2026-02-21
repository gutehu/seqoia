"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Webcam from "react-webcam";
import { calculateAllJointAngles, drawAllJointAngles } from "@/lib/poseJointAngles";
import { getSharedPose } from "@/lib/mediapipePose";
import {
  getCustomTrackingAngles,
  CUSTOM_JOINT_LABELS,
  type CustomJointId,
} from "@/lib/customTrackingAngles";
import { Target, Play, Square } from "lucide-react";

export type ConditionType = ">" | "<" | "between";

export interface TrackerConfig {
  id: string;
  joint: CustomJointId;
  condition: ConditionType;
  threshold?: number;
  min?: number;
  max?: number;
}

export interface TrackerState extends TrackerConfig {
  accumulatedTimeMs: number;
  isActiveNow: boolean;
  currentAngle: number | null;
}

const CONDITION_LABELS: Record<ConditionType, string> = {
  ">": "Supérieur à",
  "<": "Inférieur à",
  between: "Compris entre",
};

function formatTimer(ms: number): string {
  const totalSec = ms / 1000;
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  const frac = Math.floor((ms % 1000) / 10);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(frac).padStart(2, "0")}`;
}

const JOINT_OPTIONS: CustomJointId[] = [
  "left_shoulder",
  "right_shoulder",
  "left_elbow",
  "right_elbow",
  "left_wrist",
  "right_wrist",
  "neck",
  "trunk",
];

export function CustomTracking() {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const poseRef = useRef<any>(null);
  const lastProcessedTimeRef = useRef<number>(0);
  const lastSendRef = useRef<number>(0);
  const trackersRef = useRef<TrackerState[]>([]);
  const phaseRef = useRef<"config" | "recording">("config");
  const uiThrottleRef = useRef(0);
  const UI_THROTTLE_MS = 100;
  const SEND_INTERVAL_MS = 33;

  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [phase, setPhase] = useState<"config" | "recording">("config");
  phaseRef.current = phase;
  const [trackers, setTrackers] = useState<TrackerState[]>([]);
  const [configJoint, setConfigJoint] = useState<CustomJointId>("trunk");
  const [configCondition, setConfigCondition] = useState<ConditionType>("between");
  const [configThreshold, setConfigThreshold] = useState<string>("90");
  const [configMin, setConfigMin] = useState<string>("20");
  const [configMax, setConfigMax] = useState<string>("60");

  const addTracker = useCallback(() => {
    const th = configCondition !== "between" ? parseFloat(configThreshold) : undefined;
    const mn = configCondition === "between" ? parseFloat(configMin) : undefined;
    const mx = configCondition === "between" ? parseFloat(configMax) : undefined;
    if (Number.isNaN(th) && Number.isNaN(mn!) && Number.isNaN(mx!)) return;
    const newOne: TrackerState = {
      id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      joint: configJoint,
      condition: configCondition,
      threshold: th,
      min: mn,
      max: mx,
      accumulatedTimeMs: 0,
      isActiveNow: false,
      currentAngle: null,
    };
    setTrackers((prev) => [...prev, newOne]);
  }, [configJoint, configCondition, configThreshold, configMin, configMax]);

  const removeTracker = useCallback((id: string) => {
    setTrackers((prev) => prev.filter((t) => t.id !== id));
    trackersRef.current = trackersRef.current.filter((t) => t.id !== id);
  }, []);

  const startRecording = useCallback(() => {
    if (trackers.length === 0) return;
    trackersRef.current = trackers.map((t) => ({ ...t }));
    lastProcessedTimeRef.current = 0;
    setPhase("recording");
  }, [trackers]);

  const stopRecording = useCallback(() => {
    setPhase("config");
    setTrackers((prev) =>
      prev.map((t) => {
        const ref = trackersRef.current.find((r) => r.id === t.id);
        return ref ? { ...t, accumulatedTimeMs: ref.accumulatedTimeMs } : t;
      })
    );
  }, []);

  function evaluateCondition(angle: number, t: TrackerState): boolean {
    if (t.condition === ">") return t.threshold != null && angle > t.threshold;
    if (t.condition === "<") return t.threshold != null && angle < t.threshold;
    if (t.condition === "between")
      return t.min != null && t.max != null && angle >= t.min && angle <= t.max;
    return false;
  }

  useEffect(() => {
    const initMediaPipe = async () => {
      try {
        const pose = await getSharedPose();
        pose.onResults((results: any) => {
          try {
            const canvas = canvasRef.current;
            const video = webcamRef.current?.video;
            if (!canvas || !video) return;

            const ctx = canvas.getContext("2d");
            if (!ctx) return;

            const w = video.videoWidth || 640;
            const h = video.videoHeight || 480;
            if (canvas.width !== w || canvas.height !== h) {
              canvas.width = w;
              canvas.height = h;
            }

            const landmarks = results.poseLandmarks && results.poseLandmarks.length > 0
              ? results.poseLandmarks
              : null;

            const jointAngles = landmarks ? calculateAllJointAngles(landmarks) : null;
            drawAllJointAngles(ctx, landmarks ?? [], jointAngles ?? { knee: { left: null, right: null }, shoulder: { left: null, right: null }, elbow: { left: null, right: null }, pelvis: { left: null, right: null } }, w, h, true);

            if (phaseRef.current !== "recording" || trackersRef.current.length === 0) return;

            const angles = getCustomTrackingAngles(landmarks, true);
            const now = performance.now();
            const deltaMs = lastProcessedTimeRef.current > 0 ? now - lastProcessedTimeRef.current : 0;
            lastProcessedTimeRef.current = now;

            for (const t of trackersRef.current) {
              const angle = angles[t.joint];
              t.currentAngle = angle ?? null;
              if (angle == null) {
                t.isActiveNow = false;
                continue;
              }
              const active = evaluateCondition(angle, t);
              t.isActiveNow = active;
              if (active) t.accumulatedTimeMs += deltaMs;
            }

            if (now - uiThrottleRef.current >= UI_THROTTLE_MS) {
              uiThrottleRef.current = now;
              setTrackers((prev) =>
                prev.map((p) => {
                  const r = trackersRef.current.find((x) => x.id === p.id);
                  if (!r) return p;
                  return {
                    ...p,
                    accumulatedTimeMs: r.accumulatedTimeMs,
                    isActiveNow: r.isActiveNow,
                    currentAngle: r.currentAngle,
                  };
                })
              );
            }
          } catch (_) {}
        });
        poseRef.current = pose;
        setIsModelLoaded(true);
      } catch (e) {
        console.error("CustomTracking init MediaPipe:", e);
      }
    };
    initMediaPipe();
  }, [phase]);

  useEffect(() => {
    if (!isModelLoaded || !poseRef.current) return;
    lastSendRef.current = 0;
    let rafId: number;
    const processFrame = () => {
      const video = webcamRef.current?.video;
      const pose = poseRef.current;
      if (video && video.readyState >= 2 && pose) {
        const now = performance.now();
        if (now - lastSendRef.current >= SEND_INTERVAL_MS) {
          lastSendRef.current = now;
          pose.send({ image: video }).catch(() => {});
        }
      }
      rafId = requestAnimationFrame(processFrame);
    };
    rafId = requestAnimationFrame(processFrame);
    return () => cancelAnimationFrame(rafId);
  }, [isModelLoaded]);

  return (
    <div className="min-h-screen bg-black text-white flex">
      <div className="flex-1 relative bg-black flex items-center justify-center">
        {!isModelLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-10">
            <div className="text-center">
              <div className="animate-spin rounded-none h-12 w-12 border-b-2 border-green-500 mx-auto mb-4" />
              <p className="text-lg font-mono">Chargement du modèle...</p>
            </div>
          </div>
        )}
        <div className="relative inline-block">
          <Webcam
            ref={webcamRef}
            audio={false}
            mirrored
            className="block"
            style={{ maxWidth: "100%", maxHeight: "100vh" }}
          />
          <canvas
            ref={canvasRef}
            className="absolute top-0 left-0 pointer-events-none"
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        </div>
        {phase === "recording" && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex gap-2">
            <button
              type="button"
              onClick={stopRecording}
              className="px-4 py-2 rounded-none bg-red-600 hover:bg-red-500 text-white font-mono flex items-center gap-2"
            >
              <Square className="w-4 h-4" />
              Arrêter l&apos;enregistrement
            </button>
          </div>
        )}
      </div>

      <div className="w-[420px] bg-black border-l border-gray-800 p-6 overflow-y-auto flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold text-green-400 font-mono">Analyse Sur Mesure</h1>
          <p className="text-sm text-gray-500 mt-1">Chronométrez le temps passé dans une posture cible.</p>
        </div>

        {phase === "config" && (
          <>
            <div className="bg-gray-950 rounded-none p-4 border border-gray-800">
              <h3 className="text-sm font-semibold text-cyan-400 mb-3">Configuration</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Articulation</label>
                  <select
                    value={configJoint}
                    onChange={(e) => setConfigJoint(e.target.value as CustomJointId)}
                    className="w-full bg-gray-900 border border-gray-700 text-white px-3 py-2 rounded-none text-sm"
                  >
                    {JOINT_OPTIONS.map((j) => (
                      <option key={j} value={j}>
                        {CUSTOM_JOINT_LABELS[j]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Condition</label>
                  <select
                    value={configCondition}
                    onChange={(e) => setConfigCondition(e.target.value as ConditionType)}
                    className="w-full bg-gray-900 border border-gray-700 text-white px-3 py-2 rounded-none text-sm"
                  >
                    <option value=">">{CONDITION_LABELS[">"]}</option>
                    <option value="<">{CONDITION_LABELS["<"]}</option>
                    <option value="between">{CONDITION_LABELS.between}</option>
                  </select>
                </div>
                {configCondition === "between" ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Min (°)</label>
                      <input
                        type="number"
                        value={configMin}
                        onChange={(e) => setConfigMin(e.target.value)}
                        className="w-full bg-gray-900 border border-gray-700 text-white px-3 py-2 rounded-none text-sm font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Max (°)</label>
                      <input
                        type="number"
                        value={configMax}
                        onChange={(e) => setConfigMax(e.target.value)}
                        className="w-full bg-gray-900 border border-gray-700 text-white px-3 py-2 rounded-none text-sm font-mono"
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Valeur (°)</label>
                    <input
                      type="number"
                      value={configThreshold}
                      onChange={(e) => setConfigThreshold(e.target.value)}
                      className="w-full bg-gray-900 border border-gray-700 text-white px-3 py-2 rounded-none text-sm font-mono"
                    />
                  </div>
                )}
                <button
                  type="button"
                  onClick={addTracker}
                  className="w-full py-2 rounded-none bg-gray-800 hover:bg-gray-700 border border-gray-700 text-sm flex items-center justify-center gap-2"
                >
                  <Target className="w-4 h-4" />
                  Ajouter cette condition
                </button>
              </div>
            </div>

            {trackers.length > 0 && (
              <div className="bg-gray-950 rounded-none p-4 border border-gray-800">
                <h3 className="text-sm font-semibold mb-2">Conditions ajoutées ({trackers.length})</h3>
                <ul className="space-y-2 text-sm text-gray-400">
                  {trackers.map((t) => (
                    <li key={t.id} className="flex justify-between items-center">
                      <span>
                        {CUSTOM_JOINT_LABELS[t.joint]}{" "}
                        {t.condition === "between"
                          ? `entre ${t.min}° et ${t.max}°`
                          : t.condition === ">"
                            ? `> ${t.threshold}°`
                            : `< ${t.threshold}°`}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeTracker(t.id)}
                        className="text-red-400 hover:text-red-300 text-xs"
                      >
                        Retirer
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={startRecording}
                  className="mt-4 w-full py-3 rounded-none bg-green-600 hover:bg-green-500 text-white font-semibold flex items-center justify-center gap-2"
                >
                  <Play className="w-4 h-4" />
                  Démarrer l&apos;enregistrement
                </button>
              </div>
            )}
          </>
        )}

        {phase === "recording" && trackers.length > 0 && (
          <div className="bg-gray-950 rounded-none p-4 border border-gray-800">
            <h3 className="text-sm font-semibold text-cyan-400 mb-3">Suivi en direct</h3>
            <div className="space-y-3">
              {trackers.map((t) => {
                const label =
                  CUSTOM_JOINT_LABELS[t.joint] +
                  (t.condition === "between"
                    ? ` entre ${t.min}° et ${t.max}°`
                    : t.condition === ">"
                      ? ` > ${t.threshold}°`
                      : ` < ${t.threshold}°`);
                return (
                  <div
                    key={t.id}
                    className={`rounded-none p-3 border transition-colors ${
                      t.isActiveNow
                        ? "bg-red-950/60 border-red-500 animate-pulse"
                        : "bg-gray-900 border-gray-700"
                    }`}
                  >
                    <div className="font-medium text-sm text-gray-200">{label}</div>
                    <div className="flex justify-between items-center mt-2 text-xs">
                      <span className="text-gray-500">
                        Angle actuel:{" "}
                        <span className="font-mono text-cyan-400">
                          {t.currentAngle != null ? `${t.currentAngle.toFixed(0)}°` : "—"}
                        </span>
                      </span>
                      <span className="font-mono text-yellow-400 tabular-nums">
                        {formatTimer(t.accumulatedTimeMs)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
