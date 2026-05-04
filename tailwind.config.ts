import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        mtg: {
          white: "#fffbd5",
          blue: "#aae0fa",
          black: "#cbc2bf",
          red: "#f9aa8f",
          green: "#9bd3ae",
          gold: "#d3b27a",
          colorless: "#cac5c0",
          land: "#a9876e",
        },
        bg: {
          base: "#0d1117",
          panel: "#161b22",
          raised: "#1f2630",
          border: "#2d3340",
        },
      },
      fontFamily: {
        display: ["Cinzel", "ui-serif", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};

export default config;
