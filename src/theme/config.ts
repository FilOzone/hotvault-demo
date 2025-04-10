export const theme = {
  colors: {
    primary: {
      blue: "#0090FF", // Filecoin blue
      black: "#000000", // Pure black
      white: "#FFFFFF", // Pure white
    },
    error: {
      600: "#DC2626", // red for error messages
    },
    text: {
      primary: "#000000", // Black for primary text
      secondary: "#0090FF", // Filecoin blue for secondary text
      disabled: "#9E9E9E",
      white: "#FFFFFF", // White for text on dark backgrounds
    },
    background: {
      primary: "#FFFFFF", // White background
      secondary: "#F8F8F8", // Slightly off-white for secondary backgrounds
      dark: "#000000", // Black background
    },
    border: {
      light: "#E5E5E5", // Light border
      dark: "#000000", // Dark border
      blue: "#0090FF", // Filecoin blue border
    },
  },
  typography: {
    fontFamily: {
      sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    },
    fontWeight: {
      light: "300",
      regular: "400",
      medium: "500",
      bold: "700",
    },
    fontSize: {
      xs: "0.75rem", // 12px
      sm: "0.875rem", // 14px
      base: "1rem", // 16px
      lg: "1.125rem", // 18px
      xl: "1.25rem", // 20px
      "2xl": "1.5rem", // 24px
      "3xl": "1.875rem", // 30px
      "4xl": "2.25rem", // 36px
      "5xl": "3rem", // 48px
    },
    letterSpacing: {
      tight: "-0.025em",
      normal: "0",
      wide: "0.025em",
      wider: "0.05em",
      widest: "0.25em",
    },
  },
  spacing: {
    0: "0",
    1: "0.25rem",
    2: "0.5rem",
    3: "0.75rem",
    4: "1rem",
    6: "1.5rem",
    8: "2rem",
    12: "3rem",
    16: "4rem",
    20: "5rem",
  },
  borderRadius: {
    none: "0",
    sm: "0.125rem",
    default: "0.25rem",
    lg: "0.5rem",
    full: "9999px",
  },
  borderWidth: {
    default: "1px",
    0: "0",
    2: "2px",
    4: "4px",
  },
  shadows: {
    none: "none",
    sm: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
    default: "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)",
    lg: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
  },
  transitions: {
    default: "all 0.2s ease-in-out",
    fast: "all 0.1s ease-in-out",
    slow: "all 0.3s ease-in-out",
  },
  containers: {
    sm: "640px",
    md: "768px",
    lg: "1024px",
    xl: "1280px",
    "2xl": "1536px",
  },
} as const;

// Type definitions for theme
export type Theme = typeof theme;
export type ThemeColors = typeof theme.colors;
export type ThemeTypography = typeof theme.typography;
export type ThemeSpacing = typeof theme.spacing;

// Helper functions
export const getColor = (path: keyof ThemeColors) => theme.colors[path];
export const getFontSize = (size: keyof typeof theme.typography.fontSize) =>
  theme.typography.fontSize[size];
export const getSpacing = (space: keyof ThemeSpacing) => theme.spacing[space];
