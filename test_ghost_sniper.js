// TEST GHOST SNIPER - Send fake signals to Oracle
const axios = require('axios');

const ORACLE_URL = 'http://твой_VM_IP:3001'; // ЗАМЕНИ НА СВОЙ IP!

const pairs = ['ETH-USD', 'SOL-USD', 'XRP-USD', 'DOGE-USD', 'SUI-USD'];

async function testGhostSniper() {
    console.log('🎮 [TEST] Sending fake BUY signals to Ghost Sniper Oracle...\n');

    for (const pair of pairs) {
        try {
            const payload = {
                pair: pair,
                signal: 'BUY',
                confidence: 'HIGH'
            };

            console.log(`📤 Sending signal for ${pair}...`);

            const response = await axios.post(`${ORACLE_URL}/execute-order`, payload, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 10000
            });

            if (response.data.success) {
                console.log(`✅ ${pair} - Order ID: ${response.data.order_id}`);
                console.log(`   Entry: $${response.data.entry_price}`);
                console.log(`   SL: $${response.data.sl_price} | TP: $${response.data.tp_price}`);
                console.log(`   Mode: ${response.data.mode}`);
                console.log(`   Virtual Balance: $${response.data.sim_balance}\n`);
            } else {
                console.log(`❌ ${pair} - Error: ${response.data.error}\n`);
            }

        } catch (error) {
            console.error(`❌ ${pair} - Failed:`, error.message, '\n');
        }
    }

    console.log('\n🎉 Test complete! Check Telegram for reports!');
}

testGhostSniper();
