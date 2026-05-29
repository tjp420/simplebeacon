/**
 * Browser ESM mirror — keep in sync with complete-scan-artifact-profile.js (CJS).
 */

function isBenchmarkCachePath(filePath) {
  const rel = String(filePath || '').replace(/\\/g, '/').toLowerCase();
  return rel.includes('/github-cache/') || rel.startsWith('github-cache/')
    || rel.includes('/java-ai-vulnerable/') || rel.startsWith('java-ai-vulnerable/');
}

export function filterPlatformArtifactPaths(entries = []) {
  return entries.filter((entry) => !isBenchmarkCachePath(entry.path || entry));
}

const REGENERABLE_CATEGORIES = new Set([
  'node_modules',
  'coverage',
  '__pycache__',
  'dist',
  'build'
]);

const REGENERABLE_PATH_SUFFIXES = [
  '/node_modules',
  '/coverage',
  '/__pycache__',
  '/dist',
  '/build'
];

function isRegenerableDirectoryEntry(entry = {}) {
  const category = String(entry.category || '').toLowerCase();
  if (category && REGENERABLE_CATEGORIES.has(category)) return true;
  const normalizedPath = String(entry.path || '').replace(/\\/g, '/').toLowerCase();
  return REGENERABLE_PATH_SUFFIXES.some((suffix) => (
    normalizedPath.endsWith(suffix) || normalizedPath.includes(`${suffix}/`)
  ));
}

export function classifyRegenerableArtifacts(analysis = {}) {
  const fr = analysis.fileReduction || {};
  const safeBytes = Number(fr.safeToDeleteBytes) || 0;
  const reviewBytes = Number(fr.reviewBeforeDeleteBytes) || 0;
  const unusedCandidates = Number(fr.unusedFileCandidates) || 0;
  const topDirs = filterPlatformArtifactPaths(fr.topSafeDirectories || []);

  if (safeBytes <= 0 && topDirs.length === 0) {
    return 'empty';
  }

  if (reviewBytes > 0 || unusedCandidates > 0) {
    return 'mixed';
  }

  if (topDirs.length > 0 && topDirs.every(isRegenerableDirectoryEntry)) {
    return 'regenerableOnly';
  }

  return 'mixed';
}

export function softenPriorityActions(actions = [], artifactProfile = 'mixed') {
  if (artifactProfile !== 'regenerableOnly') return actions;
  return actions.map((action) => {
    const title = String(action?.title || '');
    if (!/reclaim build artifact space/i.test(title)) return action;
    return {
      ...action,
      title: 'Optional disk hygiene',
      detail: 'Regenerable artifacts only (for example node_modules). Delete when you need space, then run npm install to restore.'
    };
  });
}

export { isRegenerableDirectoryEntry, isBenchmarkCachePath };
