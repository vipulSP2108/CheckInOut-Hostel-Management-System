const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const LOG_FILE = path.join(__dirname, 'logs', 'failure-simulation.log');
const METRICS_FILE = process.env.METRICS_FILE || null;

fs.mkdirSync(path.join(__dirname, 'logs'), { recursive: true });

function log(message) {
    const entry = `[${new Date().toISOString()}] ${message}`;
    console.log(entry);
    fs.appendFileSync(LOG_FILE, entry + '\n');
}

function logMetric(metric) {
    if (METRICS_FILE) {
        fs.appendFileSync(METRICS_FILE, JSON.stringify(metric) + '\n');
    }
}

async function runTest() {
    log('--- STARTING FAILURE SIMULATION (ROLLBACK TEST) ---');

    const db = await open({ filename: './hostel.db', driver: sqlite3.Database });
    await db.exec('PRAGMA foreign_keys = ON');

    const MEMBER_ID = '2020110';
    const ROOM_NUM = 'A201';

    const initialMember = await db.get('SELECT * FROM Allocation WHERE IdentificationNumber = ? AND AllocationStatus = "Active"', [MEMBER_ID]);
    const initialRoom = await db.get('SELECT CurrentOccupancy FROM Room WHERE RoomNumber = ?', [ROOM_NUM]);

    log(`Initial state: Occupancy=${initialRoom.CurrentOccupancy}`);

    try {
        await db.run('BEGIN TRANSACTION');
        log('Step 1: Inserting allocation...');
        await db.run(
            `INSERT INTO Allocation (IdentificationNumber, RoomNumber, CheckInDate, AllocationStatus) VALUES (?, ?, ?, ?)`,
            [MEMBER_ID, ROOM_NUM, new Date().toISOString().split('T')[0], 'Active']
        );
        log('Step 2: Simulating UNEXPECTED ERROR before updating room occupancy...');
        throw new Error('SYSTEM CRASH SIMULATION');

        // Never reached
        await db.run('UPDATE Room SET CurrentOccupancy = CurrentOccupancy + 1 WHERE RoomNumber = ?', [ROOM_NUM]);
        await db.run('COMMIT');
    } catch (err) {
        log(`Caught expected error: ${err.message}`);
        await db.run('ROLLBACK');
        log('Transaction Rolled Back.');
    }

    const finalMember = await db.get('SELECT * FROM Allocation WHERE IdentificationNumber = ? AND AllocationStatus = "Active" AND CheckInDate = ?', [MEMBER_ID, new Date().toISOString().split('T')[0]]);
    const finalRoom = await db.get('SELECT CurrentOccupancy FROM Room WHERE RoomNumber = ?', [ROOM_NUM]);

    log('--- VERIFICATION ---');
    log(`Final state: Occupancy=${finalRoom.CurrentOccupancy}`);

    if (finalRoom.CurrentOccupancy === initialRoom.CurrentOccupancy && !finalMember) {
        log('VERIFICATION: SUCCESS - Database is clean. No partial data stored.');
        logMetric({ timestamp: Date.now(), success: true, type: 'failure-sim' });
    } else {
        log('VERIFICATION: FAILURE - Partial data detected! Check consistency.');
        logMetric({ timestamp: Date.now(), success: false, type: 'failure-sim' });
    }

    await db.close();
}

runTest().catch(e => log(`FATAL ERROR: ${e.message}`));
