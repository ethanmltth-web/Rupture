import { showLayer, hideLayer } from './transitions.js';
import { createSaveBundle, downloadSaveBundle, buildSaveFileName } from './save-manager.js';

export class SaveExportUI {
  constructor(profile, settings, input, audio, onStatus) {
    this.profile = profile;
    this.settings = settings;
    this.input = input;
    this.audio = audio;
    this.onStatus = onStatus;
    this.open = false;
    this.el = document.getElementById('save-export');
    this.nameInput = document.getElementById('save-name-input');
    this.preview = document.getElementById('save-name-preview');

    document.getElementById('btn-save-download')?.addEventListener('click', () => this.download());
    document.getElementById('save-export-close')?.addEventListener('click', () => this.hide());
    document.getElementById('btn-save-cancel')?.addEventListener('click', () => this.hide());
    this.el?.addEventListener('click', (e) => {
      if (e.target === this.el) this.hide();
    });
    this.nameInput?.addEventListener('input', () => this.updatePreview());
    this.nameInput?.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        this.download();
      }
    });
    window.addEventListener('keydown', (e) => {
      if (this.open && e.key === 'Escape') this.hide();
    });
  }

  isOpen() {
    return this.open;
  }

  updatePreview() {
    if (this.preview) {
      this.preview.textContent = buildSaveFileName(this.nameInput?.value ?? '');
    }
  }

  show() {
    this.open = true;
    this.input.setBlocked(true);
    showLayer(this.el);
    if (this.nameInput) {
      this.nameInput.value = 'my-progress';
      this.updatePreview();
      requestAnimationFrame(() => {
        this.nameInput.focus();
        const end = this.nameInput.value.length;
        this.nameInput.setSelectionRange(0, end);
      });
    }
    this.audio?.play('ui_select');
  }

  hide() {
    if (!this.open) return;
    this.open = false;
    this.input.setBlocked(false);
    hideLayer(this.el);
    this.audio?.play('ui_select');
  }

  download() {
    const name = this.nameInput?.value ?? '';
    const bundle = createSaveBundle(this.profile, this.settings);
    const fileName = buildSaveFileName(name);
    downloadSaveBundle(bundle, name);
    this.onStatus?.(`Saved — ${fileName}`);
    this.audio?.play('ui_select');
    this.hide();
  }
}
