export const SCADA_THEME_TOKENS = [
  "--scada-background",
  "--scada-surface",
  "--scada-grid-color",
  "--scada-selection-color",
  "--scada-port-color",
  "--scada-running-color",
  "--scada-warning-color",
  "--scada-alarm-color",
  "--scada-disabled-color"
] as const;

export type ScadaThemeToken = (typeof SCADA_THEME_TOKENS)[number];
