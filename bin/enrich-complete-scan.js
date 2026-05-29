#!/usr/bin/env node
/**
 * Enrich a complete scan JSON export with fileReductionPlan, scannerStatistics, and analysis.
 *
 * Usage: node bin/enrich-complete-scan.js <input.json> [output.json]
 */

const fs = require('fs');
const path = require('path');
const { enrichCompleteScan } = require('../src/lib/enrich-complete-scan');

function main() {
    const inputPath = process.argv[2];
    const outputPath = process.argv[3];

    if (!inputPath) {
        console.error('Usage: node bin/enrich-complete-scan.js <input.json> [output.json]');
        process.exit(1);
    }

    const resolvedInput = path.resolve(inputPath);
    const raw = fs.readFileSync(resolvedInput, 'utf8');
    const completeScan = JSON.parse(raw);
    const enriched = enrichCompleteScan(completeScan);

    const target = outputPath
        ? path.resolve(outputPath)
        : resolvedInput.replace(/\.json$/i, '.enriched.json');

    fs.writeFileSync(target, `${JSON.stringify(enriched, null, 2)}\n`, 'utf8');

    const analysis = enriched.completeScanAnalysis;
    console.log(`Enriched complete scan written to ${target}`);
    console.log(`File reduction immediate savings: ${analysis.fileReduction?.immediateSavingsBytes ?? '—'} bytes`);
    console.log(`Safe to delete: ${analysis.fileReduction?.safeToDeleteBytes ?? '—'} bytes`);
    console.log(`Data quality PII needing review: ${analysis.dataQuality?.piiNeedingReview ?? '—'}`);
    console.log(`Data quality credentials needing review: ${analysis.dataQuality?.credentialsNeedingReview ?? '—'}`);
}

main();
