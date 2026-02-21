/**
 * SEQOIA - Structure de données pour l'enregistrement des sessions
 * Prête pour l'envoi vers Supabase
 */

export interface PoseDataPoint {
  timestamp: string; // ISO 8601
  angle_left_shoulder: number;
  angle_right_shoulder: number;
}

export interface SessionData {
  id?: string;
  started_at: string; // ISO 8601
  ended_at: string; // ISO 8601
  data_points: PoseDataPoint[];
  metadata?: {
    user_id?: string;
    device_info?: string;
    duration_seconds?: number;
  };
}
