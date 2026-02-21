"use client";

import { useEffect, useRef } from "react";

export function PoseDetector() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const poseRef = useRef<any>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let animationFrameId: number | null = null;

    const init = async () => {
      try {
        console.log("🚀 Initialisation...");

        // Importer MediaPipe (enregistre Pose sur globalThis/window)
        await import("@mediapipe/pose");
        const { drawConnectors, drawLandmarks } = await import("@mediapipe/drawing_utils");
        console.log("✅ MediaPipe importé");

        const PoseConstructor =
          (typeof globalThis !== "undefined" && (globalThis as any).Pose) ||
          (typeof window !== "undefined" && (window as any).Pose);
        if (!PoseConstructor || typeof PoseConstructor !== "function") {
          throw new Error("MediaPipe Pose constructor not found on global");
        }
        const POSE_CONNECTIONS = (globalThis as any).POSE_CONNECTIONS ?? (typeof window !== "undefined" && (window as any).POSE_CONNECTIONS);
        const CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404";
        const pose = new PoseConstructor({
          locateFile: (file: string) => {
            if (file === "pose_solution_packed_assets_loader.js" && typeof window !== "undefined") {
              return window.location.origin + "/pose_solution_packed_assets_loader.js";
            }
            return `${CDN}/${file}`;
          },
        });

        console.log("✅ Instance Pose créée");

        // Configurer les options
        pose.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        console.log("✅ Options configurées");

        // Vérifier que onResults existe
        if (typeof pose.onResults !== 'function') {
          console.error("❌ pose.onResults n'est pas une fonction!");
          return;
        }

        // Callback pour les résultats
        pose.onResults((results: any) => {
          console.log("🎯🎯🎯 onResults APPELÉ!", results);
          
          const canvas = canvasRef.current;
          const video = videoRef.current;
          
          if (!canvas || !video) {
            console.warn("Canvas ou vidéo manquant");
            return;
          }

          const ctx = canvas.getContext("2d");
          if (!ctx) return;

          // Ajuster la taille du canvas
          if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
          }

          // Dessiner la vidéo
          ctx.save();
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          // Dessiner le squelette
          if (results.poseLandmarks && results.poseLandmarks.length > 0) {
            console.log(`✅ ${results.poseLandmarks.length} landmarks détectés`);
            
            drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS, {
              color: "#00FF00",
              lineWidth: 2,
            });
            
            drawLandmarks(ctx, results.poseLandmarks, {
              color: "#FF0000",
              lineWidth: 1,
              radius: 3,
            });
          } else {
            console.log("⚠️ Aucun landmark dans les résultats");
          }

          ctx.restore();
        });

        console.log("✅ onResults configuré");

        poseRef.current = pose;

        // Démarrer la webcam
        console.log("📹 Demande d'accès webcam...");
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720 },
        });
        console.log("✅ Webcam obtenue");

        const video = videoRef.current;
        if (!video) {
          console.error("❌ Référence vidéo manquante");
          return;
        }

        video.srcObject = stream;

        // Attendre les métadonnées
        await new Promise<void>((resolve) => {
          if (video.readyState >= 1) {
            resolve();
          } else {
            video.addEventListener("loadedmetadata", () => resolve(), { once: true });
          }
        });
        console.log("✅ Métadonnées chargées");

        // Lire la vidéo
        await video.play();
        console.log("✅ Vidéo en lecture");

        // Attendre que la vidéo ait des données
        await new Promise<void>((resolve) => {
          const check = () => {
            if (video.readyState >= 2 && video.videoWidth > 0) {
              console.log(`✅ Vidéo prête: ${video.videoWidth}x${video.videoHeight}`);
              resolve();
            } else {
              setTimeout(check, 50);
            }
          };
          check();
        });

        // Attendre que MediaPipe charge ses fichiers (important!)
        console.log("⏳ Attente du chargement des fichiers MediaPipe...");
        await new Promise(resolve => setTimeout(resolve, 2000));
        console.log("✅ Attente terminée");

        // Vérifier que pose est toujours valide
        if (!poseRef.current) {
          console.error("❌ poseRef.current est null!");
          return;
        }

        console.log("🔄 Démarrage de la boucle de traitement...");

        // Traiter les frames
        let frameCount = 0;
        const processFrame = async () => {
          // Log de diagnostic toutes les 60 frames
          if (frameCount === 0 || frameCount % 60 === 0) {
            console.log(`🔍 Diagnostic frame ${frameCount}:`, {
              videoReadyState: video.readyState,
              videoWidth: video.videoWidth,
              videoHeight: video.videoHeight,
              poseExists: !!poseRef.current,
              poseSendType: poseRef.current ? typeof poseRef.current.send : 'N/A'
            });
          }

          // readyState: 2 = HAVE_CURRENT_DATA, 3 = HAVE_FUTURE_DATA, 4 = HAVE_ENOUGH_DATA
          // Tous sont valides pour envoyer des frames
          if (video.readyState >= 2 && poseRef.current) {
            frameCount++;
            if (frameCount <= 10 || frameCount % 30 === 0) {
              console.log(`📹 Frame ${frameCount} envoyée à MediaPipe`);
            }
            try {
              if (typeof poseRef.current.send !== 'function') {
                console.error("❌ pose.send n'est pas une fonction!");
                return;
              }
              await poseRef.current.send({ image: video });
            } catch (error: any) {
              console.error("❌ Erreur lors de l'envoi:", error);
              console.error("Message:", error?.message);
            }
            } else {
              if (frameCount === 0) {
                console.warn("⚠️ Conditions non remplies:", {
                  readyState: video.readyState,
                  expectedReadyState: ">= 2",
                  poseExists: !!poseRef.current
                });
              }
            }
          animationFrameId = requestAnimationFrame(processFrame);
        };

        processFrame();
        console.log("✅ Boucle démarrée");

      } catch (error: any) {
        console.error("❌ Erreur lors de l'initialisation:", error);
        console.error("Stack:", error.stack);
      }
    };

    init();

    return () => {
      console.log("🧹 Nettoyage...");
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, []);

  return (
    <div className="relative inline-block">
      <video
        ref={videoRef}
        className="block"
        playsInline
        muted
        style={{ transform: "scaleX(-1)", maxWidth: "100vw", maxHeight: "100vh" }}
      />
      <canvas
        ref={canvasRef}
        className="absolute top-0 left-0 pointer-events-none"
        style={{ 
          transform: "scaleX(-1)",
          width: "100%",
          height: "100%"
        }}
      />
    </div>
  );
}
