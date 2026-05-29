/**
 * Safely determines if a file path should be excluded based on configuration rules.
 * Replaces project-specific hardcoded strings with a clean dynamic match.
 * @param {string} filePath - The absolute or relative file path being evaluated.
 * @param {Array<string>} userExclusions - Custom exclusion tokens passed from config.
 * @returns {boolean} True if the path should be skipped.
 */
function shouldExcludePath(filePath, userExclusions = []) {
  // 1. Core global defaults to prevent scanning system noise
  const globalDefaults = [
    'node_modules',
    '.git',
    'coverage',
    'dist',
    'build',
    'archive',
    'github-cache',
    'deliverables'
  ];
  
  // 2. Combine defaults with any custom exclusions from simplebeacon.json
  const activeExclusions = [...globalDefaults, ...userExclusions];
  
  // 3. Perform a clean token match (case-insensitive)
  const normalizedPath = filePath.toLowerCase();
  return activeExclusions.some(pattern => normalizedPath.includes(pattern.toLowerCase()));
}

module.exports = { shouldExcludePath };
