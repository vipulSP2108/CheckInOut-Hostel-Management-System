// unified-stress-test.cjs
const API_URL = 'http://127.0.0.1:3000/api';

async function runScenario(name, TOTAL_REQUESTS, CONCURRENCY, fn) {
    console.log(`\n--- SCENARIO: ${name} ---`);
    console.log(`Sending ${TOTAL_REQUESTS} requests with CONCURRENCY=${CONCURRENCY}...`);
    
    const startTime = Date.now();
    let completed = 0;
    let errors = 0;
    const latencies = [];

    async function wrapper() {
        const reqStart = Date.now();
        try {
            await fn();
            latencies.push(Date.now() - reqStart);
        } catch (e) {
            errors++;
            if (errors === 1) console.error(` [FIRST ERR]: ${e.message}`);
        } finally {
            completed++;
        }
    }

    for (let i = 0; i < TOTAL_REQUESTS; i += CONCURRENCY) {
        const batch = [];
        for (let j = 0; j < CONCURRENCY && (i + j) < TOTAL_REQUESTS; j++) {
            batch.push(wrapper());
        }
        await Promise.all(batch);
        process.stdout.write(`\r Progress: ${completed}/${TOTAL_REQUESTS}...`);
    }
    
    const totalTime = (Date.now() - startTime) / 1000;
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / (latencies.length || 1);
    const throughput = completed / totalTime;

    console.log(`\n Results: ${throughput.toFixed(2)} req/sec | Avg Latency: ${avgLatency.toFixed(2)}ms | Errors: ${errors}`);
    return { throughput, avgLatency, errors };
}

async function start() {
    console.log('--- STARTING UNIFIED STRESS TEST SUITE ---');
    
    // 0. Login as Admin to get cookie
    const loginRes = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    const cookie = loginRes.headers.get('set-cookie');
    const headers = { 'Content-Type': 'application/json', 'Cookie': cookie };

    // Scenario 1: Highest - Member Data Polling (GET)
    await runScenario('Scenario 1: Member Dashboard Polling (GET)', 200, 20, async () => {
        const res = await fetch(`${API_URL}/members/2022001`, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
    });

    // Scenario 2: High - Scan Movement History (GET)
    await runScenario('Scenario 2: Real-time Scan Tracking (GET)', 100, 10, async () => {
        const res = await fetch(`${API_URL}/scans`, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
    });

    // Scenario 3: Medium - Auth Stress (POST / Bcrypt)
    await runScenario('Scenario 3: Auth/Bcrypt Stress (POST)', 50, 5, async () => {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'admin', password: 'admin123' })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
    });

    // Scenario 4: Medium - Maintenance Polling (GET)
    await runScenario('Scenario 4: Maintenance Status Polling (GET)', 150, 15, async () => {
        const res = await fetch(`${API_URL}/maintenance`, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
    });

    console.log('\n--- UNIFIED STRESS TEST COMPLETE ---');
}

start().catch(console.error);
