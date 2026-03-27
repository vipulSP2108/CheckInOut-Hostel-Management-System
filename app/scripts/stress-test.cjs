const API_URL = 'http://127.0.0.1:3000/api';

async function runTest() {
    console.log('--- STARTING GATE RUSH STRESS TEST (100+ req/sec) ---');
    
    // 1. Login
    const loginRes = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    const cookie = loginRes.headers.get('set-cookie');
    
    const TOTAL_REQUESTS = 500;
    const CONCURRENCY = 50; 
    
    console.log(`Sending ${TOTAL_REQUESTS} requests with CONCURRENCY=${CONCURRENCY}...`);
    
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
                body: JSON.stringify({ qrCode: 'MEM-QR-0001' })
            });
            if (!res.ok) {
                const errBody = await res.json().catch(() => ({}));
                throw new Error(`HTTP ${res.status}: ${errBody.error || 'Unknown error'}`);
            }
            latencies.push(Date.now() - reqStart);
        } catch (e) {
            if (errors === 0) console.error(`\n[FIRST ERROR]: ${e.message}`);
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
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const throughput = completed / totalTime;

    console.log('\n--- STRESS TEST RESULTS ---');
    console.log(`Total Time: ${totalTime.toFixed(2)}s`);
    console.log(`Throughput: ${throughput.toFixed(2)} req/sec`);
    console.log(`Average Latency: ${avgLatency.toFixed(2)}ms`);
    console.log(`Errors: ${errors}`);
    
    if (errors === 0 && throughput > 50) {
        console.log('VERIFICATION: SUCCESS - System handled high load with zero errors.');
    } else if (errors > 0) {
        console.warn('VERIFICATION: WARNING - Errors detected under load. Check busy_timeout settings.');
    }
}

runTest().catch(console.error);
