# SEQOIA

Plateforme d'analyse des contraintes physiques via la posture. MVP utilisant MediaPipe Pose pour la détection des articulations en temps réel.

## Fonctionnalités

- **Détection pose** : Webcam + MediaPipe Pose avec dessin des points clés
- **Angles d'épaules** : Calcul en temps réel (tronc Hanche→Épaule, bras Épaule→Coude)
- **Dashboard** : Flux vidéo central, side panel avec angles, graphique Chart.js
- **Enregistrement** : Bouton "Enregistrer la session" pour exporter un JSON compatible Supabase

## Stack

- Next.js 14 (App Router), TypeScript, Tailwind CSS
- @mediapipe/pose, @mediapipe/drawing_utils, lucide-react, Chart.js

## Installation

```bash
npm install
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000).

## Structure JSON (Supabase)

```json
{
  "started_at": "2025-02-16T10:00:00.000Z",
  "ended_at": "2025-02-16T10:05:00.000Z",
  "data_points": [
    {
      "timestamp": "2025-02-16T10:00:00.500Z",
      "angle_left_shoulder": 85,
      "angle_right_shoulder": 82
    }
  ],
  "metadata": { "duration_seconds": 300 }
}
```

Utiliser `src/lib/supabase-utils.ts` pour préparer l'envoi vers Supabase.
