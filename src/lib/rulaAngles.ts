/**
 * SEQOIA - Extraction des angles pour le scoring RULA à partir des landmarks MediaPipe Pose.
 * Les angles sont calculés en degrés pour correspondre à la norme RULA.
 */

import type { RULAAngles } from "./rulaScoring";

/** Landmark avec x, y (normalisés 0-1), y vers le bas dans MediaPipe */
type Landmark = { x: number; y: number; z?: number };

const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const LEFT_ELBOW = 13;
const RIGHT_ELBOW = 14;
const LEFT_WRIST = 15;
const RIGHT_WRIST = 16;
const LEFT_INDEX = 19;
const RIGHT_INDEX = 20;
const NOSE = 0;
const LEFT_EAR = 7;
const RIGHT_EAR = 8;
const LEFT_HIP = 23;
const RIGHT_HIP = 24;
const LEFT_KNEE = 25;
const RIGHT_KNEE = 26;

/**
 * Angle entre deux vecteurs en degrés (0-180).
 * point2 est le sommet de l'angle (b).
 */
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

/**
 * Angle de déviation absolue du segment (pointA → pointB) par rapport à l'axe vertical Y.
 * Référence biomécanique : pointA = point supérieur (ex. épaule), pointB = point inférieur (ex. hanche).
 * En coordonnées image : Y vers le bas, verticale = (0, 1). Posture droite → 0°.
 *
 * @param pointA Point supérieur (ex. Épaule pour tronc, Oreille pour cou)
 * @param pointB Point inférieur (ex. Hanche pour tronc, Épaule pour cou)
 * @returns Angle en degrés [0, 90], 0° = parfaitement aligné à la verticale
 */
function calculateVerticalAngle(pointA: Landmark, pointB: Landmark): number {
  const dx = pointB.x - pointA.x;
  const dy = pointB.y - pointA.y;
  if (dy === 0 && dx === 0) return 0;
  const angleRadians = Math.atan2(Math.abs(dx), dy);
  let angleDegrees = angleRadians * (180 / Math.PI);
  if (angleDegrees < 0) angleDegrees = 0;
  if (angleDegrees > 90) angleDegrees = 90;
  if (angleDegrees < 5) angleDegrees = 0;
  return angleDegrees;
}

/**
 * Angle signé du segment (p1 → p2) par rapport à la verticale (0, 1).
 * Utilisé pour le bras uniquement : positif = flexion/levé, négatif = extension/arrière.
 */
function signedAngleFromVertical(p1: Landmark, p2: Landmark): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return 0;
  const angleRad = Math.atan2(dx, dy);
  let deg = (angleRad * 180) / Math.PI;
  if (deg > 180) deg -= 360;
  if (deg < -180) deg += 360;
  return deg;
}

/**
 * Détecte si l'épaule est haussée (Y épaule anormalement proche du Y nez).
 */
function isShoulderRaised(shoulder: Landmark, nose: Landmark): boolean {
  const dy = Math.abs(shoulder.y - nose.y);
  return dy < 0.15;
}

/**
 * Extrait tous les angles RULA pour le côté gauche ou droit.
 * Utilise le côté gauche si disponible, sinon le droit.
 */
export function extractRULAAngles(landmarks: Landmark[]): RULAAngles | null {
  if (!landmarks || landmarks.length < 33) return null;

  const nose = landmarks[NOSE];
  const leftSh = landmarks[LEFT_SHOULDER];
  const rightSh = landmarks[RIGHT_SHOULDER];
  const leftEl = landmarks[LEFT_ELBOW];
  const rightEl = landmarks[RIGHT_ELBOW];
  const leftWr = landmarks[LEFT_WRIST];
  const rightWr = landmarks[RIGHT_WRIST];
  const leftIdx = landmarks[LEFT_INDEX];
  const rightIdx = landmarks[RIGHT_INDEX];
  const leftEar = landmarks[LEFT_EAR];
  const rightEar = landmarks[RIGHT_EAR];
  const leftHip = landmarks[LEFT_HIP];
  const rightHip = landmarks[RIGHT_HIP];
  const leftKnee = landmarks[LEFT_KNEE];
  const rightKnee = landmarks[RIGHT_KNEE];

  if (!nose || !leftSh || !leftEl || !leftWr || !leftIdx || !leftEar || !leftHip || !leftKnee) return null;
  if (!rightSh || !rightEl || !rightWr || !rightIdx || !rightEar || !rightHip || !rightKnee) return null;

  // Utiliser le côté gauche pour une posture typique (sinon on peut moyenner les deux)
  const shoulder = leftSh;
  const elbow = leftEl;
  const wrist = leftWr;
  const index = leftIdx;
  const ear = leftEar;
  const hip = leftHip;
  const knee = leftKnee;

  // Bras : angle signé par rapport à la verticale (positif = flexion/levé, négatif = extension/arrière).
  const upperArmDeg = signedAngleFromVertical(shoulder, elbow);

  // Avant-bras : angle de flexion du coude (épaule-coude-poignet).
  const lowerArmDeg = angleAt(shoulder, elbow, wrist);

  // Poignet : écart par rapport au neutre (alignement coude-poignet-index ≈ 180°). Valeur absolue 0-90°.
  const wristAngle = angleAt(elbow, wrist, index);
  const wristDeg = Math.min(90, Math.abs(wristAngle - 180));

  // Milieu des épaules et des hanches (réutilisés pour cou et tronc)
  const midShoulder = { x: (leftSh.x + rightSh.x) / 2, y: (leftSh.y + rightSh.y) / 2 };
  const midHip = { x: (leftHip.x + rightHip.x) / 2, y: (leftHip.y + rightHip.y) / 2 };

  // Cou : déviation absolue par rapport à la verticale (segment Nez → Mid-Shoulder).
  // Le Nez est plus stable que l'oreille sur l'axe Z dans MediaPipe → moins de bruit.
  const neckDeg = calculateVerticalAngle(nose, midShoulder);

  // Tronc : déviation absolue par rapport à la verticale (segment Épaule → Hanche). Posture droite = 0°.
  const trunkDeg = calculateVerticalAngle(midShoulder, midHip);

  const shoulderRaised = nose ? (isShoulderRaised(leftSh, nose) || isShoulderRaised(rightSh, nose)) : false;

  return {
    upperArmDeg,
    lowerArmDeg,
    wristDeg,
    neckDeg,
    trunkDeg,
    shoulderRaised,
  };
}
