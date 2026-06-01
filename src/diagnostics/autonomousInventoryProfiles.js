export {
  DEFAULT_INVENTORY_PROFILE_ID as DEFAULT_AUTONOMOUS_INVENTORY_PROFILE_ID,
  INVENTORY_PROFILE_IDS as AUTONOMOUS_INVENTORY_PROFILE_IDS,
  INVENTORY_PROFILE_OPTIONS as AUTONOMOUS_INVENTORY_PROFILE_OPTIONS,
  createHeadlessInventoryForProfile,
  createInventoryStacksForProfile as createEngineInventoryStacksForProfile,
  getInventoryProfile as getAutonomousInventoryProfile,
  normalizeInventoryProfileId as normalizeAutonomousInventoryProfileId,
} from '../player/inventoryProfiles.js';
