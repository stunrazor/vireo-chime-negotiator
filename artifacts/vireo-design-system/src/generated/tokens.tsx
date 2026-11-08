/* GENERATED FROM tokens.json -- DO NOT EDIT. Run scripts/build-tokens.mjs. */
// Portable design tokens (colors as hex). Web consumes the theme via
// src/index.css; mobile (Expo) and any other platform import this object so the
// whole product shares one source of truth.
export const tokens = {
  "color": {
    "light": {
      "background": "#F6F2E9",
      "foreground": "#30243B",
      "border": "#DED6CC",
      "card": "#FFFCF7",
      "cardForeground": "#30243B",
      "popover": "#FFFCF7",
      "popoverForeground": "#30243B",
      "primary": "#4B3159",
      "primaryForeground": "#FFF9ED",
      "secondary": "#EEE7F0",
      "secondaryForeground": "#4B3159",
      "muted": "#F1ECE3",
      "mutedForeground": "#6E6472",
      "accent": "#E4B957",
      "accentForeground": "#30243B",
      "destructive": "#B42318",
      "destructiveForeground": "#FFFFFF",
      "input": "#D7CCBF",
      "ring": "#8D5E9D",
      "chart1": "#4B3159",
      "chart2": "#8D5E9D",
      "chart3": "#C18F32",
      "chart4": "#65768D",
      "chart5": "#927B8A",
      "sidebar": "#F0EAF2",
      "sidebarForeground": "#30243B",
      "sidebarBorder": "#DED6CC",
      "sidebarPrimary": "#4B3159",
      "sidebarPrimaryForeground": "#FFF9ED",
      "sidebarAccent": "#EEE7F0",
      "sidebarAccentForeground": "#4B3159",
      "sidebarRing": "#8D5E9D"
    },
    "dark": {
      "background": "#211927",
      "foreground": "#F6F2E9",
      "border": "#493A50",
      "card": "#2A2031",
      "cardForeground": "#F6F2E9",
      "popover": "#2A2031",
      "popoverForeground": "#F6F2E9",
      "primary": "#E4B957",
      "primaryForeground": "#30243B",
      "secondary": "#392E42",
      "secondaryForeground": "#F6F2E9",
      "muted": "#33293C",
      "mutedForeground": "#C4B8C9",
      "accent": "#4B3159",
      "accentForeground": "#F6F2E9",
      "destructive": "#F08076",
      "destructiveForeground": "#211927",
      "input": "#54475B",
      "ring": "#D6B8E3",
      "chart1": "#D6B8E3",
      "chart2": "#E4B957",
      "chart3": "#B28BC1",
      "chart4": "#A7B5C7",
      "chart5": "#C18F32",
      "sidebar": "#1B1421",
      "sidebarForeground": "#F6F2E9",
      "sidebarBorder": "#493A50",
      "sidebarPrimary": "#E4B957",
      "sidebarPrimaryForeground": "#30243B",
      "sidebarAccent": "#392E42",
      "sidebarAccentForeground": "#F6F2E9",
      "sidebarRing": "#D6B8E3"
    }
  },
  "fontFamily": {
    "sans": [
      "Mulish",
      "sans-serif"
    ],
    "serif": [
      "Newsreader",
      "Georgia",
      "serif"
    ],
    "mono": [
      "DM Mono",
      "monospace"
    ]
  },
  "radius": "1rem",
  "spacing": "0.25rem"
} as const;

export type Tokens = typeof tokens;
export default tokens;
