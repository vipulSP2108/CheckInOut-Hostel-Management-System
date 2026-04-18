# Sharding Demo Guide - Hostel Management System

This directory contains scripts and documentation to demonstrate the sharding capabilities of the CheckInOut Hostel Management System.

## 1. Theory: Sharding & Partitioning Logic

### What is Sharding?
Sharding is a database architecture pattern where data is horizontally partitioned across multiple database instances (shards). This allows the system to scale beyond the capacity of a single server.

### Shard Key: `IdentificationNumber`
In this system, the **IdentificationNumber** is used as the **Shard Key**. This is a unique identifier assigned to every member (student/resident).

### Partitioning Logic
We use a **Consistent Hashing** logic to determine which shard a record belongs to.
- **Function**: `Math.abs(hash(IdentificationNumber)) % SHARD_COUNT`
- **Goal**: Ensure that all data related to a specific member (profile, allocations, complaints) is stored on the same shard to avoid complex cross-shard joins for member-specific operations.

---

## 2. Presentation Script

### Part A: Table Structure & Partitioning
> "First, let's look at how our data is distributed. We have two types of tables: **Global Tables** (like Hostel and Room) which are stored centrally in a global SQLite database, and **Sharded Tables** (like Member, Allocation, and Complaint) which are distributed across three MySQL shards.
>
> We use the `IdentificationNumber` as our shard key. This ensures that a student's data is always co-located. Let's run the partitioning demo to see how different IDs are routed."

**Command**: `node demo-partitioning.js`

### Part B: Targeted Query Routing
> "One of the main benefits of sharding is efficient lookups. If we know the Shard Key, the Router sends the query directly to the correct shard. Let's lookup a member with ID `2022001`. You'll notice it brings up their full profile—exactly what they'd see when logging into their dashboard—retrieved instantly from a single shard."

**Command**: `node demo-routing.js`

### Part C: Cross-Shard Aggregations
> "What about whole-cluster stats? A simple `COUNT(*)` becomes complex in a sharded environment because no single shard has all the data. Our Router handles this by scattering the query to all shards, gathering their individual counts, and summing them up to give us the total member count across the entire hostel system."

**Command**: `node demo-range-query.js`

---

## 3. Scalability Trade-offs Analysis

While sharding provides great horizontal scalability, it comes with certain trade-offs:

| Benefit | Challenge |
| :--- | :--- |
| **Increased Capacity**: Can store more data by adding shards. | **Complexity**: Application logic must be shard-aware (the Router). |
| **Higher Throughput**: Concurrent writes can happen across shards. | **Cross-Shard Queries**: Scatter-gather is more expensive than targeted queries. |
| **Fault Isolation**: One shard failure doesn't affect the entire system. | **Joins**: Joins across sharded tables are difficult and often avoided. |
| **Performance**: Targeted lookups are very fast. | **Hotspots**: Uneven distribution of data can lead to some shards being busier than others. |

---

## 4. Execution Commands Summary

Run these commands in order from this directory:

```bash
# 1. Start Shard Nodes (If using Docker manually)
# (Assuming your MySQL cluster is running at 10.0.116.184)

# 2. Run Partitioning Logic Demo
node demo-partitioning.js

# 3. Run Targeted Query Demo
node demo-routing.js

# 4. Run Multi-Shard Range Query Demo
node demo-range-query.js
```
