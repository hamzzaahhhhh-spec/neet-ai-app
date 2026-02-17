import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        baseBg: "var(--bg)",
        baseText: "var(--text)",
        panel: "var(--panel)",
        panelAlt: "var(--panel-alt)",
      },
      boxShadow: {
        soft: "0 12px 24px rgba(16, 24, 40, 0.08)"
      }
    },
  },
  plugins: [],
};

export default config;