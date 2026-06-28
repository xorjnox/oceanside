/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Nunito", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        ocean: {
          50:  "#f0f9ff",
          100: "#e0f2fe",
          200: "#bae6fd",
          300: "#7dd3fc",
          400: "#38bdf8",
          500: "#0ea5e9",
          600: "#0284c7",
          700: "#0369a1",
          800: "#075985",
          900: "#0c4a6e",
          950: "#082f49",
        },
        wave: {
          light: "#e0f2fe",
          mid:   "#7dd3fc",
          deep:  "#0369a1",
        },
      },
      backgroundImage: {
        "ocean-gradient": "linear-gradient(135deg, #e0f2fe 0%, #f0f9ff 40%, #bae6fd 100%)",
        "wave-gradient":  "linear-gradient(180deg, #0ea5e9 0%, #0369a1 100%)",
      },
      boxShadow: {
        "ocean-sm": "0 2px 8px rgba(3, 105, 161, 0.10)",
        "ocean":    "0 4px 20px rgba(3, 105, 161, 0.15)",
        "ocean-lg": "0 8px 40px rgba(3, 105, 161, 0.20)",
        "glass":    "0 8px 32px rgba(14, 165, 233, 0.12), inset 0 1px 0 rgba(255,255,255,0.6)",
      },
    },
  },
  plugins: [],
};
