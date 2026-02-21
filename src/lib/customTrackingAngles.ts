/**
 * SEQOIA - Angles pour le mode Analyse Sur Mesure (Custom Tracking).
 * Agrège épaule/coude/poignet G/D (poseJointAngles + poignet), cou et tronc (RULA).
 */

import { calculateAllJointAngles } from "./poseJointAngles";
import { extractRULAAngles } from "./rulaAngles";

type Landmark = { x: number; y: number; z?: number };

const LEFT_ELBOW = 13;
const RIGHT_ELBOW = 14;
const LEFT_WRIST = 15;
const RIGHT_WRIST = 16;
const LEFT_INDEX = 19;
const RIGHT_INDEX = 20;

function angleAt(
  a: Landmark,
  b: Landmark,
  c: Landmark
): number {
  const bax = a.x - b.x;
  const bay = a.y - b.y;
  const bcx = c.x - b.x;
  const bcy = c.y - b.y;
  const dot = bax * bcx + bay * bcy;
  const magBa = Math.sqrt(bax * bax + bay * bay);
  const magBc = Math.sqrt(bcx * bcx + bcy * bcy);
  if (magBa === 0 || magBc === 0) return 0;
  const cosAngle = Math.max(-1, Math.min(1, dot / (magBa * magBc)));
  return (Math.acos(cosAngle) * 180) / Math.PI;
}

/** Identifiants des articulations pour le suivi sur mesure */
export type CustomJointId =
  | "left_shoulder"
  | "right_shoulder"
  | "left_elbow"
  | "right_elbow"
  | "left_wrist"
  | "right_wrist"
  | "neck"
  | "trunk";

/** Tous les angles nécessaires au custom tracking (degrés). */
export type CustomTrackingAngles = Partial<Record<CustomJointId, number>>;

/** Retourne les angles pour chaque articulation (null si non disponible). */
export function getCustomTrackingAngles(
  landmarks: Landmark[] | null | undefined,
  /** true = webcam miroir : left/right = côté utilisateur */
  mirrored: boolean = false
): CustomTrackingAngles {
  const out: CustomTrackingAngles = {};
  if (!landmarks || landmarks.length < 33) return out;

  const jointAngles = calculateAllJointAngles(landmarks);
  const leftEl = landmarks[LEFT_ELBOW];
  const rightEl = landmarks[RIGHT_ELBOW];
  const leftWr = landmarks[LEFT_WRIST];
  const rightWr = landmarks[RIGHT_WRIST];
  const leftIdx = landmarks[LEFT_INDEX];
  const rightIdx = landmarks[RIGHT_INDEX];

  const ls = jointAngles.shoulder.left;
  const rs = jointAngles.shoulder.right;
  const le = jointAngles.elbow.left;
  const re = jointAngles.elbow.right;
  if (ls !== null) out[mirrored ? "right_shoulder" : "left_shoulder"] = ls;
  if (rs !== null) out[mirrored ? "left_shoulder" : "right_shoulder"] = rs;
  if (le !== null) out[mirrored ? "right_elbow" : "left_elbow"] = le;
  if (re !== null) out[mirrored ? "left_elbow" : "right_elbow"] = re;

  const lw = leftEl && leftWr && leftIdx ? angleAt(leftEl, leftWr, leftIdx) : null;
  const rw = rightEl && rightWr && rightIdx ? angleAt(rightEl, rightWr, rightIdx) : null;
  if (lw != null) out[mirrored ? "right_wrist" : "left_wrist"] = lw;
  if (rw != null) out[mirrored ? "left_wrist" : "right_wrist"] = rw;

  const rula = extractRULAAngles(landmarks);
  if (rula) {
    out.neck = rula.neckDeg;
    out.trunk = rula.trunkDeg;
  }

  return out;
}

/** Libellés d’affichage par articulation */
export const CUSTOM_JOINT_LABELS: Record<CustomJointId, string> = {
  left_shoulder: "Épaule gauche",
  right_shoulder: "Épaule droite",
  left_elbow: "Coude gauche",
  right_elbow: "Coude droit",
  left_wrist: "Poignet gauche",
  right_wrist: "Poignet droit",
  neck: "Cou",
  trunk: "Tronc",
};
