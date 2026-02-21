import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        tech: ["var(--font-tech)", "JetBrains Mono", "Fira Code", "monospace"],
      },
      colors: {
        seqoia: {
          surface: "#0f1419",
          card: "#1a2332",
          accent: "#00d4aa",
          muted: "#64748b",
          border: "#334155",
        },
      },
    },
  },
  plugins: [],
};
export default config;
