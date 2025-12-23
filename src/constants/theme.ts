/**
 * PANDEMIC - Design System & Theme
 * 
 * Aesthetic: Dark, underground, raw - like a warehouse party
 * Colors inspired by: neon signs, concrete, smoke
 */

export const Colors = {
  // Core palette
  background: '#0A0A0B',
  surface: '#141416',
  surfaceElevated: '#1C1C1F',
  surfaceHighlight: '#242428',
  
  // Primary - Vibrant pink/magenta (neon sign)
  primary: '#FF2D6A',
  primaryMuted: '#CC2455',
  primaryGlow: 'rgba(255, 45, 106, 0.3)',
  
  // Secondary - Electric cyan
  secondary: '#00F5D4',
  secondaryMuted: '#00C4AA',
  secondaryGlow: 'rgba(0, 245, 212, 0.3)',
  
  // Accent - Warm amber
  accent: '#FFB800',
  accentMuted: '#CC9300',
  
  // Text
  textPrimary: '#FFFFFF',
  textSecondary: '#A0A0A5',
  textMuted: '#606065',
  textInverse: '#0A0A0B',
  
  // Status
  success: '#00E676',
  warning: '#FFAB00',
  error: '#FF5252',
  info: '#40C4FF',
  
  // Utility
  border: '#2A2A2F',
  borderLight: '#3A3A40',
  overlay: 'rgba(0, 0, 0, 0.7)',
  
  // Signal strength
  signalStrong: '#00E676',
  signalMedium: '#FFAB00',
  signalWeak: '#FF5252',
  
  // Transfer
  downloading: '#00F5D4',
  uploading: '#FF2D6A',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const BorderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
};

export const Typography = {
  // Font families - Using system fonts with fallbacks
  fontFamily: {
    regular: 'System',
    medium: 'System',
    bold: 'System',
    mono: 'Menlo',
  },
  
  // Font sizes
  sizes: {
    xs: 10,
    sm: 12,
    md: 14,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
    display: 48,
  },
  
  // Line heights
  lineHeights: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
};

export const Shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  glow: (color: string) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  }),
};

export const Animations = {
  timing: {
    fast: 150,
    normal: 300,
    slow: 500,
  },
};

// Common styles
export const CommonStyles = {
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  
  centerContent: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  
  spaceBetween: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
};

