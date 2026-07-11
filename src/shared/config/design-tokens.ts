/**
 * Design Tokens — NBC Bible Plan
 *
 * Single source of truth for the design system.
 * These tokens map to CSS variables defined in globals.css.
 * Use semantic class names in components — never hardcode hex values.
 *
 * Aesthetic: "Sacred Minimal" — organic minimalism with editorial accents.
 */

// ─── Background / Surface ────────────────────────────────────────────────────

export const bg = {
  /** Main page background: #FAFAF9 (warm off-white) / stone-900 dark */
  base: 'bg-app-bg',
  /** Card / surface background: white / stone-800 dark */
  surface: 'bg-app-surface',
  /** Slightly elevated surfaces */
  elevated: 'bg-app-surface-elevated',
  /** Muted / subdued surface */
  muted: 'bg-app-surface-muted',
  /** Dark overlay card (TodayReadingCard hero) */
  overlay: 'bg-app-overlay',
  /** Inner blur layer for overlay card */
  overlayInner: 'bg-app-overlay-inner',
} as const;

// ─── Text ─────────────────────────────────────────────────────────────────────

export const text = {
  /** Primary text: stone-900 / light */
  primary: 'text-app-text',
  /** Secondary text: stone-600 */
  secondary: 'text-app-text-secondary',
  /** Muted (secondary/helper) text: stone-500, AA-compliant on bg/surface */
  muted: 'text-app-text-muted',
  /** Subtle text — decorative only (disabled/aria-hidden), not body text */
  subtle: 'text-app-text-subtle',
  /** Inverse text (on dark backgrounds): white */
  inverse: 'text-app-text-inverse',
  /** Text on overlay cards (always white — overlay is always dark in both themes) */
  onOverlay: 'text-app-overlay-text',
} as const;

// ─── Primary (Plan / Navigation — Indigo) ─────────────────────────────────────

export const primary = {
  /** indigo-600 */
  DEFAULT: 'text-app-primary',
  bg: 'bg-app-primary',
  bgMuted: 'bg-app-primary-muted',
  bgLight: 'bg-app-primary-light',
  border: 'border-app-primary',
  hover: 'hover:bg-app-primary-hover',
} as const;

// ─── Accent (Reading — Red) ───────────────────────────────────────────────────

export const accent = {
  /** red-600 */
  DEFAULT: 'text-app-accent',
  bg: 'bg-app-accent',
  bgMuted: 'bg-app-accent-muted',
  bgLight: 'bg-app-accent-light',
  border: 'border-app-accent',
  hover: 'hover:bg-app-accent-hover',
} as const;

// ─── Success (Progress — Emerald) ─────────────────────────────────────────────

export const success = {
  /** emerald-500 */
  DEFAULT: 'text-app-success',
  bg: 'bg-app-success',
  bgMuted: 'bg-app-success-muted',
  bgLight: 'bg-app-success-light',
  border: 'border-app-success',
} as const;

// ─── Missed (Warm Red) ────────────────────────────────────────────────────────

export const missed = {
  bg: 'bg-app-missed',
  text: 'text-app-missed-text',
} as const;

// ─── Borders ──────────────────────────────────────────────────────────────────

export const border = {
  /** Default border: rgba(0,0,0,0.06) */
  DEFAULT: 'border-app-border',
  subtle: 'border-app-border-subtle',
  strong: 'border-app-border-strong',
} as const;

// ─── Shadows ──────────────────────────────────────────────────────────────────

export const shadow = {
  sm: 'shadow-app-sm',
  md: 'shadow-app-md',
  card: 'shadow-app-card',
} as const;

// ─── Radii ────────────────────────────────────────────────────────────────────

/**
 * Nesting rule: outer > inner. Pick the parent's radius, then a strictly
 * smaller one for elements nested inside it (e.g. card = lg, button inside = sm/md).
 */
export const radius = {
  sm: 'rounded-app-sm',
  md: 'rounded-app-md',
  lg: 'rounded-app-lg',
  xl: 'rounded-app-xl',
  card: 'rounded-app-card',
} as const;

// ─── Composite token object ───────────────────────────────────────────────────

/**
 * Composite tokens object — import and destructure as needed:
 * @example
 * import { tokens } from '@/shared/config/design-tokens'
 * <div className={cn(tokens.bg.surface, tokens.text.primary)} />
 */
export const tokens = {
  bg,
  text,
  primary,
  accent,
  success,
  missed,
  border,
  shadow,
  radius,
} as const;
