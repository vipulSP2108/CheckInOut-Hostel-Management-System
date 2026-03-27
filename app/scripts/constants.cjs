// scripts/constants.cjs
/**
 * CENTRALIZED TEST CONFIGURATION
 * Use this file to adjust concurrency, total requests, and test data for all scripts.
 */

module.exports = {
    // --- GLOBAL SETTINGS ---
    API_URL: 'http://127.0.0.1:3000/api',
    DB_PATH: './hostel.db',

    // --- SHARED DATA POOLS ---
    // User login credentials (IdentificationNumber, ContactNumber as password)
    TEST_USERS: [
        { username: 'admin', password: 'admin123' },
        { username: '2022001', password: '9117061316' },
        { username: '2022002', password: '9163894034' },
        { username: '2020003', password: '9176100283' },
        { username: '2021004', password: '9124226609' },
        { username: '2025005', password: '9141542537' }
    ],

    // Member IDs for GET requests
    MEMBER_IDS: [
        '2022001', '2022002', '2020003', '2021004', '2025005',
        '2024006', '2020007', '2025008', '2024009', '2025010'
    ],

    // --- UNIFIED STRESS TEST (Parallel Scenarios) ---
    UNIFIED_TEST: {
        S1_MEMBER_POLLING: { TOTAL: 300, CONCURRENCY: 30 },
        S2_SCAN_MOVEMENT: { TOTAL: 150, CONCURRENCY: 15 },
        S3_AUTH_STRESS: { TOTAL: 60, CONCURRENCY: 6 },
        S4_MAINTENANCE_POLLING: { TOTAL: 200, CONCURRENCY: 20 },
        S5_COMPLAINT_WRITE: {
            TOTAL: 30,
            CONCURRENCY: 5,
            CATEGORIES: [1, 2, 3, 4, 5, 6, 7, 8],
            SEVERITIES: ['Low', 'Medium', 'High', 'Critical'],
            ROOMS: ['A001', 'A002', 'A003', 'A004', 'A105', 'A106']
        }
    },

    // --- RACE CONDITION TEST (RACE-TEST.CJS) ---
    RACE_TEST: {
        AUTO_MODE: true, // If true, finding room and students dynamically
        AUTO_VACATE: false, // If true, clear the room before racing
        AUTO_CONFIG: {
            TARGET_CAPACITY: 1, // Look for a room with this capacity
            NUM_STUDENTS: 5     // Number of concurrent students to race
        },
        // Fallback/Manual settings (used if AUTO_MODE is false)
        ROOM_NUMBER: 'A204',
        MEMBERS: ['2022096', '2022042', '2022043', '2022044', '2022045'],
        ALLOCATED_BY: 'Race Test Bot'
    },

    // --- GATE RUSH STRESS TEST (STRESS-TEST.CJS) ---
    STRESS_TEST: {
        TOTAL_REQUESTS: 600,
        CONCURRENCY: 60,
        QR_CODE: 'MEM-QR-0001'
    }
};
