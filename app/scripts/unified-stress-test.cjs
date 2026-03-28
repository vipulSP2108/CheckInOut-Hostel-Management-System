// scripts/unified-stress-test.cjs
const fs = require('fs');
const path = require('path');
const { API_URL, TEST_USERS, MEMBER_IDS, UNIFIED_TEST } = require('./constants.cjs');

const LOG_FILE = path.join(__dirname, 'logs', 'unified-stress.log');
fs.mkdirSync(path.join(__dirname, 'logs'), { recursive: true });

function log(message) {
    const entry = `[${new Date().toISOString()}] ${message}`;
    console.log(entry);
    fs.appendFileSync(LOG_FILE, entry + '\n');
}

async function runScenario(name, config, fn) {
    const total = config.TOTAL_REQUESTS || config.TOTAL || 10;
    const concurrency = config.CONCURRENCY || 5;
    log(`\n--- SCENARIO: ${name} ---`);
    log(`[PARAM] Total Requests: ${total} | Concurrency: ${concurrency}`);

    const startTime = Date.now();
    let completed = 0;
    let errors = 0;
    const latencies = [];

    async function wrapper(index) {
        const reqStart = Date.now();
        try {
            await fn(index);
            latencies.push(Date.now() - reqStart);
        } catch (e) {
            errors++;
            if (errors === 1) log(` [FIRST ERR] in ${name}: ${e.message}`);
        } finally {
            completed++;
        }
    }

    for (let i = 0; i < total; i += concurrency) {
        const batch = [];
        for (let j = 0; j < concurrency && (i + j) < total; j++) {
            batch.push(wrapper(i + j));
        }
        await Promise.all(batch);
        process.stdout.write(`\r Progress (${name}): ${completed}/${total}...`);
    }

    const totalTime = (Date.now() - startTime) / 1000;
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / (latencies.length || 1);
    const throughput = completed / totalTime;

    log(`\n Results (${name}): ${throughput.toFixed(2)} req/sec | Avg Latency: ${avgLatency.toFixed(2)}ms | Errors: ${errors}`);
    return { name, throughput, avgLatency, errors };
}

async function start() {
    log('=== STARTING PARALLEL UNIFIED STRESS TEST SUITE ===');
    log(`[CONFIG] Using API: ${API_URL}`);
    
    // 0. Preparation - Get Auth Cookies for various users
    log('Authenticating test users to simulate real sessions...');
    const cookies = [];
    for (const user of TEST_USERS) {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(user)
        });
        if (res.ok) {
            cookies.push(res.headers.get('set-cookie'));
        } else {
            log(` [WARN] Failed to authenticate user ${user.username}`);
        }
    }
    const adminCookie = cookies[0]; 

    const scenarios = [
        // S1: Member Polling (DIVERSE IDS)
        () => runScenario('S1: Member Polling (GET)', UNIFIED_TEST.S1_MEMBER_POLLING, async (idx) => {
            const memberId = MEMBER_IDS[idx % MEMBER_IDS.length];
            const res = await fetch(`${API_URL}/members/${memberId}`, { 
                headers: { 'Cookie': adminCookie } 
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
        }),

        // S2: Gate Scan (GET)
        () => runScenario('S2: Gate Scan Stream (GET)', UNIFIED_TEST.S2_GATE_SCAN, async () => {
            const res = await fetch(`${API_URL}/scans`, { 
                headers: { 'Cookie': adminCookie } 
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
        }),

        // S3: Auth Stress (DIVERSE USERS / BCRYPT)
        () => runScenario('S3: Auth/Bcrypt Stress (POST)', UNIFIED_TEST.S3_AUTH_STRESS, async (idx) => {
            const user = TEST_USERS[idx % TEST_USERS.length];
            const res = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(user)
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
        }),

        // S4: Maintenance Polling (GET)
        () => runScenario('S4: Maintenance Ops (GET)', UNIFIED_TEST.S4_MAINTENANCE, async () => {
            const res = await fetch(`${API_URL}/maintenance`, { 
                headers: { 'Cookie': adminCookie } 
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
        }),

        // S5: Complaint Submission (WRITE)
        () => runScenario('S5: Complaint Write (POST)', UNIFIED_TEST.S5_COMPLAINT_WRITE, async (idx) => {
            const userId = TEST_USERS[(idx % (TEST_USERS.length - 1)) + 1].username;
            const userCookie = cookies[(idx % (cookies.length -1)) + 1];
            
            const cfg = UNIFIED_TEST.S5_COMPLAINT_WRITE;
            const payload = {
                IdentificationNumber: userId,
                CategoryID: cfg.CATEGORIES[idx % cfg.CATEGORIES.length],
                RoomNumber: cfg.ROOMS[idx % cfg.ROOMS.length],
                Severity: cfg.SEVERITIES[idx % cfg.SEVERITIES.length],
                Description: `Parallel stress test complaint #${idx} targeting ${cfg.ROOMS[idx % cfg.ROOMS.length]}`
            };

            const res = await fetch(`${API_URL}/complaints`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Cookie': userCookie
                },
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
        })
    ];

    log('Launching all scenarios in parallel for maximum system stress...');
    const results = await Promise.all(scenarios.map(s => s()));
    
    log('\n=== FINAL SUMMARY ===');
    results.forEach(r => {
        log(`${r.name.padEnd(30)} | Throughput: ${r.throughput.toFixed(2)} req/sec | Errors: ${r.errors}`);
    });
    log('=== UNIFIED STRESS TEST COMPLETE ===');
}

start().catch(e => log(`FATAL ERROR: ${e.message}`));
