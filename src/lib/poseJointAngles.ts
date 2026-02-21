/**
 * Angles articulaires et dessin squelette + angles (partagé direct / vidéo).
 */

export type SideAngles = { left: number | null; right: number | null };

export type JointAngles = {
  knee: SideAngles;
  shoulder: SideAngles;
  elbow: SideAngles;
  pelvis: SideAngles;
};

const empty: SideAngles = { left: null, right: null };

function angleBetweenPoints(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number }
): number {
  const baX = p1.x - p2.x;
  const baY = p1.y - p2.y;
  const bcX = p3.x - p2.x;
  const bcY = p3.y - p2.y;
  const dot = baX * bcX + baY * bcY;
  const magBA = Math.sqrt(baX * baX + baY * baY);
  const magBC = Math.sqrt(bcX * bcX + bcY * bcY);
  if (magBA === 0 || magBC === 0) return 0;
  const cosAngle = Math.max(-1, Math.min(1, dot / (magBA * magBC)));
  return Math.round((Math.acos(cosAngle) * 180) / Math.PI);
}

/** Calcule tous les angles (résistant si corps partiel). */
export function calculateAllJointAngles(
  landmarks: Array<{ x: number; y: number; z?: number }>
): JointAngles {
  if (!landmarks || landmarks.length < 33) {
    return { knee: empty, shoulder: empty, elbow: empty, pelvis: empty };
  }

  const L = 11, R = 12, LE = 13, RE = 14, LW = 15, RW = 16;
  const LH = 23, RH = 24, LK = 25, RK = 26, LA = 27, RA = 28;

  const kneeLeft =
    landmarks[LH] && landmarks[LK] && landmarks[LA]
      ? angleBetweenPoints(landmarks[LH], landmarks[LK], landmarks[LA])
      : null;
  const kneeRight =
    landmarks[RH] && landmarks[RK] && landmarks[RA]
      ? angleBetweenPoints(landmarks[RH], landmarks[RK], landmarks[RA])
      : null;

  const shoulderLeft =
    landmarks[LH] && landmarks[L] && landmarks[LE]
      ? angleBetweenPoints(landmarks[LH], landmarks[L], landmarks[LE])
      : null;
  const shoulderRight =
    landmarks[RH] && landmarks[R] && landmarks[RE]
      ? angleBetweenPoints(landmarks[RH], landmarks[R], landmarks[RE])
      : null;

  const elbowLeft =
    landmarks[L] && landmarks[LE] && landmarks[LW]
      ? angleBetweenPoints(landmarks[L], landmarks[LE], landmarks[LW])
      : null;
  const elbowRight =
    landmarks[R] && landmarks[RE] && landmarks[RW]
      ? angleBetweenPoints(landmarks[R], landmarks[RE], landmarks[RW])
      : null;

  const pelvisLeft =
    landmarks[L] && landmarks[LH] && landmarks[LK]
      ? angleBetweenPoints(landmarks[L], landmarks[LH], landmarks[LK])
      : null;
  const pelvisRight =
    landmarks[R] && landmarks[RH] && landmarks[RK]
      ? angleBetweenPoints(landmarks[R], landmarks[RH], landmarks[RK])
      : null;

  return {
    knee: { left: kneeLeft, right: kneeRight },
    shoulder: { left: shoulderLeft, right: shoulderRight },
    elbow: { left: elbowLeft, right: elbowRight },
    pelvis: { left: pelvisLeft, right: pelvisRight },
  };
}

/** Dessine squelette + labels d’angles sur le canvas. */
export function drawAllJointAngles(
  ctx: CanvasRenderingContext2D,
  landmarks: Array<{ x: number; y: number; z?: number }>,
  angles: JointAngles,
  width: number,
  height: number,
  /** true = webcam miroir : afficher G/D côté utilisateur (inverse image) */
  mirrored: boolean = false
): void {
  ctx.clearRect(0, 0, width, height);

  const L = 11, R = 12, LE = 13, RE = 14, LW = 15, RW = 16;
  const LH = 23, RH = 24, LK = 25, RK = 26, LA = 27, RA = 28;

  const toPixel = (x: number, y: number) => ({ x: x * width, y: y * height });

  const drawSegment = (
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    p3: { x: number; y: number },
    label: string,
    color: string,
    textOffsetY: number
  ) => {
    const a = toPixel(p1.x, p1.y);
    const b = toPixel(p2.x, p2.y);
    const c = toPixel(p3.x, p3.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = "bold 14px Arial";
    ctx.fillText(label, b.x + 6, b.y + textOffsetY);
  };

  const lbl = (leftLabel: string, rightLabel: string) =>
    mirrored ? [rightLabel, leftLabel] : [leftLabel, rightLabel];
  const [epG, epD] = lbl("Ép G", "Ép D");
  const [cdG, cdD] = lbl("Cd G", "Cd D");
  const [bsG, bsD] = lbl("Bs G", "Bs D");
  const [gnG, gnD] = lbl("Gn G", "Gn D");

  if (angles.shoulder.left !== null) {
    const a = landmarks[LH], b = landmarks[L], c = landmarks[LE];
    if (a && b && c) drawSegment(a, b, c, `${epG}: ${angles.shoulder.left}°`, "#06b6d4", -8);
  }
  if (angles.shoulder.right !== null) {
    const a = landmarks[RH], b = landmarks[R], c = landmarks[RE];
    if (a && b && c) drawSegment(a, b, c, `${epD}: ${angles.shoulder.right}°`, "#f97316", -8);
  }
  if (angles.elbow.left !== null) {
    const a = landmarks[L], b = landmarks[LE], c = landmarks[LW];
    if (a && b && c) drawSegment(a, b, c, `${cdG}: ${angles.elbow.left}°`, "#10b981", 4);
  }
  if (angles.elbow.right !== null) {
    const a = landmarks[R], b = landmarks[RE], c = landmarks[RW];
    if (a && b && c) drawSegment(a, b, c, `${cdD}: ${angles.elbow.right}°`, "#f59e0b", 4);
  }
  if (angles.pelvis.left !== null) {
    const a = landmarks[L], b = landmarks[LH], c = landmarks[LK];
    if (a && b && c) drawSegment(a, b, c, `${bsG}: ${angles.pelvis.left}°`, "#8b5cf6", -20);
  }
  if (angles.pelvis.right !== null) {
    const a = landmarks[R], b = landmarks[RH], c = landmarks[RK];
    if (a && b && c) drawSegment(a, b, c, `${bsD}: ${angles.pelvis.right}°`, "#ec4899", -20);
  }
  if (angles.knee.left !== null) {
    const a = landmarks[LH], b = landmarks[LK], c = landmarks[LA];
    if (a && b && c) drawSegment(a, b, c, `${gnG}: ${angles.knee.left}°`, "#3b82f6", 4);
  }
  if (angles.knee.right !== null) {
    const a = landmarks[RH], b = landmarks[RK], c = landmarks[RA];
    if (a && b && c) drawSegment(a, b, c, `${gnD}: ${angles.knee.right}°`, "#ef4444", 4);
  }
}
