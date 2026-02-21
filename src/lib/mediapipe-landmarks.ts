/**
 * SEQOIA - Indices des landmarks MediaPipe Pose
 * Référence: https://developers.google.com/mediapipe/solutions/vision/pose_landmarker
 */

export const POSE_LANDMARKS = {
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
} as const;

/**
 * Connexions MediaPipe Pose pour dessiner le squelette
 * Format: [index_start, index_end]
 */
export const POSE_CONNECTIONS: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 7], // Visage
  [0, 4], [4, 5], [5, 6], [6, 8], // Visage
  [9, 10], // Visage
  [11, 12], // Épaules
  [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19], // Bras gauche
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20], // Bras droit
  [11, 23], [12, 24], [23, 24], // Tronc
  [23, 25], [24, 26], [25, 27], [26, 28], [27, 29], [28, 30], [29, 31], [30, 32], [27, 31], [28, 32], // Jambes
];
