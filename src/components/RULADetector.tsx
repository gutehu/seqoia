"use client";

import { useEffect, useRef, useState } from "react";
import Webcam from "react-webcam";
import {
  calculateAllJointAngles,
  drawAllJointAngles,
  type JointAngles,
} from "@/lib/poseJointAngles";
import { getSharedPose } from "@/lib/mediapipePose";
import { RULAAngleFilter } from "@/lib/rulaAngleFilter";
import type { RULAScores } from "@/lib/rulaScoring";
import { computeRULAScores, getRULAScoreColor, rulaTotal } from "@/lib/rulaScoring";

const emptyAngles: JointAngles = {
  knee: { left: null, right: null },
  shoulder: { left: null, right: null },
  elbow: { left: null, right: null },
  pelvis: { left: null, right: null },
};

const emptyScores: RULAScores = {
  upperArm: 0,
  lowerArm: 0,
  wrist: 0,
  neck: 0,
  trunk: 0,
};

export function RULADetector() {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const poseRef = useRef<any>(null);
  const rulaFilterRef = useRef<RULAAngleFilter | null>(null);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [isAnalysisActive, setIsAnalysisActive] = useState(false);
  const [jointAngles, setJointAngles] = useState<JointAngles>(emptyAngles);
  const [scores, setScores] = useState<RULAScores>(emptyScores);

  const lastUIUpdateRef = useRef(0);
  const lastSendRef = useRef(0);
  const UI_THROTTLE_MS = 250;
  const SEND_INTERVAL_MS = 33;

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

            const videoWidth = video.videoWidth || 640;
            const videoHeight = video.videoHeight || 480;

            if (canvas.width !== videoWidth || canvas.height !== videoHeight) {
              canvas.width = videoWidth;
              canvas.height = videoHeight;
            }

            const landmarks = results.poseLandmarks && results.poseLandmarks.length > 0
              ? results.poseLandmarks
              : null;

            const angles = landmarks ? calculateAllJointAngles(landmarks) : emptyAngles;
            drawAllJointAngles(ctx, landmarks ?? [], angles, canvas.width, canvas.height, true);

            if (!rulaFilterRef.current) rulaFilterRef.current = new RULAAngleFilter();
            const filteredRULA = rulaFilterRef.current.process(landmarks);
            if (filteredRULA) {
              const newScores = computeRULAScores(filteredRULA);
              const now = Date.now();
              if (now - lastUIUpdateRef.current >= UI_THROTTLE_MS) {
                lastUIUpdateRef.current = now;
                setJointAngles(angles);
                setScores(newScores);
              }
            } else {
              const now = Date.now();
              if (now - lastUIUpdateRef.current >= UI_THROTTLE_MS) {
                lastUIUpdateRef.current = now;
                setJointAngles(angles);
              }
            }
          } catch (_) {
            // Ne pas faire planter la page si landmarks partiels ou erreur
          }
        });

        poseRef.current = pose;
        setIsModelLoaded(true);
      } catch (error) {
        console.error("Erreur initialisation MediaPipe:", error);
      }
    };

    initMediaPipe();
  }, []);

  useEffect(() => {
    if (!isModelLoaded || !isAnalysisActive || !poseRef.current) return;

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
  }, [isModelLoaded, isAnalysisActive]);

  // Quand on arrête l'analyse : vider le canvas, réinitialiser angles et scores, reset filtre RULA
  useEffect(() => {
    if (!isAnalysisActive) {
      setJointAngles(emptyAngles);
      setScores(emptyScores);
      if (rulaFilterRef.current) rulaFilterRef.current.reset();
      const canvas = canvasRef.current;
      const video = webcamRef.current?.video;
      if (canvas && video && video.videoWidth > 0) {
        const w = video.videoWidth;
        const h = video.videoHeight;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, w, h);
      }
    }
  }, [isAnalysisActive]);

  return (
    <div className="min-h-screen bg-black text-white flex">
      {/* Zone vidéo avec canvas */}
      <div className="flex-1 relative bg-black flex items-center justify-center">
        {!isModelLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-10">
            <div className="text-center">
              <div className="animate-spin rounded-none h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
              <p className="text-lg font-mono">Chargement du modèle...</p>
            </div>
          </div>
        )}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20">
          {isModelLoaded && (
            <button
              type="button"
              onClick={() => setIsAnalysisActive((a) => !a)}
              className={`px-6 py-3 rounded-none font-semibold font-mono transition ${
                isAnalysisActive
                  ? "bg-red-600 hover:bg-red-500 text-white"
                  : "bg-green-600 hover:bg-green-500 text-white"
              }`}
            >
              {isAnalysisActive ? "Arrêter l'analyse" : "Lancer l'analyse"}
            </button>
          )}
        </div>
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
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
            }}
          />
        </div>
      </div>

      {/* Panneau : Angles en temps réel + Dashboard RULA (comme analyse vidéo upload) */}
      <div className="w-96 bg-black border-l border-gray-800 p-6 overflow-y-auto">
        <h1 className="text-2xl font-bold mb-2 text-green-400 font-mono">SEQOIA</h1>
        <p className="text-sm text-gray-500 mb-6">Analyse en direct — squelette, angles et RULA</p>

        <div className="space-y-4">
          {/* Angles en temps réel */}
          <div className="bg-gray-950 rounded-none p-4 border border-gray-800">
            <h3 className="font-semibold text-sm uppercase tracking-wide mb-3 text-cyan-400">
              Angles en temps réel
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-300">Épaule G / D</span>
                <span className="font-mono text-sm">
                  {jointAngles.shoulder.right !== null ? `${jointAngles.shoulder.right}°` : "—"} /{" "}
                  {jointAngles.shoulder.left !== null ? `${jointAngles.shoulder.left}°` : "—"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-300">Coude G / D</span>
                <span className="font-mono text-sm">
                  {jointAngles.elbow.right !== null ? `${jointAngles.elbow.right}°` : "—"} /{" "}
                  {jointAngles.elbow.left !== null ? `${jointAngles.elbow.left}°` : "—"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-300">Bassin G / D</span>
                <span className="font-mono text-sm">
                  {jointAngles.pelvis.right !== null ? `${jointAngles.pelvis.right}°` : "—"} /{" "}
                  {jointAngles.pelvis.left !== null ? `${jointAngles.pelvis.left}°` : "—"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-300">Genou G / D</span>
                <span className="font-mono text-sm">
                  {jointAngles.knee.right !== null ? `${jointAngles.knee.right}°` : "—"} /{" "}
                  {jointAngles.knee.left !== null ? `${jointAngles.knee.left}°` : "—"}
                </span>
              </div>
            </div>
          </div>

          {/* Dashboard RULA - Groupe A & B (même présentation que vidéo upload) */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-950 rounded-none p-4 border border-gray-800">
              <h3 className="text-sm font-semibold mb-3 text-cyan-400">Groupe A (Bras & Poignet)</h3>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-400">Bras</span>
                  <span
                    className="inline-flex items-center justify-center w-8 h-8 rounded-none font-bold text-sm"
                    style={{
                      backgroundColor: `${getRULAScoreColor(scores.upperArm)}22`,
                      color: getRULAScoreColor(scores.upperArm),
                    }}
                  >
                    {scores.upperArm || "—"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-400">Avant-bras</span>
                  <span
                    className="inline-flex items-center justify-center w-8 h-8 rounded-none font-bold text-sm"
                    style={{
                      backgroundColor: `${getRULAScoreColor(scores.lowerArm)}22`,
                      color: getRULAScoreColor(scores.lowerArm),
                    }}
                  >
                    {scores.lowerArm || "—"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-400">Poignet</span>
                  <span
                    className="inline-flex items-center justify-center w-8 h-8 rounded-none font-bold text-sm"
                    style={{
                      backgroundColor: `${getRULAScoreColor(scores.wrist)}22`,
                      color: getRULAScoreColor(scores.wrist),
                    }}
                  >
                    {scores.wrist || "—"}
                  </span>
                </div>
              </div>
            </div>
            <div className="bg-gray-950 rounded-none p-4 border border-gray-800">
              <h3 className="text-sm font-semibold mb-3 text-amber-400">Groupe B (Cou & Tronc)</h3>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-400">Cou</span>
                  <span
                    className="inline-flex items-center justify-center w-8 h-8 rounded-none font-bold text-sm"
                    style={{
                      backgroundColor: `${getRULAScoreColor(scores.neck)}22`,
                      color: getRULAScoreColor(scores.neck),
                    }}
                  >
                    {scores.neck || "—"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-400">Tronc</span>
                  <span
                    className="inline-flex items-center justify-center w-8 h-8 rounded-none font-bold text-sm"
                    style={{
                      backgroundColor: `${getRULAScoreColor(scores.trunk)}22`,
                      color: getRULAScoreColor(scores.trunk),
                    }}
                  >
                    {scores.trunk || "—"}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-gray-950 rounded-none p-4 border border-gray-800">
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold">Total RULA</span>
              <span className="text-2xl font-bold font-mono text-yellow-500">
                {rulaTotal(scores)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

