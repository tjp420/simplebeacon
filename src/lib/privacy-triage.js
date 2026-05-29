/**
 * Categorize privacy findings for executive summaries and exports.
 */

const PII_CATEGORIES = [
    {
        id: 'documentation',
        label: 'Documentation / guidelines',
        test: (path) => /docs\/|GUIDELINES|SAMPLE_REPORT|MARKETING\.md|MockData/i.test(path)
    },
    {
        id: 'generated-report',
        label: 'Generated scan/report artifact',
        test: (path) => /reports\/|\.simplebeacon\/|export-snapshots/i.test(path)
    },
    {
        id: 'mock-sample-data',
        label: 'Mock or sample data',
        test: (path) => /mock|sample|fixture|seed|snapshot|-sample\.json/i.test(path)
    },
    {
        id: 'test-fixture',
        label: 'Intentional test fixture',
        test: (path) => /simplebeacon-toxic-fixtures|toxic-fixtures|tests\/fixtures/i.test(path)
    }
];

const CREDENTIAL_CATEGORIES = [
    {
        id: 'test-fixture',
        label: 'Intentional test fixture',
        test: (path) => /simplebeacon-toxic-fixtures|toxic-fixtures/i.test(path)
    },
    {
        id: 'documentation-example',
        label: 'Documentation example',
        test: (path) => /docs\/|GUIDELINES|SAMPLE_REPORT|MARKETING\.md/i.test(path)
    }
];

function categorizePrivacyFinding(finding) {
    const filePath = String(finding.path || '');
    const isCredential = String(finding.reason || '').includes('Credential');
    const categories = isCredential ? CREDENTIAL_CATEGORIES : PII_CATEGORIES;
    const match = categories.find((entry) => entry.test(filePath));
    return match ? match.id : 'review-required';
}

function privacyCategoryLabel(categoryId) {
    const all = [...PII_CATEGORIES, ...CREDENTIAL_CATEGORIES];
    return all.find((entry) => entry.id === categoryId)?.label || 'Review required';
}

function triagePrivacyFindings(findings = []) {
    const triaged = findings.map((finding) => {
        const category = categorizePrivacyFinding(finding);
        return {
            path: finding.path,
            line: finding.metadata?.line || null,
            pattern: finding.metadata?.patternId || null,
            kind: String(finding.reason || '').includes('Credential') ? 'credential' : 'pii',
            category,
            categoryLabel: privacyCategoryLabel(category)
        };
    });

    const byCategory = {};
    for (const item of triaged) {
        byCategory[item.category] = (byCategory[item.category] || 0) + 1;
    }

    return {
        items: triaged,
        byCategory,
        piiHits: triaged.filter((item) => item.kind === 'pii').length,
        credentialHits: triaged.filter((item) => item.kind === 'credential').length,
        piiNeedingReview: triaged.filter((item) => item.kind === 'pii' && item.category === 'review-required').length,
        credentialsNeedingReview: triaged.filter((item) => item.kind === 'credential' && item.category === 'review-required').length
    };
}

module.exports = {
    PII_CATEGORIES,
    CREDENTIAL_CATEGORIES,
    categorizePrivacyFinding,
    privacyCategoryLabel,
    triagePrivacyFindings
};
