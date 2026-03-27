const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

async function runTest() {
    console.log('--- STARTING FAILURE SIMULATION (ROLLBACK TEST) ---');
    
    const db = await open({ filename: './hostel.db', driver: sqlite3.Database });
    await db.exec('PRAGMA foreign_keys = ON');
    
    const MEMBER_ID = '2020110'; // Atharva Sinha from seed
    const ROOM_NUM = 'A201';
    
    // 1. Capture initial state
    const initialMember = await db.get('SELECT * FROM Allocation WHERE IdentificationNumber = ? AND AllocationStatus = "Active"', [MEMBER_ID]);
    const initialRoom = await db.get('SELECT CurrentOccupancy FROM Room WHERE RoomNumber = ?', [ROOM_NUM]);
    
    console.log(`Initial state: Occupancy=${initialRoom.CurrentOccupancy}`);
    
    try {
        await db.run('BEGIN TRANSACTION');
        
        console.log('Step 1: Inserting allocation...');
        await db.run(
            `INSERT INTO Allocation (IdentificationNumber, RoomNumber, CheckInDate, AllocationStatus) VALUES (?, ?, ?, ?)`,
            [MEMBER_ID, ROOM_NUM, new Date().toISOString().split('T')[0], 'Active']
        );
        
        console.log('Step 2: Simulating UNEXPECTED ERROR before updating room occupancy...');
        throw new Error('SYSTEM CRASH SIMULATION');
        
        // This part is never reached
        await db.run('UPDATE Room SET CurrentOccupancy = CurrentOccupancy + 1 WHERE RoomNumber = ?', [ROOM_NUM]);
        await db.run('COMMIT');
        
    } catch (err) {
        console.log(`Caught expected error: ${err.message}`);
        await db.run('ROLLBACK');
        console.log('Transaction Rolled Back.');
    }
    
    // 2. Verify Final State
    const finalMember = await db.get('SELECT * FROM Allocation WHERE IdentificationNumber = ? AND AllocationStatus = "Active" AND CheckInDate = ?', [MEMBER_ID, new Date().toISOString().split('T')[0]]);
    const finalRoom = await db.get('SELECT CurrentOccupancy FROM Room WHERE RoomNumber = ?', [ROOM_NUM]);
    
    console.log('--- VERIFICATION ---');
    console.log(`Final state: Occupancy=${finalRoom.CurrentOccupancy}`);
    
    if (finalRoom.CurrentOccupancy === initialRoom.CurrentOccupancy && !finalMember) {
        console.log('VERIFICATION: SUCCESS - Database is clean. No partial data stored.');
    } else {
        console.error('VERIFICATION: FAILURE - Partial data detected! Check consistency.');
    }
    
    await db.close();
}

runTest().catch(console.error);
