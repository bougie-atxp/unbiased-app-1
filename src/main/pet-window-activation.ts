/** macOS panels can join fullscreen Spaces without turning the whole app
 * into an accessory app. Electron's default transformation hides the Dock
 * icon and can disturb the main window's fullscreen presentation. */
export const PET_WORKSPACE_OPTIONS = {
  visibleOnFullScreen: true,
  skipTransformProcessType: true,
} as const;

interface MainWindow {
  isDestroyed(): boolean;
  isMinimized(): boolean;
  isVisible(): boolean;
  restore(): void;
  show(): void;
  focus(): void;
}

/** A Pal is a non-activating panel, so clicking it is not app activation.
 * Activate the app explicitly, then let macOS focus the original window in
 * its existing Space. Re-showing an already visible fullscreen window is
 * unnecessary; never resize it or toggle fullscreen as part of navigation. */
export function activateMainWindowFromPal(window: MainWindow, activateApp: () => void): void {
  if (window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  activateApp();
  if (!window.isVisible()) window.show();
  window.focus();
}
