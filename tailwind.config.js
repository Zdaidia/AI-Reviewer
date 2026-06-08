/**
 * Tailwind CSS Configuration
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        gray: {
          750: '#2d3748',
          850: '#1e293b',
        },
      },
    },
  },
  plugins: [],
}
