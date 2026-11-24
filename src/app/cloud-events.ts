export function notifyLocalDataChanged(): void {
  window.dispatchEvent(new Event("healthmate:local-data-changed"));
}
