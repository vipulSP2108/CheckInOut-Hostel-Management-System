// race-test.cjs (CommonJS to support require(sqlite3) easily in ES module project)
const API_URL = 'http://127.0.0.1:3000/api';

async function runTest() {
    console.log('--- STARTING RACE CONDITION TEST ---');
    
    // 1. Login as Admin
    const loginRes = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    const cookie = loginRes.headers.get('set-cookie');
    
    // --- RESET STATE FOR CONSISTENT RESULTS ---
    console.log('Resetting Room A105 and Member allocations...');
    const sqlite3 = require('sqlite3');
    const { open } = require('sqlite');
    const db = await open({ filename: './hostel.db', driver: sqlite3.Database });
    await db.run("UPDATE Room SET RoomStatus='Available', CurrentOccupancy=0 WHERE RoomNumber='A105'");
    await db.run("UPDATE Allocation SET AllocationStatus='Completed' WHERE IdentificationNumber IN ('2022096', '2022042', '2022043', '2022044', '2022045')");
    await db.close();
    
    // 2. Concurrent Allocations
    const members = ['2022096', '2022042', '2022043', '2022044', '2022045'];
    console.log(`Simulating ${members.length} concurrent allocations for Room A105...`);
    
    const startTime = Date.now();
    const requests = members.map(id => 
        fetch(`${API_URL}/allocations`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Cookie': cookie
            },
            body: JSON.stringify({
                IdentificationNumber: id,
                RoomNumber: 'A105',
                CheckInDate: new Date().toISOString().split('T')[0],
                AllocatedBy: 'Stress Test Bot'
            })
        }).then(async r => ({ status: r.status, data: await r.json().catch(() => ({})) }))
    );
    
    const results = await Promise.all(requests);
    const duration = Date.now() - startTime;
    
    console.log(`Test completed in ${duration}ms`);
    
    let successes = 0;
    let failures = 0;
    
    results.forEach((res, i) => {
        if (res.status === 200 || res.status === 201) {
            successes++;
            console.log(`[PASS] Member ${members[i]} allocated successfully.`);
        } else {
            failures++;
            console.log(`[BLOCK] Member ${members[i]} failed: ${res.data.error || 'Unknown error'}`);
        }
    });
    
    console.log('--- RESULTS ---');
    console.log(`Total Requests: ${members.length}`);
    console.log(`Successful: ${successes}`);
    console.log(`Blocked: ${failures}`);
    
    if (successes === 1) {
        console.log('VERIFICATION: SUCCESS - Only 1 person was allowed in the single-capacity room.');
    } else {
        console.error(`VERIFICATION: FAILURE - ${successes} people were allowed in the room!`);
    }
}

runTest().catch(console.error);
