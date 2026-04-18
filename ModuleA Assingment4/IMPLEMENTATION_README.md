# Assignment 4: Comprehensive Implementation Scope
**Horizontal Database Sharding Architecture**
**Course:** CS 432 - Databases | **Team:** ACID Alliance

This document provides a highly detailed, comprehensive view of the codebase modifications, distributed architecture setups, and foundational logic required to scale the CheckInOut Hostel Management System from a monolithic SQLite implementation to a scattered, horizontally sharded topology.

---

## 1. Architectural Foundations & Data Segregation

The fundamental issue with scaling a monolithic RDBMS is contention constraint (I/O bottlenecks). By distributing our primary workload across three discrete SQLite instances, we attain linear scaling capability.

### 1.1 The "Global" vs "Sharded" Segregation
In a distributed environment, sharding inherently breaks simple SQL `JOIN` functionalities across shards. To preserve performance, we mathematically divided our schema based on expected growth velocities:

- **Global Reference Data**: `Hostel`, `Room`, `RoomType`, `FurnitureType`, `ComplaintCategory`, `Users`.
  - Maintained entirely within the core server (`app/global_hostel.db`). Read-heavy but rarely modified.
- **Transactional Sharded Data**: `Member`, `Allocation`, `Complaint`, `Visitor`, `QRScanLog`, `MaintenanceRequest`, `FeePayment`.
  - Pushed to the external Shard clusters. Modifying a `Complaint` no longer degrades `Room` queries.

### 1.2 Shard Key Selection
- We selected **IdentificationNumber** (The Member ID). 
- **Why?** It possesses absolute cardinality (unique to every student). Crucially, the endpoints driving the most traffic (e.g., `/api/members/:id`, `/api/allocations/:id`) already ingest this parameter organically in their REST paths.

---

## 2. Infrastructure: Docker Orchestration

To validate Partition Tolerance, we specifically bypassed single-file table renaming (e.g., `shard_0_Member`) in favor of true physical containerization. 

*File: `app/docker-compose.yml`*
```yaml
services:
  shard-0:
    build: 
      context: ./sharding/node
    ports:
      - "5001:5000"
    volumes:
      - ./sharding/data/shard0:/data
    restart: unless-stopped
    
  # Functionally mirrored for shard-1 (port 5002) and shard-2 (port 5003).
```
We crafted identical Express node instances running independently on localized ports. If Port `5001` crashes, only one-third of the user pool experiences downtime (`Graceful Degradation`).

---

## 3. The Core Sharding Logic & Router

### 3.1 Hash-Based Partitioning
To combat data hotspots (e.g., an entire batch of 2026 admissions landing strictly on Shard 2), we implemented bitwise String Hashing.

*File: `app/sharding/config/sharding.js`*
```javascript
export function getShardId(key) {
  if (!key) return 0;
  let hash = 0;
  
  // Bitwise String Mixing Algorithm
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0; 
  }
  
  // Determine Shard assignment via Modulo
  return Math.abs(hash) % SHARD_COUNT; // (N=3)
}
```
*Result*: Evaluated ID `22110052` converts via the hash to `Shard 0`, completely agnostic to human-predictable sequential naming conventions.

### 3.2 The Two-Level Query Proxy (Scatter-Gather)
The most sophisticated engineering resides inside the application-layer router, serving as the connective bridge.

*File: `app/sharding/router.js`*
```javascript
export async function executeQuery(tableName, sql, params = [], options = {}) {
  const { shardKey, type = 'all' } = options;

  // Level 1: Global Interception
  if (GLOBAL_TABLES.includes(tableName)) {
    return await globalDb[type](sql, params);
  }

  // Level 2: Precision Shard Routing (O(1) execution)
  if (shardKey) {
    const shardId = getShardId(shardKey);
    return await callShardApi(shardId, type, sql, params);
  }

  // Level 3: Scatter-Gather (Parallel Data Fetching)
  const results = await Promise.all(
    SHARD_NODES.map(node => callShardApi(node.id, type, sql, params))
  );

  // Aggregation Merging
  if (sql.toLowerCase().includes('count(')) {
    let sum = 0;
    results.forEach(r => { if(r) sum += Object.values(r)[0]; });
    return { count: sum };
  }
  
  return results.flat(); // Return seamless combined array
}
```

---

## 4. Cross-Shard Global Integrity

With data isolated across containers, SQLite loses its capability to protect `UNIQUE` constraints (e.g., verifying a unique `Email` globally before writing).

*File: `app/sharding/integrity.js`*
```javascript
// Validates an Email address does not exist anywhere across the distributed cluster.
export async function checkGlobalUniqueness(field, value, excludeKey = null) {
  
  // Scatters a parallel SELECT COUNT search to all nodes 
  const counts = await Promise.all(
    SHARD_NODES.map(node => 
      callShardApi(node.id, 'get', 
        `SELECT COUNT(*) as c FROM Member WHERE ${field} = ?`, 
        [value]
      )
    )
  );
  
  const totalOccurrences = counts.reduce((sum, res) => sum + (res ? res.c : 0), 0);
  return totalOccurrences === 0; // True if completely unique globally
}
```
By utilizing application-layer `Promise.all` validation, we ensure consistency despite the partitioned architecture.

---

## 5. Seamless API Transition
*Files Modified: `app/src/db/database.js`, `app/src/routes/members.js*

Instead of directly tying the backend to `getDB()`, APIs were modernized to consume the Router syntax transparently.

```javascript
/* Legacy Implementation (Monolithic) */
// const db = getDB();
// const member = await db.get('SELECT * FROM Member WHERE IdentificationNumber = ?', [id]);

/* Modernized Implementation (Sharded) */
const member = await executeQuery('Member', 
  'SELECT * FROM Member WHERE IdentificationNumber = ?', 
  [id], 
  { shardKey: id, type: 'get' }
);
```

---

## 6. Migration and Unified Synchronization
*File: `app/scripts/migrate-to-shards.js`*

Transpiling an actively utilized DB required a heavily scripted three-step ETL (Extract, Transform, Load) procedure:
1. **Schema Initialization**: Truncates legacy traces and boots the standard `global_hostel.db` local cache.
2. **Deterministic Forwarding**: Steps linearly through existing Members. Leverages the `getShardId` logic, computes the assignment, and sequentially bulk-inserts the member and their interrelated data (`Complaint`, `Allocations`) directly into the Dockerized HTTP endpoints.
3. **Synchronised Credentials**: Binds every student to an explicitly created authentication payload in the `global_hostel.db` -> `Users` table (`bcrypt(ContactNumber)`). This preserves a unified Login portal irrespective of which node holds the student's telemetry.

---

### Endnote on Developer Tooling Overrides
*File: `app/vite.config.ts`*
```typescript
server: {
  watch: {
    // Required omission to prevent Vite CSS preprocessors from crashing upon scanning SQLite journal remnants (-wal, -shm) 
    ignored: ['**/sharding/**'] 
  }
}
```
This final patch secured the robustness of the developer hot-reload environment against our newly instantiated Docker volumes.

---

## 7. Migration to Production MySQL Cluster

While initial distributed development and Partition Tolerance simulations were completed using localized Dockerized SQLite instances, the final deployment pipeline transitions to **external, native MySQL engines**. We retained our precise hashing and routing architecture but seamlessly swapped the endpoint sink from HTTP proxies to high-throughput SQL database drivers.

### Configuration Topography
*   **Host Network**: `10.0.116.184`
*   **Shard 0**: Target DB `ACID_Alliance_S1` (Port: `3307`)
*   **Shard 1**: Target DB `ACID_Alliance_S2` (Port: `3308`)
*   **Shard 2**: Target DB `ACID_Alliance_S3` (Port: `3309`)

### Bridging the Backend
We integrated the `mysql2/promise` library to handle persistent tcp connection pools across these disparate endpoints seamlessly. The codebase was structurally hardwired to execute directly against these external instances, stripping out the localized Docker HTTP proxies entirely without modifying actual application logic.

*File: `app/sharding/mysql-pool.js`*
```javascript
import mysql from 'mysql2/promise';

export function getShardPools() {
  if (!shardPools) {
    shardPools = [
      mysql.createPool({ host: '10.0.116.184', port: 3307, database: 'ACID_Alliance_S1', ... }),
      mysql.createPool({ host: '10.0.116.184', port: 3308, database: 'ACID_Alliance_S2', ... }),
      mysql.createPool({ host: '10.0.116.184', port: 3309, database: 'ACID_Alliance_S3', ... }),
    ];
  }
  return shardPools;
}
```

The `router.js` continues to calculate the hash, and then branches instantly to direct TCP queries. All `Scatter-Gather` logic works identically against the unified Array of promises returned from the separate MySQL connections, proving the agnostic power of application-layer sharding abstraction!

---

## 8. System Hardening and Architectural Refinements

Following the immediate swap to the physical MySQL engines, several structural refinements and system bugs were resolved to stabilize production:

### 8.1 Centralized Secret Management
To scale easily, the sprawling `app/sharding` folder was natively disassembled, migrating all components (the customized `router.js`, `integrity.js`) into `app/src/db/`. A generic `constants.js` file was provisioned inside `src/config/`, housing the isolated IP strings, cluster ports, and database passwords universally across the application topology without hard-coding variables cross-file.

### 8.2 Overcoming Native MySQL Rigidity
Unlike SQLite's dynamic typings, MySQL natively throws unhandled exceptions during ETL ingestion without transparent bypasses:
* **The ENUM Truncation Fallback:** Specific constraints such as Gender types were transpiled from fixed `ENUM` types to fluid `VARCHAR(255)` tables inside the script, allowing edge data dynamically.
* **Redundant Constraint Fulfillment:** MySQL rigidly blocked Shard-specific `Allocation` insertions citing missing `Room` Foreign keys! Our ETL dynamically resolved this by forcing a deep-copy insertion loop of all `Rooms` and `Hostels` concurrently into local Shards simultaneously. This satisfies MySQL natively transparently.

### 8.3 The Scattering Ghost Math Bug (0733)
During Dashboard scatter-gather calculations natively, the logic returned statistical anomalies (e.g., *Total Residents: 0733*). Because the Node.js MySQL driver maps numerical aggregates to textual strings explicitly, mathematical computations (`7 + 3 + 3`) became String Concatenations (`"0" + "7" + "3" + "3"`). Resolving this required enforcing aggressive `Number()` serialization wrappers sequentially across API routers dynamically.

### 8.4 Synchronized Modals and Ghost Profiles
Frontend creation loops stalled indefinitely when encountering native database constraint duplications (for instances such as User profile generations locally). Our backend route now catches asynchronous `User` recreation bugs by wrapping interactions with `INSERT OR REPLACE` fallback handling logic, returning immediate 200 HTTP statuses seamlessly to ensure front-end React modals successfully de-render.
