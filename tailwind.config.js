/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#fdf2f8",
          500: "#d946ef",
          600: "#c026d3",
          700: "#a21caf",
        },
      },
    },
  },
  plugins: [],
};
