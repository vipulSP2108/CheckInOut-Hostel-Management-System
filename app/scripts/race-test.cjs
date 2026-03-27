// scripts/race-test.cjs
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { API_URL, TEST_USERS, RACE_TEST, DB_PATH } = require('./constants.cjs');

const LOG_FILE = path.join(__dirname, 'logs', 'race-test.log');

function log(message) {
    const time = new Date().toISOString();
    const entry = `[${time}] ${message}\n`;
    fs.appendFileSync(LOG_FILE, entry);
    console.log(message);
}

async function runTest() {
    const { ROOM_NUMBER, MEMBERS, ALLOCATED_BY } = RACE_TEST;
    log('--- STARTING RACE CONDITION TEST ---');
    log(`[PARAM] Target Room: ${ROOM_NUMBER} | Concurrent Members: ${MEMBERS.length}`);
    
    // 1. Login as Admin
    const adminUser = TEST_USERS[0]; 
    const loginRes = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adminUser)
    });
    const cookie = loginRes.headers.get('set-cookie');
    
    // --- RESET STATE FOR CONSISTENT RESULTS ---
    log(`Resetting Room ${ROOM_NUMBER} and Member allocations...`);
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    await db.run(`UPDATE Room SET RoomStatus='Available', CurrentOccupancy=0 WHERE RoomNumber='${ROOM_NUMBER}'`);
    const memberIdsStr = MEMBERS.map(id => `'${id}'`).join(',');
    await db.run(`UPDATE Allocation SET AllocationStatus='Completed' WHERE IdentificationNumber IN (${memberIdsStr})`);
    await db.close();
    
    log(`Simulating ${MEMBERS.length} concurrent allocations for Room ${ROOM_NUMBER}...`);
    
    const startTime = Date.now();
    const requests = MEMBERS.map(id => 
        fetch(`${API_URL}/allocations`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Cookie': cookie
            },
            body: JSON.stringify({
                IdentificationNumber: id,
                RoomNumber: ROOM_NUMBER,
                CheckInDate: new Date().toISOString().split('T')[0],
                AllocatedBy: ALLOCATED_BY
            })
        }).then(async r => ({ status: r.status, data: await r.json().catch(() => ({})) }))
    );
    
    const results = await Promise.all(requests);
    const duration = Date.now() - startTime;
    
    log(`Test completed in ${duration}ms`);
    
    let successes = 0;
    let failures = 0;
    
    results.forEach((res, i) => {
        if (res.status === 200 || res.status === 201) {
            successes++;
            log(`[PASS] Member ${MEMBERS[i]} allocated successfully.`);
        } else {
            failures++;
            log(`[BLOCK] Member ${MEMBERS[i]} failed: ${res.data.error || 'Unknown error'}`);
        }
    });
    
    log('--- RESULTS ---');
    log(`Total Requests: ${MEMBERS.length}`);
    log(`Successful: ${successes}`);
    log(`Blocked: ${failures}`);
    
    if (successes === 1) {
        log('VERIFICATION: SUCCESS - Only 1 person was allowed in the single-capacity room.');
    } else {
        log(`VERIFICATION: FAILURE - ${successes} people were allowed in the room!`);
    }
}

runTest().catch(e => log(`FATAL ERROR: ${e.message}`));
