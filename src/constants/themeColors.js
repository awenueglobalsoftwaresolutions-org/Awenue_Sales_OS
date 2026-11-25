// Reusable Theme Color Tokens for Charts and Visual Visualizations
// All hex colors correspond directly to Tailwind palette colors

export const THEME_COLORS = {
  brand: '#4b4bc4',
  indigo: '#6366f1',
  violet: '#8b5cf6',
  sky: '#0ea5e9',
  emerald: '#10b981',
  amber: '#f59e0b',
  orange: '#f97316',
  rose: '#f43f5e',
  ink: '#3b4050',
  grid: '#eceef3',
}

// Reusable Stage Colors
export const STAGE_COLORS = [
  THEME_COLORS.sky,      // New Lead
  THEME_COLORS.indigo,   // Contacted
  THEME_COLORS.violet,   // Interested
  THEME_COLORS.amber,    // Meeting Scheduled
  THEME_COLORS.orange,   // Proposal Sent
  THEME_COLORS.emerald,  // Won
  THEME_COLORS.rose,     // Lost
]

// Reusable Source Colors
export const SOURCE_COLORS = [
  THEME_COLORS.brand,
  THEME_COLORS.emerald,
  THEME_COLORS.sky,
  THEME_COLORS.amber,
  THEME_COLORS.violet,
  THEME_COLORS.rose,
  THEME_COLORS.indigo,
  THEME_COLORS.orange,
]
