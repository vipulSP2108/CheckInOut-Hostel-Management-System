# Hostel Management System - CheckInOut

A robust Hostel Management System built with React, Node.js, and SQLite, featuring high-concurrency optimizations and business-logic identifier migration.

## 🚀 Getting Started

### Prerequisites
- **Node.js**: v18.20.5+
- **SQLite3**: Installed locally or managed via `node-sqlite3`

### Installation
1. Navigate to the `app` directory:
   ```bash
   cd CheckInOut-Hostel-Management-System/app
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

### Running the Application
- **Development Mode** (Hot-reloading server and frontend):
  ```bash
  npm run dev
  ```
- **Production Mode**:
  ```bash
  npm start
  ```
The application will be available at `http://localhost:3000`.

---

## 🔑 Default Credentials
- **Admin Username**: `admin`
- **Admin Password**: `admin123`

*Note: Resident student login accounts are automatically provisioned. Username is their `IdentificationNumber` and password is their `ContactNumber` (defaults available in `sql/seed.sql`).*

---

## ⚡ Concurrency & Stress Testing (Module B)

The system has been optimized for high-volume environments (e.g., Gate Rush scenarios) using **SQLite Write-Ahead Logging (WAL)** and **Atomic Transactions**.

### Performance Optimizations
- **WAL Mode**: Allows simultaneous readers and writers, preventing "Database is locked" errors during reads.
- **Busy Timeout**: Configured at 5000ms to gracefully queue concurrent write attempts.
- **Atomic Transactions**: Critical routes (Allocations, Gate Scans, Maintenance) use `BEGIN IMMEDIATE` to prevent race conditions (e.g., over-booking a room).

### Running Verification scripts
We have provided a suite of scripts in the `scripts/` directory to verify system stability under load. **Ensure the server is running (`npm start`) before executing these.**

#### 1. Failure & Rollback Simulation
Verifies that the system correctly rolls back transactions if an error occurs mid-way.
```bash
node scripts/failure-simulation.cjs
```

#### 2. Concurrency & Race Condition Test
Simulates multiple users attempting to book the last available spot in a single-capacity room at the exact same microsecond.
```bash
node scripts/race-test.cjs
```

#### 3. High-Load Gate Rush Test
Simulates 500 QR gate scans at a concurrency level of 50 to measure throughput and latency.
```bash
node scripts/stress-test.cjs
```

#### 4. Parallel Unified Stress Test 🆕
Comprehensive load testing for critical system endpoints (Member Polling, Scans, Auth, Maintenance, and Complaint Write) running **simultaneously**.
```bash
node scripts/unified-stress-test.cjs
```

### Centralized Configuration
All test parameters (URLs, user accounts, concurrency levels, etc.) are managed in `scripts/constants.cjs`. You can modify this file to:
- Add more `TEST_USERS` or `MEMBER_IDS`.
- Adjust `STRESS_CONFIG` for higher volumes.
- Change `COMPLAINT_CONFIG` categories and rooms.

### Execution Logs
Each test run automatically generates a detailed log in the `scripts/logs/` directory:
- `unified-stress.log`: Parallel scenario benchmarks.
- `race-test.log`: Concurrency validation history.
- `stress-test.log`: High-volume gate rush results.

---

## 📁 Project Structure
- `src/db/database.js`: SQLite initialization, dynamic schema transpilation, and connection pooling.
- `src/routes/`: Backend API routes for Rooms, Allocations, Scans, etc.
- `src/components/`: React frontend components (Dashboards, QR Scanner).
- `sql/`: 
  - `hostel.sql`: Core schema using `ShortCode` and `RoomNumber` primary keys.
  - `seed.sql`: 900+ lines of mock data for testing.
- `logs/`:
  - `access.log`: HTTP request history.
  - `audit.log`: Record-level database modifications via triggers.
