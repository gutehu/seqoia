import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SEQOIA - Détection de pose",
  description: "Affichage du squelette MediaPipe Pose",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className="m-0 p-0 bg-black text-white">{children}</body>
    </html>
  );
}
