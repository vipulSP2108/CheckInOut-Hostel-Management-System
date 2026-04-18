/**
 * Sharding Configuration
 */
import { DB_CONSTANTS } from './constants.js';

export const SHARD_COUNT = DB_CONSTANTS.SHARDS.length;

export const SHARD_NODES = DB_CONSTANTS.SHARDS;

export const GLOBAL_TABLES = [
  'Hostel',
  'Room',
  'RoomType',
  'FurnitureType',
  'ComplaintCategory',
  'Users', // Admins are global
  'FeeCategory',
  'AuditLog'
];

export const SHARDED_TABLES = [
  'Member',
  'Allocation',
  'Complaint',
  'Visitor',
  'QRScanLog',
  'MaintenanceRequest',
  'FeePayment'
];

/**
 * Hash function to determine the shard for a given key
 * @param {string} key - The Shard Key (IdentificationNumber)
 * @returns {number} - The Shard ID (0 to SHARD_COUNT - 1)
 */
export function getShardId(key) {
  if (!key) return 0;
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash) % SHARD_COUNT;
}
