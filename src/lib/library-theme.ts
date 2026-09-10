/** Games may tint the shared hub, but do not control its geometry or effects. */
export interface LibraryPalette {
  text: string;
  muted: string;
  accent: string;
  button: string;
  buttonText: string;
  panel: string;
  border: string;
  selection: string;
  overlay: string;
  mobileOverlay: string;
  dialog: string;
  backdrop: string;
  shadow: string;
}
export interface LibraryAppearance {
  theme?: 'light' | 'dark';
  backgroundColor?: string;
  ui?: Partial<LibraryPalette>;
}
const defaults: Record<'light' | 'dark', LibraryPalette> = {
  dark: {
    text: '#f6f7fa',
    muted: '#b4becc',
    accent: '#c9f9df',
    button: '#f5f6f8c7',
    buttonText: '#132030',
    panel: '#15223391',
    border: '#ffffff24',
    selection: '#f2f4fbd9',
    overlay: '#070c1799',
    mobileOverlay: '#070c17eb',
    dialog: '#111927db',
    backdrop: '#01050b80',
    shadow: '#00000026',
  },
  light: {
    text: '#3e454c',
    muted: '#656c72',
    accent: '#536e78',
    button: '#ffffff9e',
    buttonText: '#25323c',
    panel: '#ffffff66',
    border: '#ffffff80',
    selection: '#697a86',
    overlay: '#f4f5f614',
    mobileOverlay: '#f4f5f6e6',
    dialog: '#f8fafbd9',
    backdrop: '#17263140',
    shadow: '#23323d1c',
  },
};
/** Same complete variable set on the server and on every client-side selection. */
export function resolveLibraryTheme(appearance: LibraryAppearance) {
  const scheme = appearance.theme ?? 'dark';
  const palette: LibraryPalette = { ...defaults[scheme] };
  for (const key of Object.keys(palette) as (keyof LibraryPalette)[]) {
    const override = appearance.ui?.[key];
    if (override !== undefined) palette[key] = override;
  }
  const background =
    appearance.backgroundColor ?? (scheme === 'light' ? '#eff2f4' : '#090e19');
  const variables: Record<string, string> = {
    '--ui-color-scheme': scheme,
    '--library-background': background,
    '--ui-text': palette.text,
    '--ui-muted': palette.muted,
    '--ui-accent': palette.accent,
    '--ui-button': palette.button,
    '--ui-button-text': palette.buttonText,
    '--ui-panel': palette.panel,
    '--ui-border': palette.border,
    '--ui-selection': palette.selection,
    '--ui-overlay': palette.overlay,
    '--ui-mobile-overlay': palette.mobileOverlay,
    '--ui-dialog': palette.dialog,
    '--ui-backdrop': palette.backdrop,
    '--ui-shadow': palette.shadow,
  };
  return { background, variables };
}
