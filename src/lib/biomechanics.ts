/**
 * SEQOIA - Utilitaires biomécaniques
 * Calcul des angles articulaires pour l'analyse posturale
 */

export interface Point2D {
  x: number;
  y: number;
}

export interface Point3D extends Point2D {
  z: number;
}

/**
 * Calcule l'angle au point b (sommet) formé par les trois points a, b, c.
 * Utilise Math.atan2 pour une précision maximale.
 *
 * @param a - Point proximal (ex: Hanche)
 * @param b - Sommet de l'angle (ex: Épaule)
 * @param c - Point distal (ex: Coude)
 * @returns Angle en degrés (0-180°)
 */
export function calculateAngle(
  a: Point2D | Point3D,
  b: Point2D | Point3D,
  c: Point2D | Point3D
): number {
  // Vecteur BA (de b vers a)
  const baX = a.x - b.x;
  const baY = a.y - b.y;

  // Vecteur BC (de b vers c)
  const bcX = c.x - b.x;
  const bcY = c.y - b.y;

  // Angle du vecteur BA par rapport à l'axe des x
  const angleBA = Math.atan2(baY, baX);

  // Angle du vecteur BC par rapport à l'axe des x
  const angleBC = Math.atan2(bcY, bcX);

  // Différence d'angle en radians
  let angleRad = Math.abs(angleBA - angleBC);

  // Normaliser entre 0 et PI
  if (angleRad > Math.PI) {
    angleRad = 2 * Math.PI - angleRad;
  }

  // Convertir en degrés
  return Math.round((angleRad * 180) / Math.PI);
}

/**
 * Variante 3D utilisant le produit scalaire pour plus de précision en biomécanique.
 * Angle = arccos((BA · BC) / (|BA| * |BC|))
 */
export function calculateAngle3D(
  a: Point3D,
  b: Point3D,
  c: Point3D
): number {
  const baX = a.x - b.x;
  const baY = a.y - b.y;
  const baZ = a.z - b.z;

  const bcX = c.x - b.x;
  const bcY = c.y - b.y;
  const bcZ = c.z - b.z;

  // Produit scalaire BA · BC
  const dotProduct = baX * bcX + baY * bcY + baZ * bcZ;

  // Normes
  const magBA = Math.sqrt(baX * baX + baY * baY + baZ * baZ);
  const magBC = Math.sqrt(bcX * bcX + bcY * bcY + bcZ * bcZ);

  if (magBA === 0 || magBC === 0) return 0;

  const cosAngle = Math.max(-1, Math.min(1, dotProduct / (magBA * magBC)));
  const angleRad = Math.acos(cosAngle);

  return Math.round((angleRad * 180) / Math.PI);
}
