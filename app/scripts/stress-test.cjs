// scripts/stress-test.cjs
const fs = require('fs');
const path = require('path');
const { API_URL, TEST_USERS, STRESS_TEST } = require('./constants.cjs');

const LOG_FILE = path.join(__dirname, 'logs', 'stress-test.log');

function log(message) {
    const time = new Date().toISOString();
    const entry = `[${time}] ${message}\n`;
    fs.appendFileSync(LOG_FILE, entry);
    console.log(message);
}

async function runTest() {
    const { TOTAL_REQUESTS, CONCURRENCY, QR_CODE } = STRESS_TEST;
    log('--- STARTING GATE RUSH STRESS TEST ---');
    log(`[PARAM] Total Requests: ${TOTAL_REQUESTS} | Concurrency: ${CONCURRENCY} | QR Code: ${QR_CODE}`);
    
    // 1. Login
    const adminUser = TEST_USERS[0]; 
    const loginRes = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adminUser)
    });
    const cookie = loginRes.headers.get('set-cookie');
    
    log(`Sending ${TOTAL_REQUESTS} requests with CONCURRENCY=${CONCURRENCY}...`);
    
    const startTime = Date.now();
    let completed = 0;
    let errors = 0;
    const latencies = [];

    async function sendRequest() {
        const reqStart = Date.now();
        try {
            const res = await fetch(`${API_URL}/scans/gate`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Cookie': cookie
                },
                body: JSON.stringify({ qrCode: QR_CODE })
            });
            if (!res.ok) {
                const errBody = await res.json().catch(() => ({}));
                throw new Error(`HTTP ${res.status}: ${errBody.error || 'Unknown error'}`);
            }
            latencies.push(Date.now() - reqStart);
        } catch (e) {
            if (errors === 0) log(`\n[FIRST ERROR]: ${e.message}`);
            errors++;
        } finally {
            completed++;
        }
    }

    // Run in batches
    for (let i = 0; i < TOTAL_REQUESTS; i += CONCURRENCY) {
        const batch = [];
        for (let j = 0; j < CONCURRENCY && (i + j) < TOTAL_REQUESTS; j++) {
            batch.push(sendRequest());
        }
        await Promise.all(batch);
        process.stdout.write(`\rProgress: ${completed}/${TOTAL_REQUESTS}...`);
    }
    
    const totalTime = (Date.now() - startTime) / 1000;
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / (latencies.length || 1);
    const throughput = completed / totalTime;

    log('\n--- STRESS TEST RESULTS ---');
    log(`Total Time: ${totalTime.toFixed(2)}s`);
    log(`Throughput: ${throughput.toFixed(2)} req/sec`);
    log(`Average Latency: ${avgLatency.toFixed(2)}ms`);
    log(`Errors: ${errors}`);
    
    if (errors === 0 && throughput > 50) {
        log('VERIFICATION: SUCCESS - System handled high load with zero errors.');
    } else if (errors > 0) {
        log('VERIFICATION: WARNING - Errors detected under load.');
    }
}

runTest().catch(e => log(`FATAL ERROR: ${e.message}`));
