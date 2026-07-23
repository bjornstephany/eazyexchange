import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Landing "Cleared for departure" palette
        ink: {
          DEFAULT: "#0C1E2E",
          800: "#12293B",
          700: "#1B384C",
          muted: "#7C93A2",
        },
        paper: {
          DEFAULT: "#F3F4F2",
          card: "#FBFBFA",
          line: "#DFE3E0",
        },
        cleared: {
          DEFAULT: "#22B573",
          soft: "#1D9E64",
        },
        boarding: {
          DEFAULT: "#E9A23B",
        },
        stamp: {
          DEFAULT: "#C64B3B",
        },
        // Redesign tokens (design handoff, 2026-07)
        navy: "#10203F",
        rail: { DEFAULT: "#0E1B38", inactive: "#8595B8" },
        brand: { DEFAULT: "#2456E6", hover: "#1D48C7", accent: "#3B6EF6", soft: "#EDF2FE" },
        tint: { DEFAULT: "#E6ECFD", border: "#C8D6FA", text: "#1D48C7" },
        success: { DEFAULT: "#DCF3E6", text: "#0F7A3D" },
        warn: { DEFAULT: "#FCF0DB", text: "#9A6B15" },
        danger: { DEFAULT: "#FBE7E4", text: "#C0392B" },
        subtle: "#F1F4F9",
        hoverrow: { DEFAULT: "#F7F9FE", soft: "#FAFBFE" },
        hint: "#F5F7FC",
        placeholder: "#9AA6C0",
        tertiary: "#8A97B2",
        track: "#DDE3EF",
        frame: { DEFAULT: "#C4CDE0", dashed: "#D6DCEA" },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        card: "18px",
        pill: "999px",
      },
      boxShadow: {
        float: "0 18px 40px -30px rgba(16,32,63,.25)",
        modal: "0 40px 80px -40px rgba(6,12,28,.6)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
