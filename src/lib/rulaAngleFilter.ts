/**
 * SEQOIA - Filtrage robuste des angles RULA en 3 couches
 * pour limiter les glitches MediaPipe et stabiliser les scores.
 *
 * 1. Seuil de confiance (visibility)
 * 2. Filtre médian (rejet des outliers) — bufferSize par articulation
 * 3. Contrainte biomécanique (clamp vélocité) + deadzone pour le cou
 */

import { extractRULAAngles } from "./rulaAngles";
import type { RULAAngles } from "./rulaScoring";

/** Landmark MediaPipe avec optional visibility (0-1) */
export type LandmarkWithVisibility = {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
};

const VISIBILITY_THRESHOLD = 0.65;
const VELOCITY_CLAMP_DEG = 50;

const RULA_ANGLE_KEYS = [
  "upperArmDeg",
  "lowerArmDeg",
  "wristDeg",
  "neckDeg",
  "trunkDeg",
] as const;

/** Taille du buffer médian par articulation : peu de lissage pour réactivité. */
const BUFFER_SIZE_BY_ANGLE: Record<(typeof RULA_ANGLE_KEYS)[number], number> = {
  upperArmDeg: 2,
  lowerArmDeg: 2,
  wristDeg: 2,
  trunkDeg: 2,
  neckDeg: 6,
};

/** Zone morte pour le cou (degrés) : ignore les variations < 6° pour éviter clignotement du score. */
const NECK_DEADZONE_DEG = 6;

/** Indices des landmarks utilisés par extractRULAAngles */
const RULA_LANDMARK_INDICES = [
  0, 7, 8, 11, 12, 13, 14, 15, 16, 19, 20, 23, 24, 25, 26,
] as const;

function median(sortedValues: number[]): number {
  if (sortedValues.length === 0) return 0;
  const s = [...sortedValues].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  if (s.length % 2 === 1) return s[mid];
  return (s[mid - 1] + s[mid]) / 2;
}

/**
 * Filtre en 3 couches pour les angles RULA.
 * À utiliser avant d'appeler computeRULAScores.
 */
export class RULAAngleFilter {
  private lastValidAngles: RULAAngles | null = null;
  private lastOutput: RULAAngles | null = null;
  private buffers: Record<(typeof RULA_ANGLE_KEYS)[number], number[]> = {
    upperArmDeg: [],
    lowerArmDeg: [],
    wristDeg: [],
    neckDeg: [],
    trunkDeg: [],
  };

  /**
   * Couche 1 : Vérifie que tous les landmarks nécessaires ont visibility > 0.65.
   * Si un point est en dessous, on ignore la frame et on garde la dernière valeur valide.
   */
  private allLandmarksVisible(landmarks: LandmarkWithVisibility[]): boolean {
    if (!landmarks || landmarks.length < 33) return false;
    for (const i of RULA_LANDMARK_INDICES) {
      const lm = landmarks[i];
      if (!lm) return false;
      const vis = lm.visibility ?? 1;
      if (vis < VISIBILITY_THRESHOLD) return false;
    }
    return true;
  }

  /**
   * Traite une frame : visibilité → extraction → médiane → clamp vélocité.
   * Retourne les angles filtrés à envoyer au moteur RULA, ou null.
   */
  process(landmarks: LandmarkWithVisibility[]): RULAAngles | null {
    // Couche 1 : seuil de confiance
    if (!this.allLandmarksVisible(landmarks)) {
      return this.lastValidAngles;
    }

    const raw = extractRULAAngles(landmarks);
    if (!raw) return this.lastValidAngles;

    const filtered: RULAAngles = {
      upperArmDeg: 0,
      lowerArmDeg: 0,
      wristDeg: 0,
      neckDeg: 0,
      trunkDeg: 0,
      shoulderRaised: raw.shoulderRaised,
    };

    for (const key of RULA_ANGLE_KEYS) {
      const bufferSize = BUFFER_SIZE_BY_ANGLE[key];
      const buf = this.buffers[key];
      buf.push(raw[key]);
      while (buf.length > bufferSize) buf.shift();
      const medianValue = median(buf);

      // Couche 2b : zone morte uniquement pour le cou (évite clignotement 1↔2)
      let outputValue = medianValue;
      if (key === "neckDeg" && this.lastOutput !== null) {
        const diff = Math.abs(medianValue - this.lastOutput.neckDeg);
        if (diff < NECK_DEADZONE_DEG) {
          outputValue = this.lastOutput.neckDeg;
        }
      }

      // Couche 3 : contrainte biomécanique (vélocité max 30° par step)
      if (this.lastOutput !== null) {
        const delta = Math.abs(outputValue - this.lastOutput[key]);
        if (delta > VELOCITY_CLAMP_DEG) {
          outputValue = this.lastOutput[key];
        }
      }
      filtered[key] = outputValue;
    }

    this.lastOutput = { ...filtered };
    this.lastValidAngles = { ...filtered };
    return filtered;
  }

  /** Réinitialise l'état du filtre (nouvelle analyse). */
  reset(): void {
    this.lastValidAngles = null;
    this.lastOutput = null;
    for (const key of RULA_ANGLE_KEYS) {
      this.buffers[key] = [];
    }
  }
}
