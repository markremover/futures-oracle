const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'oracle.ts');
let content = fs.readFileSync(filePath, 'utf8');

// The robust check
const replacementStr = `
                    // --- ROBUST BYPASS AI FOR TESTS ---
                    // Check MULTIPLE fields because N8N might filter 'source'
                    const isTest = 
                        (data.source && data.source.includes("TEST")) ||
                        (data.sentiment && data.sentiment.includes("TEST")) ||
                        (data.technical_status && data.technical_status.includes("TEST")) ||
                        (data.trend && data.trend.includes("TEST"));

                    if (isTest) {
                        console.log(\`[TEST MODE] Bypassing AI for \${data.pair}. Returning 100% Confidence.\`);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                             signal: "BUY",
                             confidence: 100,
                             reasoning: "TEST SIGNAL (AI BYPASSED 100%)",
                             macro_impact: "TEST MODE"
                        }));
                        return;
                    }
`;

// Regex to find the block starting with "if (data.source" and ending with "return;" (handling newlines)
// We look for: if (data.source && ... { ... return; }
const regex = /if\s*\(data\.source\s*&&\s*data\.source\.includes\("TEST"\)\)\s*\{[\s\S]*?return;\s*\}/;

if (regex.test(content)) {
    content = content.replace(regex, replacementStr);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log("✅ oracle.ts successfully patched (Regex Replaced)!");
} else {
    console.error("❌ Target pattern not found even with Regex.");
    console.log("Current Content Snippet around 'TEST':");
    const testIdx = content.indexOf("TEST");
    if (testIdx !== -1) {
        console.log(content.substring(testIdx - 50, testIdx + 200));
    }
}
