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
    TEST_USERS: [
        { username: 'admin', password: 'admin123' },
        { username: '2022001', password: '9117061316' },
        { username: '2022002', password: '9163894034' },
        { username: '2020003', password: '9176100283' },
        { username: '2021004', password: '9124226609' },
        { username: '2025005', password: '9141542537' }
    ],

    MEMBER_IDS: [
        '2022001', '2022002', '2020003', '2021004', '2025005',
        '2024006', '2020007', '2025008', '2024009', '2025010'
    ],

    // --- UNIFIED STRESS TEST (Parallel Scenarios) ---
    UNIFIED_TEST: {
        S1_MEMBER_POLLING: { TOTAL_REQUESTS: 100, CONCURRENCY: 20 },
        // S2_GATE_SCAN: { TOTAL_REQUESTS: 60, CONCURRENCY: 10 },
        // S3_AUTH_STRESS: { TOTAL_REQUESTS: 30, CONCURRENCY: 5 },
        // S4_MAINTENANCE: { TOTAL_REQUESTS: 50, CONCURRENCY: 10 },
        S5_COMPLAINT_WRITE: {
            TOTAL_REQUESTS: 20,
            CONCURRENCY: 5,
            CATEGORIES: [1, 2, 3, 4, 5, 6, 7, 8],
            SEVERITIES: ['Low', 'Medium', 'High', 'Critical'],
            ROOMS: ['A001', 'A002', 'A003', 'A004', 'A105', 'A106']
        }
    },

    // --- RACE CONDITION TEST ---
    RACE_TEST: {
        AUTO_MODE: true,
        AUTO_VACATE: true,
        AUTO_CONFIG: {
            TARGET_CAPACITY: 1,
            NUM_STUDENTS: 5
        },
        ROOM_NUMBER: 'A204',
        MEMBERS: ['2022096', '2022042', '2022043', '2022044', '2022045'],
        ALLOCATED_BY: 'Race Test Bot'
    },

    // --- GATE RUSH STRESS TEST ---
    STRESS_TEST: {
        TOTAL_REQUESTS: 5000,
        CONCURRENCY: 150,
        QR_CODE: 'MEM-QR-0001'
    },

    // --- CONCURRENT USAGE TEST ---
    CONCURRENT_USAGE: {
        CONCURRENCY: 10,
        TOTAL_REQUESTS: 200
    }
};
