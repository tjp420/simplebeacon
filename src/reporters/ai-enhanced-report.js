const fs = require('fs');
const { spawn } = require('child_process');

/**
 * @deprecated Use `npx simplebeacon report --enhance` instead.
 * AI-Enhanced Report Generator — legacy full-report rewrite.
 */

function generateAIPrompt(jsonData, clientName) {
  const issues = jsonData.issues || jsonData.detectedIssues || [];
  const summary = jsonData.summary || jsonData;
  
  // Build context for AI
  const issuesContext = issues.map(issue => `
    - Severity: ${issue.severity || issue.severityBand}
    - Type: ${issue.type}
    - Location: ${issue.filePath || issue.file}${issue.line ? ` (line ${issue.line})` : ''}
    - Description: ${issue.description}
    - Fix: ${issue.recommendedAction || issue.recommendation}
  `).join('\n');

  return `You are a professional security auditor and technical writer. Transform the following security scan findings into a customer-friendly audit report.

CLIENT: ${clientName}
SCAN SUMMARY:
- Total files: ${summary.filesAnalyzed || summary.totalFiles || 'N/A'}
- Gate result: ${summary.gate?.pass ? 'PASS' : 'FAIL'}
- Critical issues: ${summary.severityCounts?.critical || 0}
- High issues: ${summary.severityCounts?.high || 0}
- Medium issues: ${summary.severityCounts?.medium || 0}
- Low issues: ${summary.severityCounts?.low || 0}

SECURITY FINDINGS:
${issuesContext}

REQUIREMENTS:
1. Write in professional, clear business language
2. Explain technical risks in terms a business owner would understand
3. Prioritize issues by business impact (reputation, security, client trust)
4. Use clear, actionable remediation steps
5. Maintain technical accuracy - don't soften real security risks
6. Format as professional markdown with clear sections
7. Include executive summary, detailed findings, and recommendations
8. Add a professional disclaimer at the end

OUTPUT FORMAT:
# ${clientName} Security Audit Report

[Executive Summary]
[Detailed Findings by Severity]
[Business Impact Analysis]
[Remediation Roadmap]
[Disclaimer]

Generate the complete report now.`;
}

function callAIForReport(prompt, apiKey) {
  return new Promise((resolve, reject) => {
    // Using OpenAI API as example - can be adapted for other AI services
    const process = spawn('curl', [
      '-X', 'POST',
      'https://api.openai.com/v1/chat/completions',
      '-H', 'Content-Type: application/json',
      '-H', `Authorization: Bearer ${apiKey}`,
      '-d', JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a professional security auditor and technical writer. Transform security findings into customer-friendly audit reports.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 2000
      })
    ]);

    let output = '';
    let error = '';

    process.stdout.on('data', (data) => {
      output += data.toString();
    });

    process.stderr.on('data', (data) => {
      error += data.toString();
    });

    process.on('close', (code) => {
      if (code === 0) {
        try {
          const response = JSON.parse(output);
          const aiContent = response.choices?.[0]?.message?.content || output;
          resolve(aiContent);
        } catch {
          // If not JSON, return raw output
          resolve(output);
        }
      } else {
        reject(new Error(`AI call failed with code ${code}: ${error}`));
      }
    });
  });
}

async function generateAIEnhancedReport(jsonData, clientName, assessorName, apiKey) {
  try {
    const prompt = generateAIPrompt(jsonData, clientName);
    const aiContent = await callAIForReport(prompt, apiKey);

    const date = new Date().toLocaleDateString();
    return `# ${clientName} Security Audit Report

**Prepared for:** ${clientName}  
**Assessor:** ${assessorName}  
**Date:** ${date}  
**Audit type:** AI-enhanced security analysis with Simplebeacon CLI

---

${aiContent}

---

*Report generated using Simplebeacon CLI v1.0.0 with AI-enhanced wording*
*Technical findings based on static code analysis - AI used for presentation only*`;
  } catch (error) {
    console.error('❌ AI enhancement failed, falling back to standard report:', error.message);
    const { compileReport } = require('./build-report');
    return compileReport(jsonData, clientName, assessorName);
  }
}

function main() {
  const args = process.argv.slice(2);
  const clientName = args[0] || 'Client Project';
  const assessorName = args[1] || 'Simplebeacon Security Audit Service';
  const inputFile = args[2] || './.simplebeacon/report.json';
  const outputFile = args[3] || './AI_ENHANCED_AUDIT.md';
  const apiKey = args[4] || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.error('❌ Error: OPENAI_API_KEY environment variable or 4th argument required');
    console.error('Usage: node ai-enhanced-report.js "Client" "Assessor" input.json output.md API_KEY');
    console.error('Or set OPENAI_API_KEY environment variable');
    process.exit(1);
  }

  try {
    if (!fs.existsSync(inputFile)) {
      console.error(`❌ Error: Report file not found: ${inputFile}`);
      process.exit(1);
    }

    const jsonData = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
    
    generateAIEnhancedReport(jsonData, clientName, assessorName, apiKey)
      .then(finalReport => {
        // Atomic write - build entire string in memory, then write once
        fs.writeFileSync(outputFile, finalReport, 'utf8');
        console.log(`AI-Enhanced Audit Report generated: ${outputFile}`);
      })
      .catch(error => {
        console.error('Error:', error.message);
        process.exit(1);
      });
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { generateAIEnhancedReport, generateAIPrompt };
