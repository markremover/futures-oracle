const fs = require('fs');
const path = require('path');

// List of workflow files to update
const workflowFiles = [
    '(ETH) Market_V10_MACRO.json',
    '(SOL) Market_V10_MACRO.json',
    '(XRP) Market_V10_MACRO.json',
    '(DOGE) Market_V10_MACRO.json',
    '(SUI) Market_V10_MACRO.json'
];

const workflowDir = __dirname;

console.log('🚀 Starting V21 N8N Workflow Update...\n');

workflowFiles.forEach(filename => {
    const filePath = path.join(workflowDir, filename);

    if (!fs.existsSync(filePath)) {
        console.log(`⚠️  Skipping ${filename} - file not found`);
        return;
    }

    console.log(`📝 Processing: ${filename}`);

    try {
        const data = fs.readFileSync(filePath, 'utf8');
        const workflow = JSON.parse(data);

        let updated = false;

        // Update all nodes
        workflow.nodes.forEach(node => {
            // Find Execute Order node
            if (node.name === 'Execute Order (Oracle API)' || node.id?.includes('execute-order')) {
                console.log(`  ✅ Found Execute Order node: ${node.name}`);

                // Get pair name from filename
                const pairMatch = filename.match(/\(([A-Z]+)\)/);
                const pair = pairMatch ? `${pairMatch[1]}-USD` : 'ETH-USD';

                // Update payload - V21 only needs pair, signal, confidence
                node.parameters.jsonBody = `={
  "pair": "${pair}",
  "signal": "{{ $json.final_signal }}",
  "confidence": "{{ $json.confidence || 'N/A' }}"
}`;

                updated = true;
                console.log(`  ✅ Updated payload to V21 format (removed hardcoded SL/TP)`);
            }

            // Update Telegram Report node
            if (node.name === 'Telegram' || node.name?.includes('Report')) {
                console.log(`  📱 Found Telegram node: ${node.name}`);

                // Update message template with V21 fields
                const newMessage = '🚀 **{{ $json.side }} {{ $json.pair }}**\n\n' +
                    '📊 **Entry:** ${{ $json.entry_price }}\n' +
                    '🛑 **SL:** ${{ $json.sl_price }}\n' +
                    '🎯 **TP:** ${{ $json.tp_price }}\n\n' +
                    '📈 **ATR:** {{ $json.atr }}\n' +
                    '📦 **Contracts:** {{ $json.contracts }}\n' +
                    '💰 **Risk:** ${{ $json.actual_risk }}\n' +
                    '💵 **Margin:** ${{ $json.margin_used }}\n\n' +
                    '🆔 Order ID: `{{ $json.order_id }}`';

                if (node.parameters.message) {
                    node.parameters.message = newMessage;
                    console.log(`  ✅ Updated Telegram message template with V21 fields`);
                    updated = true;
                }
            }
        });

        if (updated) {
            fs.writeFileSync(filePath, JSON.stringify(workflow, null, 2));
            console.log(`✅ Successfully updated: ${filename}\n`);
        } else {
            console.log(`⚠️  No changes needed for: ${filename}\n`);
        }

    } catch (error) {
        console.error(`❌ Error processing ${filename}:`, error.message);
    }
});

console.log('\n🎉 V21 Workflow Update Complete!');
console.log('📌 Next: Import updated workflows into N8N');
