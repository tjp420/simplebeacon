#!/usr/bin/env node
/**
 * Standalone entry: node src/reporters/build-report.js [client] [assessor] [report.json] [output.md]
 * Prefer: npx simplebeacon report
 */

const fs = require('fs');
const path = require('path');
const { compileAuditReportMarkdown } = require('./audit-report');

function main() {
    const args = process.argv.slice(2);
    const clientName = args[0] || 'Client Project';
    const assessorName = args[1] || 'Simplebeacon Security Audit Service';
    const inputFile = args[2] || './.simplebeacon/report.json';
    const outputFile = args[3] || './AUDIT_REPORT.md';
    const assessmentFile = './.simplebeacon/assessment.json';

    try {
        if (!fs.existsSync(inputFile)) {
            console.error(`Error: Report file not found: ${inputFile}`);
            console.error('Run: npx simplebeacon scan --format json --output .simplebeacon/report.json --gate');
            process.exit(1);
        }

        const report = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
        let assessment = null;
        if (fs.existsSync(assessmentFile)) {
            assessment = JSON.parse(fs.readFileSync(assessmentFile, 'utf8'));
        }

        const markdown = compileAuditReportMarkdown(report, {
            client: clientName,
            company: clientName,
            assessor: assessorName,
            assessment,
            projectRoot: report.projectRoot || process.cwd()
        });
        
        // Atomic write - build entire string in memory, then write once
        fs.writeFileSync(outputFile, `${markdown}\n`, 'utf8');
        
        console.log(`Audit report generated: ${path.resolve(outputFile)}`);
    } catch (error) {
        console.error('Error generating report:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    compileReport: compileAuditReportMarkdown,
    compileAuditReportMarkdown
};
