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
