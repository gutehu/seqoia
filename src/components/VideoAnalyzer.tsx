"use client";

import { useEffect, useRef, useState } from "react";
import { Upload, Play, Pause, BarChart3, AlertTriangle, Clock, Flame } from "lucide-react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

import type { RULAScores } from "@/lib/rulaScoring";
import { computeRULAScores, getRULAScoreColor, rulaTotal } from "@/lib/rulaScoring";
import { RULAAngleFilter } from "@/lib/rulaAngleFilter";
import { extractRULAAngles } from "@/lib/rulaAngles";
import {
  calculateAllJointAngles,
  drawAllJointAngles,
  type JointAngles,
} from "@/lib/poseJointAngles";

interface FrameData {
  timestamp: number; // en secondes
  scores: RULAScores;
  /** Angles en degrés utilisés pour le score (cou = flexion tête, tronc = inclinaison) */
  angles?: { neckDeg: number; trunkDeg: number };
  thumbnail?: string; // URL de la miniature (base64)
}

interface VideoAnalysisResult {
  averageScores: RULAScores;
  frameData: FrameData[];
  duration: number;
  criticalMoments?: FrameData[]; // Top 10 moments critiques
}

import { getSharedPose } from "@/lib/mediapipePose";

export function VideoAnalyzer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const poseRef = useRef<any>(null);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisResult, setAnalysisResult] = useState<VideoAnalysisResult | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [jointAngles, setJointAngles] = useState<JointAngles>({
    knee: { left: null, right: null },
    shoulder: { left: null, right: null },
    elbow: { left: null, right: null },
    pelvis: { left: null, right: null },
  });
  const [rulaAngles, setRulaAngles] = useState<{ neckDeg: number | null; trunkDeg: number | null }>({
    neckDeg: null,
    trunkDeg: null,
  });

  const lastUIUpdateRealtimeRef = useRef(0);
  const lastSendRealtimeRef = useRef(0);
  const UI_THROTTLE_MS = 250;
  const SEND_INTERVAL_MS = 33;

  // Traitement en temps réel pendant la lecture (requestAnimationFrame, pas de setState par frame)
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const pose = poseRef.current;
    if (!video || !canvas || !pose || !isVideoReady || isAnalyzing) return;

    let isActive = true;
    let rafId: number;

    const realtimeCallback = (results: any) => {
      if (!isActive || !canvas) return;

      const now = Date.now();
      if (results.poseLandmarks && results.poseLandmarks.length > 0) {
        const angles = calculateAllJointAngles(results.poseLandmarks);
        const rula = extractRULAAngles(results.poseLandmarks);

        const ctx = canvas.getContext("2d");
        if (ctx && video.videoWidth > 0 && video.videoHeight > 0) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          drawAllJointAngles(ctx, results.poseLandmarks, angles, canvas.width, canvas.height);
        }

        if (now - lastUIUpdateRealtimeRef.current >= UI_THROTTLE_MS) {
          lastUIUpdateRealtimeRef.current = now;
          setJointAngles(angles);
          setRulaAngles(rula ? { neckDeg: rula.neckDeg, trunkDeg: rula.trunkDeg } : { neckDeg: null, trunkDeg: null });
        }
      } else {
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (now - lastUIUpdateRealtimeRef.current >= UI_THROTTLE_MS) {
          lastUIUpdateRealtimeRef.current = now;
          setJointAngles({
            knee: { left: null, right: null },
            shoulder: { left: null, right: null },
            elbow: { left: null, right: null },
            pelvis: { left: null, right: null },
          });
          setRulaAngles({ neckDeg: null, trunkDeg: null });
        }
      }
    };

    pose.onResults(realtimeCallback);

    const processFrame = () => {
      if (!isActive || video.paused || video.ended || isAnalyzing) {
        if (isActive && !isAnalyzing) rafId = requestAnimationFrame(processFrame);
        return;
      }

      const now = performance.now();
      if (now - lastSendRealtimeRef.current >= SEND_INTERVAL_MS) {
        lastSendRealtimeRef.current = now;
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          const tempCanvas = document.createElement("canvas");
          tempCanvas.width = video.videoWidth;
          tempCanvas.height = video.videoHeight;
          const tempCtx = tempCanvas.getContext("2d");
          if (tempCtx) {
            tempCtx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
            pose.send({ image: tempCanvas }).catch(() => {});
          }
        }
      }

      rafId = requestAnimationFrame(processFrame);
    };

    rafId = requestAnimationFrame(processFrame);
    return () => {
      isActive = false;
      cancelAnimationFrame(rafId);
    };
  }, [isPlaying, isVideoReady, isAnalyzing]);

  useEffect(() => {
    const initMediaPipe = async () => {
      try {
        const pose = await getSharedPose();
        pose.onResults(() => {});
        poseRef.current = pose;
        setIsModelLoaded(true);
        console.log("✅ MediaPipe initialisé et prêt");
      } catch (error) {
        console.error("Erreur initialisation MediaPipe:", error);
      }
    };

    initMediaPipe();
  }, []);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !videoRef.current) return;

    setIsVideoReady(false);
    const video = videoRef.current;
    const url = URL.createObjectURL(file);
    video.src = url;
    video.load();

    // Attendre que les métadonnées soient chargées
    const onLoadedMetadata = () => {
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      setIsVideoReady(true);
    };
    video.addEventListener("loadedmetadata", onLoadedMetadata);
    
    // Vérifier si déjà chargé
    if (video.readyState >= 1) {
      setIsVideoReady(true);
    }
  };

  const jumpToTimestamp = (timestamp: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = timestamp;
    video.pause();
    setIsPlaying(false);
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${String(secs).padStart(2, "0")}`;
  };

  const analyzeVideo = async () => {
    const video = videoRef.current;
    if (!video || !poseRef.current || isAnalyzing) return;

    setIsAnalyzing(true);
    setAnalysisProgress(0);
    setAnalysisResult(null);

    const frameData: FrameData[] = [];
    const frameCanvases: Map<number, HTMLCanvasElement> = new Map();
    const sampleRate = 0.25; // Analyser 1 frame toutes les 0.25 secondes (4 fps)
    const rulaFilter = new RULAAngleFilter();

    // Attendre que la vidéo soit prête
    await new Promise<void>((resolve) => {
      const onLoadedMetadata = () => {
        video.removeEventListener("loadedmetadata", onLoadedMetadata);
        resolve();
      };
      video.addEventListener("loadedmetadata", onLoadedMetadata);
      if (video.readyState >= 1) resolve();
    });

    const duration = video.duration;
    const totalSamples = Math.ceil(duration / sampleRate);

    // Callback pour collecter les résultats
    let pendingTimestamp = 0;
    let poseResolve: (() => void) | null = null;
    let onResultsCallCount = 0;

    // Configurer le callback MediaPipe correctement
    poseRef.current.onResults((results: any) => {
      onResultsCallCount++;
      console.log(`🎯 onResults appelé #${onResultsCallCount} à ${pendingTimestamp.toFixed(1)}s`, {
        hasPoseLandmarks: !!results.poseLandmarks,
        landmarksCount: results.poseLandmarks?.length || 0,
        hasPoseWorldLandmarks: !!results.poseWorldLandmarks,
      });

      if (results.poseLandmarks && results.poseLandmarks.length > 0) {
        const filteredAngles = rulaFilter.process(results.poseLandmarks);
        const angles = filteredAngles ?? extractRULAAngles(results.poseLandmarks);
        const scores = angles ? computeRULAScores(angles) : null;
        if (scores) {
          let thumbnail: string | undefined;
          const storedCanvas = frameCanvases.get(pendingTimestamp);
          if (storedCanvas) {
            thumbnail = storedCanvas.toDataURL("image/jpeg", 0.7);
          }
          frameData.push({
            timestamp: pendingTimestamp,
            scores,
            angles: { neckDeg: angles.neckDeg, trunkDeg: angles.trunkDeg },
            thumbnail,
          });
        }
        console.log(`✅ Frame ${frameData.length} analysée à ${pendingTimestamp.toFixed(1)}s:`, scores);
      } else {
        console.warn(`⚠️ Pas de landmarks détectés à ${pendingTimestamp.toFixed(1)}s`, results);
      }
      if (poseResolve) {
        poseResolve();
        poseResolve = null;
      }
    });

    // Traiter la vidéo en sautant de sampleRate en sampleRate secondes
    for (let i = 0; i < totalSamples; i++) {
      const t = i * sampleRate;
      pendingTimestamp = t;

      // Aller à la position dans la vidéo
      video.currentTime = t;

      // Attendre que la vidéo soit à la bonne position
      await new Promise<void>((resolve) => {
        const onSeeked = () => {
          video.removeEventListener("seeked", onSeeked);
          resolve();
        };
        video.addEventListener("seeked", onSeeked, { once: true });

        // Timeout de sécurité
        setTimeout(() => {
          video.removeEventListener("seeked", onSeeked);
          resolve();
        }, 300);
      });

      // Laisser le temps à la frame d’être décodée et peinte (évite canvas vide / ancienne frame)
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Capturer la frame actuelle
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      
      if (!ctx || video.readyState < 2) {
        console.warn(`⚠️ Frame ${i + 1}/${totalSamples}: Canvas ou vidéo pas prête`, {
          hasContext: !!ctx,
          readyState: video.readyState,
        });
        continue;
      }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      console.log(`📸 Frame ${i + 1}/${totalSamples} capturée à ${t.toFixed(1)}s (${canvas.width}x${canvas.height})`);

      // Stocker le canvas pour générer la miniature plus tard
      frameCanvases.set(t, canvas);

      try {
        // Attendre le résultat avant de continuer
        await new Promise<void>((resolve) => {
          poseResolve = resolve;
          console.log(`📤 Envoi frame ${i + 1} à MediaPipe...`);
          poseRef.current.send({ image: canvas }).catch((error: any) => {
            console.error(`❌ Erreur envoi frame ${i + 1}:`, error);
            if (poseResolve) {
              poseResolve();
              poseResolve = null;
            }
          });
          // Timeout de sécurité pour MediaPipe
          setTimeout(() => {
            if (poseResolve) {
              console.warn(`⏱️ Timeout pour frame ${i + 1}`);
              poseResolve();
              poseResolve = null;
            }
          }, 3000);
        });
      } catch (error) {
        console.error(`❌ Erreur traitement frame ${i + 1}:`, error);
      }

      // Mettre à jour la progression
      const progress = ((i + 1) / totalSamples) * 100;
      setAnalysisProgress(Math.min(100, progress));
    }

    // Calculer les moyennes
    console.log("📊 Analyse terminée:");
    console.log("  - Frames analysées:", totalSamples);
    console.log("  - onResults appelé:", onResultsCallCount, "fois");
    console.log("  - Données collectées:", frameData.length, "frames");
    console.log("  - Durée vidéo:", duration, "secondes");
    
    if (frameData.length > 0) {
      const n = frameData.length;
      const sum = (key: keyof RULAScores) =>
        frameData.reduce((s, f) => s + f.scores[key], 0);
      const averages: RULAScores = {
        upperArm: Math.round(sum("upperArm") / n),
        lowerArm: Math.round(sum("lowerArm") / n),
        wrist: Math.round(sum("wrist") / n),
        neck: Math.round(sum("neck") / n),
        trunk: Math.round(sum("trunk") / n),
      };

      // Trier par score total décroissant et prendre le top 10
      const sortedByScore = [...frameData].sort(
        (a, b) => rulaTotal(b.scores) - rulaTotal(a.scores)
      );
      const criticalMoments = sortedByScore.slice(0, 10);

      console.log("✅ Scores moyens calculés:", averages);
      console.log("📈 Première frame:", frameData[0]);
      console.log("📈 Dernière frame:", frameData[frameData.length - 1]);
      console.log("🚨 Moments critiques identifiés:", criticalMoments.length);

      setAnalysisResult({
        averageScores: averages,
        frameData,
        duration,
        criticalMoments,
      });
    } else {
      console.warn("⚠️ Aucune donnée collectée !");
      alert("Aucune donnée n'a été collectée. Vérifiez que la vidéo contient une personne visible.");
    }

    setIsAnalyzing(false);
    video.currentTime = 0;
  };

  const togglePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-7xl mx-auto p-6 pb-12">
        <h1 className="text-3xl font-bold mb-2 text-green-400 font-mono">SEQOIA</h1>
        <p className="text-sm text-gray-500 mb-6">Analyse post-vidéo RULA</p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Zone vidéo */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-gray-950 rounded-none p-4 border border-gray-800">
              <div className="mb-4 flex gap-4 items-center">
                <label className="cursor-pointer bg-green-600 hover:bg-green-700 px-4 py-2 rounded-none flex items-center gap-2">
                  <Upload className="w-4 h-4" />
                  Charger une vidéo
                  <input
                    type="file"
                    accept="video/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
                <button
                  onClick={analyzeVideo}
                  disabled={!isModelLoaded || isAnalyzing || !isVideoReady}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed px-4 py-2 rounded-none flex items-center gap-2"
                >
                  <BarChart3 className="w-4 h-4" />
                  {isAnalyzing ? "Analyse en cours..." : "Analyser"}
                </button>
                {isVideoReady && (
                  <button
                    onClick={togglePlayPause}
                    className="bg-gray-900 hover:bg-gray-800 border border-gray-800 px-4 py-2 rounded-none flex items-center gap-2"
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    {isPlaying ? "Pause" : "Lecture"}
                  </button>
                )}
                {!isModelLoaded && (
                  <span className="text-sm text-gray-500">Chargement du modèle...</span>
                )}
                {isModelLoaded && !isVideoReady && videoRef.current?.src && (
                  <span className="text-sm text-gray-500">Chargement de la vidéo...</span>
                )}
              </div>

              {isAnalyzing && (
                <div className="mb-4">
                  <div className="flex justify-between text-sm mb-2">
                    <span>Progression</span>
                    <span>{Math.round(analysisProgress)}%</span>
                  </div>
                  <div className="w-full bg-gray-800 rounded-none h-2">
                    <div
                      className="bg-green-500 h-2 rounded-none transition-all"
                      style={{ width: `${analysisProgress}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="relative bg-black rounded-none overflow-hidden">
                <video
                  ref={videoRef}
                  className="w-full"
                  controls={false}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                />
                <canvas
                  ref={canvasRef}
                  className="absolute top-0 left-0 pointer-events-none"
                  style={{ width: "100%", height: "100%" }}
                />
              </div>
            </div>

            {/* Dashboard des moments critiques */}
            {analysisResult && analysisResult.criticalMoments && analysisResult.criticalMoments.length > 0 && (
              <div className="bg-gray-950 rounded-none p-4 border border-gray-800">
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                  <h3 className="text-lg font-semibold">Dashboard des moments critiques</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {analysisResult.criticalMoments.map((moment, index) => (
                    <div
                      key={index}
                      onClick={() => jumpToTimestamp(moment.timestamp)}
                      className="bg-gray-900 rounded-none p-3 border border-gray-800 hover:border-red-500 cursor-pointer transition-colors"
                    >
                      <div className="flex gap-3">
                        {moment.thumbnail && (
                          <img
                            src={moment.thumbnail}
                            alt={`Moment critique ${index + 1}`}
                            className="w-24 h-16 object-cover rounded-none"
                          />
                        )}
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Clock className="w-4 h-4 text-gray-500" />
                            <span className="text-sm text-gray-300">{formatTime(moment.timestamp)}</span>
                          </div>
                          <div className="mb-2">
                            <span className="text-xs text-gray-500">Total RULA: </span>
                            <span
                              className="text-lg font-bold font-mono"
                              style={{ color: getRULAScoreColor(rulaTotal(moment.scores)) }}
                            >
                              {rulaTotal(moment.scores)}
                            </span>
                          </div>
                          <div className="flex gap-2 text-xs text-gray-500 flex-wrap">
                            <span>Bras {moment.scores.upperArm}</span>
                            <span>Av.-br. {moment.scores.lowerArm}</span>
                            <span>Poignet {moment.scores.wrist}</span>
                            <span>Cou {moment.scores.neck}{moment.angles != null ? ` (${moment.angles.neckDeg.toFixed(0)}°)` : ""}</span>
                            <span>Tronc {moment.scores.trunk}{moment.angles != null ? ` (${moment.angles.trunkDeg.toFixed(0)}°)` : ""}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Heat Map */}
            {analysisResult && analysisResult.frameData.length > 0 ? (
              <div className="bg-gray-950 rounded-none p-4 border border-gray-800">
                <div className="flex items-center gap-2 mb-4">
                  <Flame className="w-5 h-5 text-orange-500" />
                  <h3 className="text-lg font-semibold">Heat Map - Moments critiques</h3>
                </div>
                <div className="mb-2">
                  <p className="text-sm text-gray-500">
                    Les zones en rouge/orange indiquent les moments où le score est supérieur à 3
                  </p>
                </div>
                <HeatMapTimeline
                  frameData={analysisResult.frameData}
                  duration={analysisResult.duration}
                  onSegmentClick={jumpToTimestamp}
                />
              </div>
            ) : null}

            {/* Graphique d'évolution */}
            {analysisResult && analysisResult.frameData.length > 0 ? (
              <div className="bg-gray-950 rounded-none p-4 border border-gray-800">
                <h3 className="text-lg font-semibold mb-4">Évolution du score RULA</h3>
                <div className="h-64">
                  <Line
                    data={{
                      labels: analysisResult.frameData.map((f) =>
                        `${Math.floor(f.timestamp / 60)}:${String(Math.floor(f.timestamp % 60)).padStart(2, "0")}`
                      ),
                      datasets: [
                        {
                          label: "Total RULA",
                          data: analysisResult.frameData.map((f) => rulaTotal(f.scores)),
                          borderColor: "#eab308",
                          backgroundColor: "rgba(234, 179, 8, 0.1)",
                          fill: true,
                          tension: 0.3,
                        },
                        {
                          label: "Bras",
                          data: analysisResult.frameData.map((f) => f.scores.upperArm),
                          borderColor: "#22c55e",
                          backgroundColor: "rgba(34, 197, 94, 0.1)",
                          fill: true,
                          tension: 0.3,
                        },
                        {
                          label: "Avant-bras",
                          data: analysisResult.frameData.map((f) => f.scores.lowerArm),
                          borderColor: "#3b82f6",
                          backgroundColor: "rgba(59, 130, 246, 0.1)",
                          fill: true,
                          tension: 0.3,
                        },
                        {
                          label: "Poignet",
                          data: analysisResult.frameData.map((f) => f.scores.wrist),
                          borderColor: "#8b5cf6",
                          backgroundColor: "rgba(139, 92, 246, 0.1)",
                          fill: true,
                          tension: 0.3,
                        },
                        {
                          label: "Cou",
                          data: analysisResult.frameData.map((f) => f.scores.neck),
                          borderColor: "#ef4444",
                          backgroundColor: "rgba(239, 68, 68, 0.1)",
                          fill: true,
                          tension: 0.3,
                        },
                        {
                          label: "Tronc",
                          data: analysisResult.frameData.map((f) => f.scores.trunk),
                          borderColor: "#f97316",
                          backgroundColor: "rgba(249, 115, 22, 0.1)",
                          fill: true,
                          tension: 0.3,
                        },
                      ],
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: {
                          labels: { color: "#94a3b8" },
                        },
                      },
                      scales: {
                        x: {
                          grid: { color: "rgba(100, 116, 139, 0.2)" },
                          ticks: { color: "#64748b" },
                        },
                        y: {
                          grid: { color: "rgba(100, 116, 139, 0.2)" },
                          ticks: { color: "#64748b" },
                          min: 0,
                          max: 8, // Score RULA 1-7, plafond 8 pour lisibilité
                        },
                      },
                    }}
                  />
                </div>
              </div>
            ) : analysisResult && analysisResult.frameData.length === 0 ? (
              <div className="bg-gray-950 rounded-none p-4 border border-gray-800">
                <p className="text-sm text-gray-500 text-center">
                  Aucune donnée disponible pour le graphique. Aucune pose n&apos;a été détectée dans la vidéo.
                </p>
              </div>
            ) : null}
          </div>

          {/* Panneau de résultats */}
          <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            {analysisResult ? (
              <>
                {/* Dashboard RULA - Groupe A & B */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-950 rounded-none p-4 border border-gray-800">
                    <h3 className="text-sm font-semibold mb-3 text-cyan-400">Groupe A (Bras & Poignet)</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-500">Bras</span>
                        <span
                          className="inline-flex items-center justify-center w-8 h-8 rounded-none font-bold text-sm"
                          style={{
                            backgroundColor: `${getRULAScoreColor(analysisResult.averageScores.upperArm)}22`,
                            color: getRULAScoreColor(analysisResult.averageScores.upperArm),
                          }}
                        >
                          {analysisResult.averageScores.upperArm}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-500">Avant-bras</span>
                        <span
                          className="inline-flex items-center justify-center w-8 h-8 rounded-none font-bold text-sm"
                          style={{
                            backgroundColor: `${getRULAScoreColor(analysisResult.averageScores.lowerArm)}22`,
                            color: getRULAScoreColor(analysisResult.averageScores.lowerArm),
                          }}
                        >
                          {analysisResult.averageScores.lowerArm}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-500">Poignet</span>
                        <span
                          className="inline-flex items-center justify-center w-8 h-8 rounded-none font-bold text-sm"
                          style={{
                            backgroundColor: `${getRULAScoreColor(analysisResult.averageScores.wrist)}22`,
                            color: getRULAScoreColor(analysisResult.averageScores.wrist),
                          }}
                        >
                          {analysisResult.averageScores.wrist}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="bg-gray-950 rounded-none p-4 border border-gray-800">
                    <h3 className="text-sm font-semibold mb-3 text-amber-400">Groupe B (Cou & Tronc)</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center gap-2">
                        <span className="text-xs text-gray-500">Cou</span>
                        <div className="flex items-center gap-2">
                          {(() => {
                            const withAngles = analysisResult.frameData.filter((f) => f.angles != null);
                            const avgNeck = withAngles.length > 0
                              ? withAngles.reduce((s, f) => s + (f.angles!.neckDeg ?? 0), 0) / withAngles.length
                              : null;
                            return avgNeck !== null ? (
                              <span className="text-[10px] text-gray-500 font-mono">angle moy. {avgNeck.toFixed(0)}°</span>
                            ) : null;
                          })()}
                          <span
                            className="inline-flex items-center justify-center w-8 h-8 rounded-none font-bold text-sm"
                            style={{
                              backgroundColor: `${getRULAScoreColor(analysisResult.averageScores.neck)}22`,
                              color: getRULAScoreColor(analysisResult.averageScores.neck),
                            }}
                          >
                            {analysisResult.averageScores.neck}
                          </span>
                        </div>
                      </div>
                      <div className="flex justify-between items-center gap-2">
                        <span className="text-xs text-gray-500">Tronc</span>
                        <div className="flex items-center gap-2">
                          {(() => {
                            const withAngles = analysisResult.frameData.filter((f) => f.angles != null);
                            const avgTrunk = withAngles.length > 0
                              ? withAngles.reduce((s, f) => s + (f.angles!.trunkDeg ?? 0), 0) / withAngles.length
                              : null;
                            return avgTrunk !== null ? (
                              <span className="text-[10px] text-gray-500 font-mono">angle moy. {avgTrunk.toFixed(0)}°</span>
                            ) : null;
                          })()}
                          <span
                            className="inline-flex items-center justify-center w-8 h-8 rounded-none font-bold text-sm"
                            style={{
                              backgroundColor: `${getRULAScoreColor(analysisResult.averageScores.trunk)}22`,
                              color: getRULAScoreColor(analysisResult.averageScores.trunk),
                            }}
                          >
                            {analysisResult.averageScores.trunk}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="bg-gray-950 rounded-none p-4 border border-gray-800">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-semibold">Total RULA (moyenne)</span>
                    <span className="text-2xl font-bold font-mono text-yellow-500">
                      {rulaTotal(analysisResult.averageScores)}
                    </span>
                  </div>
                </div>

                <div className="bg-gray-950 rounded-none p-4 border border-gray-800">
                  <h3 className="text-sm font-semibold mb-2">Informations</h3>
                  <div className="space-y-2 text-sm text-gray-500">
                    <div>Durée: {Math.round(analysisResult.duration)}s</div>
                    <div>Frames analysées: {analysisResult.frameData.length}</div>
                    <div>
                      Fréquence: {Math.round(analysisResult.frameData.length / analysisResult.duration)} fps
                    </div>
                    {analysisResult.criticalMoments && (
                      <div className="pt-2 border-t border-gray-800">
                        Moments critiques: {analysisResult.criticalMoments.length}
                      </div>
                    )}
                  </div>
                </div>

                {/* Affichage des angles articulaires en temps réel */}
                {(jointAngles.knee.left !== null || jointAngles.knee.right !== null ||
                  jointAngles.shoulder.left !== null || jointAngles.shoulder.right !== null ||
                  jointAngles.elbow.left !== null || jointAngles.elbow.right !== null ||
                  jointAngles.pelvis.left !== null || jointAngles.pelvis.right !== null ||
                  rulaAngles.neckDeg !== null || rulaAngles.trunkDeg !== null) && (
                  <div className="bg-gray-950 rounded-none p-4 border border-gray-800">
                    <h3 className="text-sm font-semibold mb-3">Angles en temps réel</h3>
                    <div className="space-y-3 text-sm">
                      {(jointAngles.shoulder.left !== null || jointAngles.shoulder.right !== null) && (
                        <div className="border-b border-gray-800 pb-2">
                          <div className="text-gray-500 text-xs font-medium mb-1">Épaules</div>
                          <div className="flex gap-4">
                            {jointAngles.shoulder.left !== null && (
                              <span className="text-cyan-400 font-mono">G: {jointAngles.shoulder.left}°</span>
                            )}
                            {jointAngles.shoulder.right !== null && (
                              <span className="text-orange-400 font-mono">D: {jointAngles.shoulder.right}°</span>
                            )}
                          </div>
                        </div>
                      )}
                      {(jointAngles.elbow.left !== null || jointAngles.elbow.right !== null) && (
                        <div className="border-b border-gray-800 pb-2">
                          <div className="text-gray-500 text-xs font-medium mb-1">Coudes</div>
                          <div className="flex gap-4">
                            {jointAngles.elbow.left !== null && (
                              <span className="text-emerald-400 font-mono">G: {jointAngles.elbow.left}°</span>
                            )}
                            {jointAngles.elbow.right !== null && (
                              <span className="text-amber-400 font-mono">D: {jointAngles.elbow.right}°</span>
                            )}
                          </div>
                        </div>
                      )}
                      {(jointAngles.pelvis.left !== null || jointAngles.pelvis.right !== null) && (
                        <div className="border-b border-gray-800 pb-2">
                          <div className="text-gray-500 text-xs font-medium mb-1">Bassin (hanche)</div>
                          <div className="flex gap-4">
                            {jointAngles.pelvis.left !== null && (
                              <span className="text-violet-400 font-mono">G: {jointAngles.pelvis.left}°</span>
                            )}
                            {jointAngles.pelvis.right !== null && (
                              <span className="text-pink-400 font-mono">D: {jointAngles.pelvis.right}°</span>
                            )}
                          </div>
                        </div>
                      )}
                      {(jointAngles.knee.left !== null || jointAngles.knee.right !== null) && (
                        <div className="border-b border-gray-800 pb-2">
                          <div className="text-gray-500 text-xs font-medium mb-1">Genoux</div>
                          <div className="flex gap-4">
                            {jointAngles.knee.left !== null && (
                              <span className="text-blue-400 font-mono">G: {jointAngles.knee.left}°</span>
                            )}
                            {jointAngles.knee.right !== null && (
                              <span className="text-red-400 font-mono">D: {jointAngles.knee.right}°</span>
                            )}
                          </div>
                        </div>
                      )}
                      {(rulaAngles.neckDeg !== null || rulaAngles.trunkDeg !== null) && (
                        <div>
                          <div className="text-gray-500 text-xs font-medium mb-1">RULA — Cou & Tronc (pour vérification)</div>
                          <div className="flex gap-4">
                            {rulaAngles.neckDeg !== null && (
                              <span className="text-amber-400 font-mono">Cou: {rulaAngles.neckDeg.toFixed(0)}°</span>
                            )}
                            {rulaAngles.trunkDeg !== null && (
                              <span className="text-orange-400 font-mono">Tronc: {rulaAngles.trunkDeg.toFixed(0)}°</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="bg-gray-950 rounded-none p-4 border border-gray-800">
                <p className="text-sm text-gray-500 text-center">
                  {isAnalyzing 
                    ? "Analyse en cours..." 
                    : "Aucun résultat disponible. Chargez une vidéo et lancez l'analyse."}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Composant Heat Map Timeline
interface HeatMapTimelineProps {
  frameData: FrameData[];
  duration: number;
  onSegmentClick: (timestamp: number) => void;
}

function HeatMapTimeline({ frameData, duration, onSegmentClick }: HeatMapTimelineProps) {
  // Fonction utilitaire pour formater le temps
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${String(secs).padStart(2, "0")}`;
  };

  // Nombre de segments pour la heat map (ajustable)
  const segmentCount = Math.min(100, Math.max(20, Math.floor(duration / 2))); // Entre 20 et 100 segments
  const segmentDuration = duration / segmentCount;

  // Calculer le score moyen pour chaque segment
  const segments = Array.from({ length: segmentCount }, (_, i) => {
    const segmentStart = i * segmentDuration;
    const segmentEnd = (i + 1) * segmentDuration;

    // Trouver toutes les frames dans ce segment
    const framesInSegment = frameData.filter(
      (frame) => frame.timestamp >= segmentStart && frame.timestamp < segmentEnd
    );

    // Calculer le score total RULA moyen du segment
    let avgScore = 0;
    if (framesInSegment.length > 0) {
      avgScore =
        framesInSegment.reduce((sum, frame) => sum + rulaTotal(frame.scores), 0) /
        framesInSegment.length;
    }

    return {
      start: segmentStart,
      end: segmentEnd,
      avgScore,
      isHot: avgScore >= 6, // Moment "chaud" si score RULA (Table C) ≥ 6
    };
  });

  // Score RULA final 1-7 (Table C) → couleur officielle
  const getHeatMapColor = (totalRula: number): string => {
    if (totalRula === 0) return "#475569"; // Pas de données
    const level = Math.min(7, Math.max(1, Math.round(totalRula)));
    return getRULAScoreColor(level);
  };

  const legendLevels = [
    { label: "1", color: getRULAScoreColor(1) },
    { label: "2", color: getRULAScoreColor(2) },
    { label: "3", color: getRULAScoreColor(3) },
    { label: "4", color: getRULAScoreColor(4) },
    { label: "5", color: getRULAScoreColor(5) },
    { label: "6", color: getRULAScoreColor(6) },
    { label: "7", color: getRULAScoreColor(7) },
  ];

  return (
    <div className="w-full">
      <div className="bg-gray-950 rounded-none p-3 border border-gray-800">
        <div className="flex gap-1 mb-3" style={{ height: "48px" }}>
          {segments.map((segment, index) => (
            <div
              key={index}
              onClick={() => onSegmentClick(segment.start)}
              className="flex-1 cursor-pointer hover:brightness-110 transition-all rounded-none border border-gray-700"
              style={{
                backgroundColor: getHeatMapColor(segment.avgScore),
                minWidth: "2px",
              }}
              title={`${formatTime(segment.start)} - ${formatTime(segment.end)}: Score RULA moyen ${segment.avgScore.toFixed(1)} / 7`}
            />
          ))}
        </div>
        {/* Légende : échelle 1-7 (Table C) */}
        <div className="flex items-center justify-between text-xs text-gray-300 pt-2 border-t border-gray-800">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-gray-500 mr-1">Score RULA:</span>
            {legendLevels.map(({ label, color }) => (
              <div key={label} className="flex items-center gap-1">
                <div
                  className="w-3.5 h-3.5 rounded-none border border-gray-700 shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="font-mono text-[10px]">{label}</span>
              </div>
            ))}
            <span className="text-gray-500 text-[10px] ml-1">(1=acceptable → 7=critique)</span>
          </div>
          <div className="text-gray-500 font-mono text-[10px]">
            {formatTime(0)} — {formatTime(duration)}
          </div>
        </div>
      </div>
    </div>
  );
}
