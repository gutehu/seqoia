/**
 * SEQOIA - Scoring RULA (Rapid Upper Limb Assessment)
 * Implémentation stricte de la norme à partir des angles en degrés.
 * Référence: McAtamney & Corlett (1993), norme RULA.
 */

/** Scores RULA par articulation (1 = acceptable, 4 = risque élevé) */
export interface RULAScores {
  /** Groupe A */
  upperArm: number;
  lowerArm: number;
  wrist: number;
  /** Groupe B */
  neck: number;
  trunk: number;
}

/** Angles en degrés utilisés pour le calcul RULA */
export interface RULAAngles {
  /** Bras : angle par rapport à la verticale du tronc. Positif = flexion (avant), négatif = extension (arrière). */
  upperArmDeg: number;
  /** Avant-bras : angle de flexion du coude (épaule-coude-poignet). */
  lowerArmDeg: number;
  /** Poignet : angle de flexion/extension (coude-poignet-index). 0 = neutre. */
  wristDeg: number;
  /** Cou : angle de flexion de la tête. Positif = flexion (avant), négatif = extension (arrière). */
  neckDeg: number;
  /** Tronc : angle d'inclinaison par rapport à la verticale. >0 = flexion vers l'avant. */
  trunkDeg: number;
  /** Bonus : épaule haussée (Y épaule anormalement proche du Y nez). */
  shoulderRaised?: boolean;
}

/**
 * GROUPE A - Bras (Upper Arm)
 * Angle par rapport à la verticale du tronc.
 * - De -20° (extension) à +20° (flexion) = Score 1
 * - De >20° à +45° (flexion) OU < -20° (extension) = Score 2
 * - De >45° à 90° (flexion) = Score 3
 * - 90° (élévation au-dessus de l'épaule) = Score 4
 * Bonus : épaule haussée => +1
 */
export function scoreUpperArm(angleDeg: number, shoulderRaised?: boolean): number {
  let score: number;
  if (angleDeg >= -20 && angleDeg <= 20) {
    score = 1;
  } else if ((angleDeg > 20 && angleDeg <= 45) || angleDeg < -20) {
    score = 2;
  } else if (angleDeg > 45 && angleDeg < 90) {
    score = 3;
  } else {
    score = 4; // 90° ou plus (élévation)
  }
  if (shoulderRaised) score = Math.min(4, score + 1);
  return score;
}

/**
 * GROUPE A - Avant-bras (Lower Arm / Coude)
 * Angle de flexion du coude.
 * - Entre 60° et 100° = Score 1
 * - <60° ou >100° = Score 2
 */
export function scoreLowerArm(angleDeg: number): number {
  if (angleDeg >= 60 && angleDeg <= 100) return 1;
  return 2;
}

/**
 * GROUPE A - Poignet (Wrist)
 * Angle de flexion/extension (écart par rapport au neutre).
 * - Position neutre (0° à 15°) = Score 1
 * - Flexion ou extension >15° = Score 2
 * - Flexion ou extension extrême = Score 3 (|angle| > 45°)
 */
export function scoreWrist(angleDeg: number): number {
  const abs = Math.abs(angleDeg);
  if (abs <= 15) return 1;
  if (abs <= 45) return 2;
  return 3;
}

/**
 * GROUPE B - Cou (Neck)
 * Angle de déviation de la tête par rapport à la verticale (≥ 0°).
 * - 0° à 10° = Score 1
 * - >10° à 20° = Score 2
 * - >20° = Score 3
 * - Extension (tête en arrière) : non détectée si angle fourni en déviation absolue (< 0° → Score 4).
 */
export function scoreNeck(angleDeg: number): number {
  if (angleDeg < 0) return 4; // extension (si angle signé fourni)
  if (angleDeg <= 10) return 1;
  if (angleDeg <= 20) return 2;
  return 3; // > 20°
}

/**
 * GROUPE B - Tronc (Trunk)
 * Angle d'inclinaison par rapport à la verticale.
 * - Debout droit (0°) = Score 1
 * - Flexion >0° à 20° = Score 2
 * - Flexion >20° à 60° = Score 3
 * - Flexion >60° = Score 4
 */
export function scoreTrunk(angleDeg: number): number {
  const abs = Math.abs(angleDeg);
  if (abs <= 0) return 1;
  if (abs <= 20) return 2;
  if (abs <= 60) return 3;
  return 4;
}

/**
 * Calcule tous les scores RULA à partir des angles.
 */
export function computeRULAScores(angles: RULAAngles): RULAScores {
  return {
    upperArm: scoreUpperArm(angles.upperArmDeg, angles.shoulderRaised),
    lowerArm: scoreLowerArm(angles.lowerArmDeg),
    wrist: scoreWrist(angles.wristDeg),
    neck: scoreNeck(angles.neckDeg),
    trunk: scoreTrunk(angles.trunkDeg),
  };
}

/**
 * Table A RULA (McAtamney & Corlett).
 * [UpperArm-1][LowerArm-1][Wrist-1][WristTwist-1]
 * Upper Arm 1-6 | Lower Arm 1-3 | Wrist 1-4 | Wrist Twist 1-2
 */
export const TABLE_A: number[][][][] = [
  [
    [
      [1, 2],
      [2, 2],
      [2, 3],
      [3, 3],
    ],
    [
      [2, 2],
      [2, 2],
      [3, 3],
      [3, 3],
    ],
    [
      [2, 3],
      [3, 3],
      [3, 3],
      [4, 4],
    ],
  ],
  [
    [
      [2, 2],
      [2, 2],
      [3, 3],
      [3, 3],
    ],
    [
      [2, 2],
      [2, 2],
      [3, 3],
      [3, 3],
    ],
    [
      [3, 3],
      [3, 3],
      [4, 4],
      [4, 4],
    ],
  ],
  [
    [
      [2, 3],
      [3, 3],
      [3, 4],
      [4, 4],
    ],
    [
      [3, 3],
      [3, 3],
      [4, 4],
      [4, 4],
    ],
    [
      [4, 4],
      [4, 4],
      [4, 5],
      [5, 5],
    ],
  ],
  [
    [
      [3, 3],
      [3, 3],
      [4, 4],
      [4, 4],
    ],
    [
      [3, 3],
      [3, 3],
      [4, 4],
      [4, 4],
    ],
    [
      [4, 4],
      [4, 4],
      [5, 5],
      [5, 5],
    ],
  ],
  [
    [
      [4, 4],
      [4, 4],
      [4, 5],
      [5, 5],
    ],
    [
      [4, 4],
      [4, 4],
      [5, 5],
      [5, 5],
    ],
    [
      [4, 4],
      [4, 5],
      [5, 5],
      [5, 5],
    ],
  ],
  [
    [
      [5, 5],
      [5, 5],
      [6, 6],
      [7, 7],
    ],
    [
      [5, 6],
      [6, 6],
      [6, 7],
      [7, 7],
    ],
    [
      [6, 6],
      [6, 7],
      [7, 7],
      [7, 7],
    ],
  ],
];

/**
 * Table B RULA (McAtamney & Corlett).
 * [Neck-1][Trunk-1][Legs-1]
 * Neck 1-6 | Trunk 1-6 | Legs 1-2
 */
export const TABLE_B: number[][][] = [
  [
    [1, 3],
    [2, 3],
    [3, 4],
    [5, 5],
    [6, 6],
    [7, 7],
  ],
  [
    [2, 3],
    [2, 3],
    [4, 5],
    [5, 5],
    [6, 7],
    [7, 7],
  ],
  [
    [3, 3],
    [3, 4],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 7],
  ],
  [
    [5, 5],
    [5, 6],
    [6, 7],
    [7, 7],
    [7, 7],
    [7, 7],
  ],
  [
    [7, 7],
    [7, 7],
    [7, 7],
    [7, 7],
    [7, 7],
    [7, 7],
  ],
  [
    [7, 7],
    [7, 7],
    [7, 7],
    [7, 7],
    [7, 7],
    [7, 7],
  ],
];

/**
 * Table C RULA (McAtamney & Corlett).
 * Lignes = Score C (1-8), Colonnes = Score D (1-7).
 */
const TABLE_C: number[][] = [
  [1, 2, 3, 3, 4, 5, 5],
  [2, 2, 3, 4, 4, 5, 5],
  [3, 3, 3, 4, 4, 5, 6],
  [3, 3, 3, 4, 5, 6, 6],
  [4, 4, 4, 5, 6, 7, 7],
  [4, 4, 5, 6, 6, 7, 7],
  [5, 5, 6, 6, 7, 7, 7],
  [5, 5, 6, 7, 7, 7, 7],
];

/** Wrist Twist et Legs non mesurés : index 0 (valeur 1) par défaut. */
const DEFAULT_WRIST_TWIST = 1;
const DEFAULT_LEGS = 1;

/**
 * Score A : lecture stricte dans la Table A (pas d'addition).
 * Index clampés pour ne jamais dépasser les dimensions.
 */
function getScoreA(scores: RULAScores): number {
  const cUpper = Math.min(Math.max(scores.upperArm, 1), 6) - 1;
  const cLower = Math.min(Math.max(scores.lowerArm, 1), 3) - 1;
  const cWrist = Math.min(Math.max(scores.wrist, 1), 4) - 1;
  const cTwist = Math.min(Math.max(DEFAULT_WRIST_TWIST, 1), 2) - 1;
  return TABLE_A[cUpper][cLower][cWrist][cTwist];
}

/**
 * Score B : lecture stricte dans la Table B (pas d'addition).
 * Index clampés pour ne jamais dépasser les dimensions.
 */
function getScoreB(scores: RULAScores): number {
  const cNeck = Math.min(Math.max(scores.neck, 1), 6) - 1;
  const cTrunk = Math.min(Math.max(scores.trunk, 1), 6) - 1;
  const cLegs = Math.min(Math.max(DEFAULT_LEGS, 1), 2) - 1;
  return TABLE_B[cNeck][cTrunk][cLegs];
}

/**
 * Score C (Score A + Muscle + Force) : plafonné 1-8.
 */
function getScoreC(scores: RULAScores): number {
  const scoreA = getScoreA(scores);
  return Math.min(8, Math.max(1, scoreA));
}

/**
 * Score D (Score B + Muscle + Force) : plafonné 1-7.
 */
function getScoreD(scores: RULAScores): number {
  const scoreB = getScoreB(scores);
  return Math.min(7, Math.max(1, scoreB));
}

/**
 * Score final RULA (1-7) via la Table C uniquement.
 * Aucune addition scoreC + scoreD : lecture stricte dans la matrice.
 */
export function rulaTotal(scores: RULAScores): number {
  const clampedScoreC = Math.min(8, Math.max(1, getScoreC(scores)));
  const clampedScoreD = Math.min(7, Math.max(1, getScoreD(scores)));
  const row = clampedScoreC - 1;
  const col = clampedScoreD - 1;
  return TABLE_C[row][col];
}

/**
 * Couleur du badge selon le score RULA (1=Vert, 2=Jaune, 3=Orange, 4=Rouge, 5-7=Orange/Rouge).
 */
export function getRULAScoreColor(score: number): string {
  if (score === 0) return "#64748b";
  if (score === 1) return "#22c55e";
  if (score === 2) return "#eab308";
  if (score === 3) return "#f97316";
  if (score === 4) return "#ef4444";
  if (score === 5 || score === 6) return "#dc2626";
  return "#b91c1c"; // 7 = rouge foncé
}
