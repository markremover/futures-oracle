const fs = require('fs');
const path = require('path');

// Список workflow файлов
const workflows = [
    '(ETH) Market_V10_MACRO.json',
    '(SOL) Market_V10_MACRO.json',
    '(XRP) Market_V10_MACRO.json',
    '(DOGE) Market_V10_MACRO.json',
    '(SUI) Market_V10_MACRO.json'
];

// Новый Execute Order node template
const createExecuteOrderNode = (pair, position_x, position_y) => ({
    "parameters": {
        "method": "POST",
        "url": "http://172.17.0.1:3001/execute-order",
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": `={\n  "pair": "${pair}-USD",\n  "signal": "{{ $json.final_signal }}",\n  "entry_price": {{ $json.current_price }},\n  "sl_price": {{ $json.current_price - 5 }},\n  "tp_price": {{ $json.current_price + 10 }},\n  "risk_amount": 10\n}`,
        "options": {}
    },
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4.3,
    "position": [position_x, position_y],
    "id": `execute-order-${pair.toLowerCase()}-${Date.now()}`,
    "name": "Execute Order (Oracle API)"
});

workflows.forEach(filename => {
    console.log(`\n=== Processing ${filename} ===`);

    const filepath = path.join(__dirname, filename);
    const workflow = JSON.parse(fs.readFileSync(filepath, 'utf8'));

    // Extract pair from filename
    const pair = filename.match(/\(([A-Z]+)\)/)[1];

    // Find nodes to remove
    let positionSizingNode = null;
    let sltpJobsNode = null;
    let riskFilterNode = null;
    let telegramNode = null;

    workflow.nodes.forEach(node => {
        if (node.name && node.name.includes('Position Sizing')) {
            positionSizingNode = node;
        } else if (node.name && node.name.includes('SL/TP Jobs')) {
            sltpJobsNode = node;
        } else if (node.name === 'Risk Filter') {
            riskFilterNode = node;
        } else if (node.name === 'Telegram (Report)') {
            telegramNode = node;
        }
    });

    if (!positionSizingNode || !sltpJobsNode) {
        console.log(`⚠️  Could not find Position Sizing or SL/TP Jobs nodes in ${filename}`);
        return;
    }

    console.log(`Found Position Sizing: ${positionSizingNode.id}`);
    console.log(`Found SL/TP Jobs: ${sltpJobsNode.id}`);

    // Remove old nodes
    workflow.nodes = workflow.nodes.filter(node =>
        node.id !== positionSizingNode.id && node.id !== sltpJobsNode.id
    );

    // Create new Execute Order node (position between Risk Filter and Telegram)
    const executeOrderNode = createExecuteOrderNode(
        pair,
        positionSizingNode.position[0],  // Use Position Sizing's X position
        positionSizingNode.position[1]    // Use Position Sizing's Y position
    );

    workflow.nodes.push(executeOrderNode);

    // Update connections
    // Risk Filter → Execute Order
    if (workflow.connections['Risk Filter']) {
        workflow.connections['Risk Filter'].main[0] = [{
            node: executeOrderNode.name,
            type: 'main',
            index: 0
        }];
    }

    // Execute Order → Telegram
    workflow.connections[executeOrderNode.name] = {
        main: [[{
            node: telegramNode.name,
            type: 'main',
            index: 0
        }]]
    };

    // Remove old connections
    delete workflow.connections[positionSizingNode.name];
    delete workflow.connections[sltpJobsNode.name];

    // Update Telegram node message to use Execute Order response
    if (telegramNode) {
        telegramNode.parameters.text = "={{ $json.success ? '✅ ORDER EXECUTED' : '❌ ORDER FAILED' }}\\n\\nPair: {{ $json.pair || 'ETH-USD' }}\\nSignal: {{ $json.signal || $json.final_signal }}\\nEntry: {{ $json.entry_price }}\\nOrder ID: {{ $json.order_id }}\\nContracts: {{ $json.contracts }}\\nSL: {{ $json.sl_price }} | TP: {{ $json.tp_price }}\\nMargin Used: ${{ $json.margin_used }}\\n\\n🌍 Macro: {{ $('Market Context').first().json.sentiment }}  ℹ️ Confidence: {{ $json.confidence_score || $json.confidence }}%";
    }

    // Save updated workflow
    fs.writeFileSync(filepath, JSON.stringify(workflow, null, 2));
    console.log(`✅ Updated ${filename}`);
    console.log(`   - Removed 2 nodes (Position Sizing, SL/TP Jobs)`);
    console.log(`   - Added 1 node (Execute Order)`);
    console.log(`   - Updated connections and Telegram message`);
});

console.log('\n=== All workflows updated! ===');
