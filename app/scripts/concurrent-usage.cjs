// scripts/concurrent-usage.cjs
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { API_URL, TEST_USERS, CONCURRENT_USAGE, DB_PATH } = require('./constants.cjs');

const LOG_FILE = path.join(__dirname, 'logs', 'concurrent-usage.log');
fs.mkdirSync(path.join(__dirname, 'logs'), { recursive: true });

function log(message) {
    const entry = `[${new Date().toISOString()}] ${message}`;
    console.log(entry);
    fs.appendFileSync(LOG_FILE, entry + '\n');
}

/**
 * REFACTORED CONCURRENT USAGE TEST
 * Simulates multiple concurrent requests picking random QR codes from the database.
 */
async function runTest() {
    const { CONCURRENCY, TOTAL_REQUESTS } = CONCURRENT_USAGE;
    log('--- STARTING REFACTORED CONCURRENT USAGE TEST ---');
    log(`[PARAM] Concurrency: ${CONCURRENCY} | Total Requests: ${TOTAL_REQUESTS}`);

    // 1. Fetch all available QR codes from database
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    const members = await db.all("SELECT QRCode FROM Member WHERE QRCode IS NOT NULL");
    await db.close();

    if (members.length === 0) {
        log('FATAL ERROR: No member QR codes found in database.');
        return;
    }
    const qrPool = members.map(m => m.QRCode);
    log(`[INFO] Loaded ${qrPool.length} QR codes from database.`);

    // 2. Setup admin sessions (using admin credentials from constants)
    // We'll use a pool of admin cookies to simulate multiple concurrent admin devices
    const adminCookies = [];
    const numAdmins = Math.min(CONCURRENCY, TEST_USERS.filter(u => u.username === 'admin').length || 1);
    
    // For simplicity, we can just use multiple sessions for the same admin or different admins if available
    for (let i = 0; i < Math.min(CONCURRENCY, 5); i++) {
        const adminUser = TEST_USERS[0]; // Usually 'admin'
        const loginRes = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(adminUser)
        });
        const cookie = loginRes.headers.get('set-cookie');
        if (cookie) adminCookies.push(cookie);
    }

    if (adminCookies.length === 0) {
        log('FATAL ERROR: Failed to establish any admin sessions.');
        return;
    }
    log(`[INFO] Established ${adminCookies.length} admin sessions for concurrency.`);

    const startTime = Date.now();
    let completed = 0;
    let errors = 0;
    const latencies = [];

    async function sendRequest() {
        const qrCode = qrPool[Math.floor(Math.random() * qrPool.length)];
        const cookie = adminCookies[Math.floor(Math.random() * adminCookies.length)];
        const reqStart = Date.now();

        try {
            const res = await fetch(`${API_URL}/scans/gate`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Cookie': cookie
                },
                body: JSON.stringify({ qrCode })
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

    // Worker pool logic
    let started = 0;
    async function runWorker() {
        while (started < TOTAL_REQUESTS) {
            started++;
            await sendRequest();
            process.stdout.write(`\rProgress: ${completed}/${TOTAL_REQUESTS}...`);
        }
    }

    const pool = [];
    for (let i = 0; i < CONCURRENCY; i++) {
        pool.push(runWorker());
    }
    await Promise.all(pool);

    const totalTime = (Date.now() - startTime) / 1000;
    const avgLatency = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
    const throughput = completed / totalTime;

    log('\n--- CONCURRENT USAGE TEST RESULTS ---');
    log(`Total Time: ${totalTime.toFixed(2)}s`);
    log(`Throughput: ${throughput.toFixed(2)} req/sec`);
    log(`Average Latency: ${avgLatency.toFixed(2)}ms`);
    log(`Errors: ${errors}`);

    if (errors === 0) {
        log('VERIFICATION: SUCCESS - System handled concurrent scans with multiple QR codes and admin sessions.');
    } else {
        log('VERIFICATION: FAILURE - Errors detected during concurrent execution.');
    }
}

runTest().catch(e => log(`FATAL ERROR: ${e.message}`));
