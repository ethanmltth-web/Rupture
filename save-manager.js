/** Export / import full player save for cross-device transfer. */

export const SAVE_FORMAT = 'rupture_save';
export const SAVE_VERSION = 1;

export function createSaveBundle(profile, settings) {
  return {
    format: SAVE_FORMAT,
    version: SAVE_VERSION,
    exportedAt: new Date().toISOString(),
    profile: profile.toSnapshot(),
    settings: settings.toSnapshot(),
  };
}

export function validateSaveBundle(data) {
  if (!data || typeof data !== 'object') return false;
  if (data.format !== SAVE_FORMAT) return false;
  if (!data.profile || typeof data.profile !== 'object') return false;
  return true;
}

export function applySaveBundle(data, profile, settings) {
  if (!validateSaveBundle(data)) {
    throw new Error('Not a valid RUPTURE save file.');
  }
  profile.persist = true;
  settings.persist = true;
  profile.fromSnapshot(data.profile);
  if (data.settings && typeof data.settings === 'object') {
    settings.fromSnapshot(data.settings);
  }
}

export function sanitizeSaveName(name) {
  const cleaned = String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_]/g, '')
    .slice(0, 32);
  return cleaned || 'save';
}

export function buildSaveFileName(saveName, date = new Date()) {
  const stamp = date.toISOString().slice(0, 10);
  return `rupture-${sanitizeSaveName(saveName)}-${stamp}.json`;
}

/** rupture-{name}-{YYYY-MM-DD}.json */
const SAVE_FILE_NAME_RE = /^rupture-.+-(\d{4}-\d{2}-\d{2})\.json$/;

export function validateSaveFileName(fileName) {
  const base = String(fileName ?? '').trim().replace(/^.*[/\\]/, '');
  const match = base.match(SAVE_FILE_NAME_RE);
  if (!match) {
    return 'Invalid file — name must be rupture-{name}-{YYYY-MM-DD}.json';
  }
  const [y, m, d] = match[1].split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) {
    return 'Invalid file — date before .json must be YYYY-MM-DD';
  }
  return null;
}

export function downloadSaveBundle(bundle, saveName) {
  const json = JSON.stringify(bundle, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = buildSaveFileName(saveName);
  link.click();
  URL.revokeObjectURL(url);
}

export function readSaveFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(reader.result));
      } catch {
        reject(new Error('Could not parse save file — is it valid JSON?'));
      }
    };
    reader.onerror = () => reject(new Error('Could not read save file.'));
    reader.readAsText(file);
  });
}
