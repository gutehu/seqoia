"use client";

import { useState } from "react";
import { RULADetector } from "@/components/RULADetector";
import { VideoAnalyzer } from "@/components/VideoAnalyzer";
import { CustomTracking } from "@/components/CustomTracking";
import { Video, FileVideo, Target } from "lucide-react";

export type AppMode = "live" | "video" | "custom";

export default function Home() {
  const [mode, setMode] = useState<AppMode>("live");

  return (
    <div className="min-h-screen bg-black">
      {/* Navigation */}
      <div className="bg-black border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-green-400 font-mono">SEQOIA</h1>
            <span className="text-sm text-gray-500">Rapid Upper Limb Assessment</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setMode("live")}
              className={`px-4 py-2 rounded-none flex items-center gap-2 transition-colors ${
                mode === "live"
                  ? "bg-green-600 text-white"
                  : "bg-gray-900 text-gray-300 hover:bg-gray-800 border border-gray-700"
              }`}
            >
              <Video className="w-4 h-4" />
              Squelette / RULA
            </button>
            <button
              onClick={() => setMode("video")}
              className={`px-4 py-2 rounded-none flex items-center gap-2 transition-colors ${
                mode === "video"
                  ? "bg-green-600 text-white"
                  : "bg-gray-900 text-gray-300 hover:bg-gray-800 border border-gray-700"
              }`}
            >
              <FileVideo className="w-4 h-4" />
              Analyse vidéo
            </button>
            <button
              onClick={() => setMode("custom")}
              className={`px-4 py-2 rounded-none flex items-center gap-2 transition-colors ${
                mode === "custom"
                  ? "bg-green-600 text-white"
                  : "bg-gray-900 text-gray-300 hover:bg-gray-800 border border-gray-700"
              }`}
            >
              <Target className="w-4 h-4" />
              Analyse sur mesure
            </button>
          </div>
        </div>
      </div>

      {/* Contenu */}
      {mode === "live" && <RULADetector />}
      {mode === "video" && <VideoAnalyzer />}
      {mode === "custom" && <CustomTracking />}
    </div>
  );
}
