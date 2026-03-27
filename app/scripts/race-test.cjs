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
    log('--- STARTING RACE CONDITION TEST ---');
    
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    
    let targetRoom = RACE_TEST.ROOM_NUMBER;
    let targetMembers = RACE_TEST.MEMBERS;
    
    // --- AUTO MODE DISCOVERY ---
    if (RACE_TEST.AUTO_MODE) {
        log(`[AUTO-MODE] Discovering room with capacity ${RACE_TEST.AUTO_CONFIG.TARGET_CAPACITY} and ${RACE_TEST.AUTO_CONFIG.NUM_STUDENTS} unallocated members...`);
        
        const room = await db.get(
            "SELECT RoomNumber FROM Room WHERE MaxCapacity = ? LIMIT 1",
            [RACE_TEST.AUTO_CONFIG.TARGET_CAPACITY]
        );
        
        const members = await db.all(
            `SELECT IdentificationNumber FROM Member 
             WHERE IdentificationNumber NOT IN (SELECT IdentificationNumber FROM Allocation WHERE AllocationStatus = 'Active') 
             LIMIT ?`,
            [RACE_TEST.AUTO_CONFIG.NUM_STUDENTS]
        );
        
        if (room && members.length === RACE_TEST.AUTO_CONFIG.NUM_STUDENTS) {
            targetRoom = room.RoomNumber;
            targetMembers = members.map(m => m.IdentificationNumber);
            log(`[AUTO-MODE] Managed to find Room: ${targetRoom} | Members: ${targetMembers.join(', ')}`);
        } else {
            log('[AUTO-MODE] WARNING: Could not find enough dynamic data. Falling back to manual settings.');
        }
    }

    // --- FETCH ACTUAL ROOM CAPACITY ---
    const roomInfo = await db.get("SELECT MaxCapacity FROM Room WHERE RoomNumber = ?", [targetRoom]);
    if (!roomInfo) {
        log(`FATAL ERROR: Room ${targetRoom} not found in database.`);
        await db.close();
        return;
    }
    const maxCapacity = roomInfo.MaxCapacity;
    log(`[PARAM] Target Room: ${targetRoom} | Max Capacity: ${maxCapacity} | Concurrent Members: ${targetMembers.length}`);
    
    // 1. Login as Admin
    const adminUser = TEST_USERS[0]; 
    const loginRes = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adminUser)
    });
    const cookie = loginRes.headers.get('set-cookie');
    
    // --- RESET STATE FOR CONSISTENT RESULTS ---
    if (RACE_TEST.AUTO_VACATE) {
        log(`[RESET] Clearing ALL active allocations for Room ${targetRoom} to ensure clean race...`);
        await db.run(`UPDATE Allocation SET AllocationStatus='Completed' WHERE RoomNumber = ? AND AllocationStatus = 'Active'`, [targetRoom]);
        await db.run(`UPDATE Room SET RoomStatus='Available', CurrentOccupancy=0 WHERE RoomNumber = ?`, [targetRoom]);
    } else {
        log(`[SKIP-RESET] Proceeding with current room state for ${targetRoom}...`);
    }
    
    log(`Simulating ${targetMembers.length} concurrent allocations for Room ${targetRoom}...`);
    
    const startTime = Date.now();
    const requests = targetMembers.map((id, idx) => 
        fetch(`${API_URL}/allocations`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Cookie': cookie
            },
            body: JSON.stringify({
                IdentificationNumber: id,
                RoomNumber: targetRoom,
                CheckInDate: new Date().toISOString().split('T')[0],
                AllocatedBy: RACE_TEST.ALLOCATED_BY + ` (Batch #${idx+1})`
            })
        }).then(async r => ({ status: r.status, data: await r.json().catch(() => ({})) }))
    );
    
    const results = await Promise.all(requests);
    const duration = Date.now() - startTime;
    await db.close();
    
    log(`Test completed in ${duration}ms`);
    
    let successes = 0;
    let failures = 0;
    
    results.forEach((res, i) => {
        if (res.status === 200 || res.status === 201) {
            successes++;
            log(`[PASS] Member ${targetMembers[i]} allocated successfully.`);
        } else {
            failures++;
            log(`[BLOCK] Member ${targetMembers[i]} failed: ${res.data.error || 'Unknown error'}`);
        }
    });
    
    log('--- FINAL RESULTS ---');
    log(`Room: ${targetRoom} (Capacity: ${maxCapacity})`);
    log(`Successful Allocations: ${successes}`);
    log(`Rejected/Blocked: ${failures}`);
    
    if (successes === maxCapacity) {
        log(`VERIFICATION: SUCCESS - Capacity perfectly maintained (${successes}/${maxCapacity}).`);
    } else if (successes < maxCapacity) {
        log(`VERIFICATION: PARTIAL - Room was not filled (${successes}/${maxCapacity}). This can happen if SQLITE_BUSY occurred.`);
    } else {
        log(`VERIFICATION: FAILURE - OVER-ALLOCATION DETECTED! Allowed ${successes} into a ${maxCapacity} capacity room.`);
    }
}

runTest().catch(e => log(`FATAL ERROR: ${e.message}`));
