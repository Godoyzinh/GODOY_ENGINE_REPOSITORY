import { SHELTER_BLOCK_TARGET } from './shelterValidator.js';

export const SURVIVAL_GOAL_IDS = {
  gatherWood: 'gatherWood',
  craftPlanks: 'craftPlanks',
  craftTools: 'craftTools',
  craftWoodenPickaxe: 'craftWoodenPickaxe',
  gatherStone: 'gatherStone',
  buildShelter: 'buildShelter',
  surviveNight: 'surviveNight',
  obtainFurnace: 'obtainFurnace',
  smeltOre: 'smeltOre',
  upgradeEquipment: 'upgradeEquipment',
  exploreWorld: 'exploreWorld',
  discoverNewBiome: 'discoverNewBiome',
  discoverStructure: 'discoverStructure',
  createStorage: 'createStorage',
  buildBaseTier1: 'buildBaseTier1',
  buildStorage: 'buildStorage',
  buildBaseTier2: 'buildBaseTier2',
  createResourceReserve: 'createResourceReserve',
  buildPermanentBase: 'buildPermanentBase',
};

const NIGHT_SURVIVAL_TARGET_SECONDS = 6;
const NO_PROGRESS_BOTTLENECK_SECONDS = 30;
const STONE_TARGET_COUNT = 24;
const EXPLORE_WORLD_TARGET_DISTANCE = 180;
const DISCOVER_BIOME_TARGET_COUNT = 2;
const PERMANENT_BASE_BLOCK_TARGET = 24;
const STORAGE_RESERVE_TARGETS = {
  wood: 64,
  stone: 64,
  food: 32,
};

export const SURVIVAL_GOALS = [
  {
    id: SURVIVAL_GOAL_IDS.gatherWood,
    label: 'Gather Wood',
    priority: 100,
    requirements: ['Survival session is active.'],
    successCriteria: ['Inventory gains at least 3 wood blocks after the bot starts.'],
    failureCriteria: ['No wood progress for 90 seconds.'],
    target: '3 wood blocks',
    maxSeconds: 90,
    requirementsMet: () => true,
    isSuccessful: (context) => getDelta(context, 'wood') >= 3,
    getProgress: (context) => getDelta(context, 'wood') / 3,
    createPlan: (context) => ({
      action: 'gatherWood',
      subgoal: 'Find a nearby tree and mine wood.',
      reason: createWoodReason(context),
      target: `${Math.min(getDelta(context, 'wood'), 3)}/3 wood`,
    }),
  },
  {
    id: SURVIVAL_GOAL_IDS.craftPlanks,
    label: 'Craft Planks',
    priority: 90,
    requirements: ['At least 1 wood block.'],
    successCriteria: ['Inventory gains at least 4 wood planks after the bot starts.'],
    failureCriteria: ['No plank output for 45 seconds while wood is available.'],
    target: '4 wood planks',
    maxSeconds: 45,
    requirementsMet: (context) => getCount(context, 'wood') >= 1 || getDelta(context, 'planks') >= 4,
    isSuccessful: (context) => getDelta(context, 'planks') >= 4,
    getProgress: (context) => getDelta(context, 'planks') / 4,
    createPlan: (context) => ({
      action: 'craftPlanks',
      subgoal: 'Craft wood into planks.',
      reason: 'Planks are the first material gate for tooling and shelter preparation.',
      target: `${Math.min(getDelta(context, 'planks'), 4)}/4 planks`,
    }),
  },
  {
    id: SURVIVAL_GOAL_IDS.craftTools,
    label: 'Craft Tools',
    priority: 80,
    requirements: ['At least 2 planks are available for the tool chain.'],
    successCriteria: ['Inventory gains at least 2 sticks.'],
    failureCriteria: ['No stick output for 60 seconds.'],
    target: '2 sticks',
    maxSeconds: 60,
    requirementsMet: (context) => getCount(context, 'planks') >= 2 || getDelta(context, 'sticks') >= 2,
    isSuccessful: (context) => getDelta(context, 'sticks') >= 2,
    getProgress: (context) => getDelta(context, 'sticks') / 2,
    createPlan: (context) => ({
      action: 'craftTools',
      subgoal: 'Prepare basic tools from planks and sticks.',
      reason: 'Tools make stone gathering and combat checks part of a real survival route.',
      target: `${Math.min(getDelta(context, 'sticks'), 2)}/2 sticks`,
    }),
  },
  {
    id: SURVIVAL_GOAL_IDS.craftWoodenPickaxe,
    label: 'Craft Wooden Pickaxe',
    priority: 75,
    requirements: ['At least 2 sticks and 2 planks, or wood that can be crafted into planks.'],
    successCriteria: ['An actual pickaxe item exists in inventory.'],
    failureCriteria: ['No wooden pickaxe craft output for 60 seconds while handle materials are available.'],
    target: '1 wooden pickaxe',
    maxSeconds: 60,
    requirementsMet: (context) => hasMiningPickaxe(context) || (
      getCount(context, 'sticks') >= 2 &&
      (getCount(context, 'planks') >= 2 || getCount(context, 'wood') >= 1)
    ),
    isSuccessful: (context) => hasMiningPickaxe(context),
    getProgress: (context) => Math.min(getCount(context, 'pickaxes'), 1),
    createPlan: (context) => {
      if (getCount(context, 'planks') < 2 && getCount(context, 'wood') >= 1) {
        return {
          action: 'craftPlanks',
          subgoal: 'Craft extra planks for the wooden pickaxe head.',
          reason: 'Gather Stone requires a real pickaxe, not assumed hand-mining readiness.',
          target: `${Math.min(getCount(context, 'planks'), 2)}/2 planks`,
        };
      }

      return {
        action: 'craftWoodenPickaxe',
        subgoal: 'Craft a real wooden pickaxe from planks and sticks.',
        reason: 'Stone mining must prove an actual mining tool exists before the bot enters Gather Stone.',
        target: `${Math.min(getCount(context, 'pickaxes'), 1)}/1 pickaxe`,
      };
    },
  },
  {
    id: SURVIVAL_GOAL_IDS.gatherStone,
    label: 'Gather Stone',
    priority: 70,
    requirements: ['A real pickaxe item is available.'],
    successCriteria: [`Inventory gains at least ${STONE_TARGET_COUNT} stone after the bot starts.`],
    failureCriteria: ['No stone progress for 120 seconds.'],
    target: `${STONE_TARGET_COUNT} stone`,
    maxSeconds: 120,
    requirementsMet: (context) => hasMiningPickaxe(context),
    isSuccessful: (context) => getDelta(context, 'stone') >= STONE_TARGET_COUNT,
    getProgress: (context) => getDelta(context, 'stone') / STONE_TARGET_COUNT,
    createPlan: (context) => ({
      action: 'gatherStone',
      subgoal: 'Mine surface stone or rocks.',
      reason: `Stone is needed for furnace access and stronger progression loops. Equipped tool: ${getEquippedTool(context)}.`,
      target: `${Math.min(getDelta(context, 'stone'), STONE_TARGET_COUNT)}/${STONE_TARGET_COUNT} stone`,
    }),
  },
  {
    id: SURVIVAL_GOAL_IDS.buildShelter,
    label: 'Build Shelter',
    priority: 60,
    requirements: ['At least one placeable building block.'],
    successCriteria: [`Shelter footprint has at least ${SHELTER_BLOCK_TARGET} valid blocks and passes safety validation.`],
    failureCriteria: ['No shelter placement progress for 120 seconds.'],
    target: `${SHELTER_BLOCK_TARGET} shelter blocks`,
    maxSeconds: 120,
    requirementsMet: (context) => getCount(context, 'validBuildBlocks') > 0 || getCount(context, 'validShelterBlocksPlaced') >= SHELTER_BLOCK_TARGET,
    isSuccessful: (context) => getCount(context, 'validShelterBlocksPlaced') >= SHELTER_BLOCK_TARGET && Boolean(context.world?.shelterIsValid),
    getProgress: (context) => getCount(context, 'validShelterBlocksPlaced') / SHELTER_BLOCK_TARGET,
    createPlan: (context) => ({
      action: 'buildShelter',
      subgoal: 'Place a compact shelter shell around the player.',
      reason: 'A shelter gives the bot a concrete survival objective before night pressure.',
      target: `${Math.min(getCount(context, 'validShelterBlocksPlaced'), SHELTER_BLOCK_TARGET)}/${SHELTER_BLOCK_TARGET} valid shelter blocks`,
    }),
  },
  {
    id: SURVIVAL_GOAL_IDS.surviveNight,
    label: 'Survive Night',
    priority: 55,
    requirements: ['A valid shelter exists, or no hostile has aggro and safe-distance validation passes.'],
    successCriteria: ['Night survival drill completes while shelter or no-aggro safety is valid.'],
    failureCriteria: ['Death loop, hunger collapse, or no night safety progress for 180 seconds.'],
    target: `${NIGHT_SURVIVAL_TARGET_SECONDS}s protected survival`,
    maxSeconds: 180,
    requirementsMet: (context) => (
      Boolean(context.world?.shelterIsSafeForNight) ||
      Boolean(context.world?.safeDistanceNoAggro)
    ) && getStat(context, 'health', 100) > 30,
    isSuccessful: (context) => (
      (
        Boolean(context.world?.nightSurvived) ||
        getCount(context, 'nightSurvivedSeconds') >= NIGHT_SURVIVAL_TARGET_SECONDS
      ) && (
        Boolean(context.world?.shelterIsSafeForNight) ||
        Boolean(context.world?.safeDistanceNoAggro)
      )
    ),
    getProgress: (context) => getCount(context, 'nightSurvivedSeconds') / NIGHT_SURVIVAL_TARGET_SECONDS,
    createPlan: (context) => ({
      action: 'surviveNight',
      subgoal: 'Hold shelter, eat if needed, and fight only when threatened.',
      reason: 'The bot needs to prove the survival loop is stable before pushing into smelting.',
      target: `${Math.min(getCount(context, 'nightSurvivedSeconds'), NIGHT_SURVIVAL_TARGET_SECONDS).toFixed(1)}/${NIGHT_SURVIVAL_TARGET_SECONDS}s safe`,
    }),
  },
  {
    id: SURVIVAL_GOAL_IDS.obtainFurnace,
    label: 'Obtain Furnace',
    priority: 50,
    requirements: ['At least 8 furnace-compatible stone materials.'],
    successCriteria: ['Inventory gains at least 1 furnace after the bot starts.'],
    failureCriteria: ['No furnace craft output for 60 seconds while stone is available.'],
    target: '1 furnace',
    maxSeconds: 60,
    requirementsMet: (context) => getCount(context, 'furnaceMaterials') >= 8 || getDelta(context, 'furnace') >= 1,
    isSuccessful: (context) => getDelta(context, 'furnace') >= 1,
    getProgress: (context) => getDelta(context, 'furnace'),
    createPlan: (context) => ({
      action: 'obtainFurnace',
      subgoal: 'Craft a furnace from gathered stone.',
      reason: 'A furnace opens smelting, cooking, and equipment upgrade progression.',
      target: `${Math.min(getDelta(context, 'furnace'), 1)}/1 furnace`,
    }),
  },
  {
    id: SURVIVAL_GOAL_IDS.smeltOre,
    label: 'Smelt Ore',
    priority: 40,
    requirements: ['A furnace is available.'],
    successCriteria: ['Inventory gains at least 1 iron ingot after the bot starts.'],
    failureCriteria: ['No ore, fuel, or smelting progress for 120 seconds.'],
    target: '1 iron ingot',
    maxSeconds: 120,
    requirementsMet: (context) => getCount(context, 'furnace') >= 1,
    isSuccessful: (context) => getDelta(context, 'ironIngot') >= 1,
    getProgress: (context) => getDelta(context, 'ironIngot'),
    createPlan: (context) => createSmeltingPlan(context, {
      subgoal: 'Smelt the first iron ingot.',
      reason: 'A successful ingot proves the resource loop reaches metal progression.',
      target: `${Math.min(getDelta(context, 'ironIngot'), 1)}/1 ingot`,
    }),
  },
  {
    id: SURVIVAL_GOAL_IDS.upgradeEquipment,
    label: 'Upgrade Equipment',
    priority: 30,
    requirements: ['Furnace access and the stick/tool chain are available.'],
    successCriteria: ['Inventory gains at least one iron tool after the bot starts.'],
    failureCriteria: ['No iron tool progress for 180 seconds.'],
    target: '1 iron tool',
    maxSeconds: 180,
    requirementsMet: (context) => getCount(context, 'furnace') >= 1 && (
      hasMiningPickaxe(context) ||
      getCount(context, 'sticks') >= 2 ||
      getCount(context, 'planks') >= 2
    ),
    isSuccessful: (context) => getDelta(context, 'ironTools') >= 1,
    getProgress: (context) => getDelta(context, 'ironTools'),
    createPlan: (context) => {
      if (getCount(context, 'sticks') < 2) {
        return {
          action: 'craftTools',
          subgoal: 'Prepare sticks for iron tool handles.',
          reason: 'Iron equipment still needs the wood tooling chain.',
          target: `${Math.min(getCount(context, 'sticks'), 2)}/2 sticks`,
        };
      }

      if (!hasMiningPickaxe(context)) {
        return {
          action: 'craftWoodenPickaxe',
          subgoal: 'Replace missing wooden pickaxe before upgrading equipment.',
          reason: 'Iron equipment should build on a verified tool chain.',
          target: `${Math.min(getCount(context, 'pickaxes'), 1)}/1 pickaxe`,
        };
      }

      if (getCount(context, 'ironIngot') < 3) {
        return createSmeltingPlan(context, {
          subgoal: 'Smelt enough ingots for an iron tool.',
          reason: 'The next equipment tier needs three ingots plus sticks.',
          target: `${Math.min(getCount(context, 'ironIngot'), 3)}/3 ingots`,
        });
      }

      return {
        action: 'upgradeEquipment',
        subgoal: 'Craft the first iron tool.',
        reason: 'Iron equipment confirms the survival progression chain can advance tiers.',
        target: `${Math.min(getDelta(context, 'ironTools'), 1)}/1 iron tool`,
      };
    },
  },
  {
    id: SURVIVAL_GOAL_IDS.exploreWorld,
    label: 'Explore World',
    priority: 20,
    requirements: ['Iron tier has been reached.'],
    successCriteria: [`Bot travels at least ${EXPLORE_WORLD_TARGET_DISTANCE} blocks after iron tier progression.`],
    failureCriteria: ['No exploration distance progress for 180 seconds.'],
    target: `${EXPLORE_WORLD_TARGET_DISTANCE} explored blocks`,
    maxSeconds: 180,
    requirementsMet: (context) => hasIronTier(context),
    isSuccessful: (context) => hasIronTier(context) && getDelta(context, 'exploredDistance') >= EXPLORE_WORLD_TARGET_DISTANCE,
    getProgress: (context) => getDelta(context, 'exploredDistance') / EXPLORE_WORLD_TARGET_DISTANCE,
    createPlan: (context) => ({
      action: 'exploreWorld',
      subgoal: 'Travel outward from the starter area and sample world conditions.',
      reason: createExploreReason(context),
      target: `${Math.min(Math.round(getDelta(context, 'exploredDistance')), EXPLORE_WORLD_TARGET_DISTANCE)}/${EXPLORE_WORLD_TARGET_DISTANCE} explored blocks`,
    }),
  },
  {
    id: SURVIVAL_GOAL_IDS.discoverNewBiome,
    label: 'Discover New Biome',
    priority: 18,
    requirements: ['Iron tier has been reached and world exploration has started.'],
    successCriteria: [`At least ${DISCOVER_BIOME_TARGET_COUNT} distinct biomes are discovered during the run.`],
    failureCriteria: ['No new biome is discovered for 180 seconds.'],
    target: `${DISCOVER_BIOME_TARGET_COUNT} discovered biomes`,
    maxSeconds: 180,
    requirementsMet: (context) => hasIronTier(context) && (
      getCount(context, 'exploredDistance') > 0 ||
      getCount(context, 'uniqueBiomesDiscovered') >= DISCOVER_BIOME_TARGET_COUNT
    ),
    isSuccessful: (context) => hasIronTier(context) &&
      getDelta(context, 'exploredDistance') >= EXPLORE_WORLD_TARGET_DISTANCE &&
      getCount(context, 'uniqueBiomesDiscovered') >= DISCOVER_BIOME_TARGET_COUNT,
    getProgress: (context) => getCount(context, 'uniqueBiomesDiscovered') / DISCOVER_BIOME_TARGET_COUNT,
    createPlan: (context) => ({
      action: 'discoverNewBiome',
      subgoal: 'Leave the known biome and confirm a new biome in the world state.',
      reason: createBiomeReason(context),
      target: `${Math.min(getCount(context, 'uniqueBiomesDiscovered'), DISCOVER_BIOME_TARGET_COUNT)}/${DISCOVER_BIOME_TARGET_COUNT} biomes`,
    }),
  },
  {
    id: SURVIVAL_GOAL_IDS.discoverStructure,
    label: 'Discover Structure',
    priority: 17,
    requirements: ['Iron tier has been reached and world exploration has started.'],
    successCriteria: ['At least one structure is discovered after the bot starts.'],
    failureCriteria: ['No structure is discovered for 240 seconds.'],
    target: '1 discovered structure',
    maxSeconds: 240,
    requirementsMet: (context) => hasIronTier(context) && getCount(context, 'exploredDistance') > 0,
    isSuccessful: (context) => hasIronTier(context) && getDelta(context, 'structuresDiscovered') >= 1,
    getProgress: (context) => getDelta(context, 'structuresDiscovered'),
    createPlan: (context) => ({
      action: 'discoverStructure',
      subgoal: 'Search beyond the starter route for a village, ruin, camp, or loot point.',
      reason: createStructureReason(context),
      target: `${Math.min(getDelta(context, 'structuresDiscovered'), 1)}/1 structure`,
    }),
  },
  {
    id: SURVIVAL_GOAL_IDS.createStorage,
    label: 'Create Storage',
    priority: 16,
    requirements: ['Iron tier has been reached.'],
    successCriteria: ['A storage chest is crafted or placed after the run starts.'],
    failureCriteria: ['No storage output for 120 seconds.'],
    target: '1 storage chest',
    maxSeconds: 120,
    requirementsMet: (context) => hasIronTier(context),
    isSuccessful: (context) => hasIronTier(context) && (getDelta(context, 'storageCreated') >= 1 || getDelta(context, 'storageChest') >= 1),
    getProgress: (context) => Math.max(getDelta(context, 'storageCreated'), getDelta(context, 'storageChest')),
    createPlan: (context) => {
      if (getCount(context, 'planks') < 4 && getCount(context, 'wood') >= 1) {
        return {
          action: 'craftPlanks',
          subgoal: 'Craft planks for a storage chest.',
          reason: 'Storage needs a real wood-to-planks resource chain before it can count.',
          target: `${Math.min(getCount(context, 'planks'), 4)}/4 planks`,
        };
      }

      if (getCount(context, 'planks') < 4) {
        return {
          action: 'gatherWood',
          subgoal: 'Gather wood for storage construction.',
          reason: 'The storage goal is missing planks and must return to real resource gathering.',
          target: `${Math.min(getCount(context, 'wood'), 1)}/1 wood source`,
        };
      }

      return {
        action: 'createStorage',
        subgoal: 'Craft or place a storage chest from planks.',
        reason: 'Storage creates the first durable base organization milestone.',
        target: `${Math.min(Math.max(getDelta(context, 'storageCreated'), getDelta(context, 'storageChest')), 1)}/1 storage`,
      };
    },
  },
  {
    id: SURVIVAL_GOAL_IDS.buildBaseTier1,
    label: 'Build Base Tier 1',
    priority: 15,
    requirements: ['A safe shelter and furnace are available.'],
    successCriteria: ['The base reaches Tier 1 with shelter and furnace access.'],
    failureCriteria: ['Base Tier 1 does not validate for 120 seconds.'],
    target: 'base tier 1',
    maxSeconds: 120,
    requirementsMet: (context) => hasIronTier(context) && getCount(context, 'furnace') >= 1 && Boolean(context.world?.shelterIsValid),
    isSuccessful: (context) => getCount(context, 'baseTier') >= 1,
    getProgress: (context) => Math.min(getCount(context, 'baseTier'), 1),
    createPlan: () => ({
      action: 'buildBaseTier1',
      subgoal: 'Anchor the shelter and furnace into a Tier 1 base.',
      reason: 'Tier 1 proves the temporary shelter can become a persistent base.',
      target: 'tier 1 base',
    }),
  },
  {
    id: SURVIVAL_GOAL_IDS.buildStorage,
    label: 'Build Storage',
    priority: 14,
    requirements: ['Storage exists and can accept resources.'],
    successCriteria: ['The bot stores and retrieves resources from storage.'],
    failureCriteria: ['No storage operation succeeds for 120 seconds.'],
    target: 'working storage',
    maxSeconds: 120,
    requirementsMet: (context) => hasIronTier(context) && (
      getCount(context, 'storageCreated') >= 1 ||
      getCount(context, 'storageChest') >= 1
    ),
    isSuccessful: (context) => getDelta(context, 'storageStores') >= 1 && getDelta(context, 'storageRetrieves') >= 1,
    getProgress: (context) => (getDelta(context, 'storageStores') + getDelta(context, 'storageRetrieves')) / 2,
    createPlan: (context) => {
      if (getCount(context, 'wood') + getCount(context, 'stone') + getCount(context, 'food') < 1) {
        return {
          action: hasMiningPickaxe(context) ? 'gatherStone' : 'gatherWood',
          subgoal: 'Gather a resource before testing storage.',
          reason: 'Storage cannot be validated without a real resource to store.',
          target: '1 storable resource',
        };
      }

      return {
        action: 'buildStorage',
        subgoal: 'Store and retrieve resources through the placed chest.',
        reason: 'A base needs working storage, not just a decorative chest.',
        target: `${Math.min(getDelta(context, 'storageStores'), 1)}/1 store, ${Math.min(getDelta(context, 'storageRetrieves'), 1)}/1 retrieve`,
      };
    },
  },
  {
    id: SURVIVAL_GOAL_IDS.buildBaseTier2,
    label: 'Build Base Tier 2',
    priority: 13,
    requirements: ['Tier 1 base, working storage, and extra tools are available.'],
    successCriteria: ['The base reaches Tier 2 with storage and tool reserve.'],
    failureCriteria: ['Base Tier 2 does not validate for 180 seconds.'],
    target: 'base tier 2',
    maxSeconds: 180,
    requirementsMet: (context) => hasIronTier(context) &&
      getCount(context, 'baseTier') >= 1 &&
      getCount(context, 'storageCreated') >= 1,
    isSuccessful: (context) => getCount(context, 'baseTier') >= 2,
    getProgress: (context) => Math.min(getCount(context, 'baseTier') / 2, 1),
    createPlan: (context) => {
      if (getCount(context, 'extraToolsStored') < 1 && getCount(context, 'ironTools') < 1 && getCount(context, 'pickaxes') < 1) {
        return {
          action: 'craftWoodenPickaxe',
          subgoal: 'Prepare an extra tool for base storage.',
          reason: 'Tier 2 needs a verified tool reserve.',
          target: '1 extra tool',
        };
      }

      return {
        action: 'buildBaseTier2',
        subgoal: 'Upgrade the base with storage and an extra tool reserve.',
        reason: 'Tier 2 makes the base useful after respawns or long expeditions.',
        target: 'tier 2 base',
      };
    },
  },
  {
    id: SURVIVAL_GOAL_IDS.createResourceReserve,
    label: 'Create Resource Reserve',
    priority: 12,
    requirements: ['Tier 2 base and working storage are available.'],
    successCriteria: [`Storage reserves reach ${STORAGE_RESERVE_TARGETS.wood} wood, ${STORAGE_RESERVE_TARGETS.stone} stone, and ${STORAGE_RESERVE_TARGETS.food} food.`],
    failureCriteria: ['No storage reserve progress for 360 seconds.'],
    target: `${STORAGE_RESERVE_TARGETS.wood}/${STORAGE_RESERVE_TARGETS.stone}/${STORAGE_RESERVE_TARGETS.food} stored reserves`,
    maxSeconds: 360,
    requirementsMet: (context) => hasIronTier(context) &&
      getCount(context, 'baseTier') >= 2 &&
      getCount(context, 'storageCreated') >= 1,
    isSuccessful: (context) => getReserveScore(context) >= 3,
    getProgress: (context) => (
      Math.min(getStoredReserve(context, 'wood') / STORAGE_RESERVE_TARGETS.wood, 1) +
      Math.min(getStoredReserve(context, 'stone') / STORAGE_RESERVE_TARGETS.stone, 1) +
      Math.min(getStoredReserve(context, 'food') / STORAGE_RESERVE_TARGETS.food, 1)
    ) / 3,
    createPlan: (context) => createReservePlan(context, 'Resource reserves need real gathered materials before the permanent base can validate.'),
  },
  {
    id: SURVIVAL_GOAL_IDS.buildPermanentBase,
    label: 'Build Permanent Base',
    priority: 11,
    requirements: ['Tier 2 base and storage reserves are ready.'],
    successCriteria: [`Permanent base reaches Tier 3 with ${PERMANENT_BASE_BLOCK_TARGET} blocks and reserve targets.`],
    failureCriteria: ['No base construction or reserve progress for 600 seconds.'],
    target: `tier 3 base with ${STORAGE_RESERVE_TARGETS.wood}/${STORAGE_RESERVE_TARGETS.stone}/${STORAGE_RESERVE_TARGETS.food} reserves`,
    maxSeconds: 600,
    requirementsMet: (context) => hasIronTier(context) && getCount(context, 'baseTier') >= 2 && getReserveScore(context) >= 3,
    isSuccessful: (context) => hasIronTier(context) &&
      getCount(context, 'baseTier') >= 3 &&
      getDelta(context, 'permanentBaseBlocksPlaced') >= PERMANENT_BASE_BLOCK_TARGET &&
      getReserveScore(context) >= 3,
    getProgress: (context) => Math.min(1, (
      getDelta(context, 'permanentBaseBlocksPlaced') / PERMANENT_BASE_BLOCK_TARGET +
      getReserveScore(context) / 3
    ) / 2),
    createPlan: (context) => {
      const missingReserve = getMissingReserve(context);

      if (missingReserve) {
        if (missingReserve === 'food' && getCount(context, 'food') < 4) {
          return {
            action: 'gatherFood',
            subgoal: 'Gather food before stocking permanent base reserves.',
            reason: 'Tier 3 requires food reserves, not just blocks.',
            target: `${Math.min(getStoredReserve(context, 'food'), STORAGE_RESERVE_TARGETS.food)}/${STORAGE_RESERVE_TARGETS.food} food reserve`,
          };
        }

        if (missingReserve === 'wood' && getCount(context, 'wood') < 4) {
          return {
            action: 'gatherWood',
            subgoal: 'Gather wood before stocking permanent base reserves.',
            reason: 'Tier 3 requires a real wood reserve.',
            target: `${Math.min(getStoredReserve(context, 'wood'), STORAGE_RESERVE_TARGETS.wood)}/${STORAGE_RESERVE_TARGETS.wood} wood reserve`,
          };
        }

        if (missingReserve === 'stone' && getCount(context, 'stone') < 4) {
          return {
            action: 'gatherStone',
            subgoal: 'Gather stone before stocking permanent base reserves.',
            reason: 'Tier 3 requires a real stone reserve.',
            target: `${Math.min(getStoredReserve(context, 'stone'), STORAGE_RESERVE_TARGETS.stone)}/${STORAGE_RESERVE_TARGETS.stone} stone reserve`,
          };
        }

        return {
          action: 'maintainStorageReserves',
          subgoal: `Store ${missingReserve} in permanent base reserves.`,
          reason: 'Permanent base validation needs stored reserves, not loose inventory.',
          target: `${missingReserve} reserve`,
        };
      }

      if (getCount(context, 'validBuildBlocks') < 1) {
        return {
          action: hasMiningPickaxe(context) ? 'gatherStone' : 'gatherWood',
          subgoal: 'Gather valid permanent base material.',
          reason: 'Permanent base progress must come from real building resources.',
          target: `${Math.min(getCount(context, 'validBuildBlocks'), 1)}/1 valid block`,
        };
      }

      return {
        action: 'buildPermanentBase',
        subgoal: 'Finalize the Tier 3 permanent base footprint.',
        reason: 'A permanent base turns survival progression into a reusable world anchor with reserves.',
        target: `${Math.min(getDelta(context, 'permanentBaseBlocksPlaced'), PERMANENT_BASE_BLOCK_TARGET)}/${PERMANENT_BASE_BLOCK_TARGET} base blocks`,
      };
    },
  },
];

export class SurvivalGoalPlanner {
  constructor({ goals = SURVIVAL_GOALS } = {}) {
    this.goals = [...goals].sort((left, right) => right.priority - left.priority);
    this.aiMemorySnapshot = null;
    this.reset();
  }

  reset() {
    this.completedGoals = [];
    this.failedGoals = [];
    this.completedGoalIds = new Set();
    this.failedGoalIds = new Set();
    this.timeSpentByGoal = Object.fromEntries(this.goals.map((goal) => [goal.id, 0]));
    this.lastProgressByGoal = new Map();
    this.noProgressSecondsByGoal = new Map();
    this.repeatedSkipsByGoal = new Map();
    this.bottlenecks = [];
    this.goalTransitions = [];
    this.activeGoalId = null;
    this.currentPlan = null;
    this.initialInventory = null;
    this.initialWorld = null;
    this.lastContext = {};
    this.progressionTierReached = 'starter';
  }

  setAiMemorySnapshot(aiMemorySnapshot) {
    this.aiMemorySnapshot = aiMemorySnapshot ?? null;
  }

  update({ deltaTime, elapsedSeconds, context = {} }) {
    this.captureBaseline(context);

    const progressContext = this.createProgressContext(context);
    progressContext.memory = context.memory ?? this.aiMemorySnapshot?.strategyHints ?? null;

    this.lastContext = progressContext;
    this.completeSatisfiedGoals(progressContext, elapsedSeconds);
    this.progressionTierReached = resolveProgressionTier(progressContext, this.completedGoalIds);

    const goal = this.selectGoal(progressContext);

    if (!goal) {
      this.currentPlan = this.createBlockedPlan(progressContext, elapsedSeconds);
      return this.currentPlan;
    }

    if (this.activeGoalId !== goal.id) {
      this.recordGoalTransition({
        type: 'selected',
        fromGoalId: this.activeGoalId,
        toGoalId: goal.id,
        toGoalName: goal.label,
        reason: 'Highest-priority available survival goal selected.',
        atSeconds: elapsedSeconds,
      });
      this.activeGoalId = goal.id;
      this.repeatedSkipsByGoal.set(goal.id, 0);
    }

    this.timeSpentByGoal[goal.id] = (this.timeSpentByGoal[goal.id] ?? 0) + deltaTime;

    const progress = clamp01(goal.getProgress(progressContext));
    const lastProgress = this.lastProgressByGoal.get(goal.id) ?? progress;
    this.lastProgressByGoal.set(goal.id, progress);
    this.updateProgressHealth({
      goal,
      progress,
      lastProgress,
      deltaTime,
      elapsedSeconds,
      context: progressContext,
    });

    if (
      this.timeSpentByGoal[goal.id] > goal.maxSeconds &&
      progress <= lastProgress + 0.01
    ) {
      this.failGoal(goal, elapsedSeconds, `No progress on ${goal.label} after ${goal.maxSeconds}s.`);
      return this.update({ deltaTime: 0, elapsedSeconds, context });
    }

    const plan = goal.createPlan(progressContext);
    this.currentPlan = {
      goalId: goal.id,
      goalName: goal.label,
      priority: goal.priority,
      action: plan.action,
      subgoal: plan.subgoal,
      reason: plan.reason,
      target: plan.target ?? goal.target,
      progress,
    };

    return this.currentPlan;
  }

  recordStepResult({ plan, result, elapsedSeconds }) {
    if (!plan?.goalId || result?.ok) {
      if (plan?.goalId) {
        this.repeatedSkipsByGoal.set(plan.goalId, 0);
      }

      return;
    }

    const skipCount = (this.repeatedSkipsByGoal.get(plan.goalId) ?? 0) + 1;

    this.repeatedSkipsByGoal.set(plan.goalId, skipCount);

    if (skipCount < 4) {
      return;
    }

    this.addBottleneck({
      code: `goal-step-blocked:${plan.goalId}`,
      goalId: plan.goalId,
      goalName: plan.goalName,
      summary: `Planner action "${plan.action}" could not advance ${plan.goalName}.`,
      atSeconds: elapsedSeconds,
    });
  }

  recordBottleneck({ code, goalId, goalName, summary, atSeconds }) {
    this.addBottleneck({
      code,
      goalId,
      goalName,
      summary,
      atSeconds,
    });
  }

  getInventorySnapshot(context = this.lastContext) {
    const inventory = context.inventory ?? {};

    return {
      initial: { ...(this.initialInventory ?? {}) },
      current: { ...inventory },
      delta: Object.fromEntries(
        Object.keys({
          ...(this.initialInventory ?? {}),
          ...inventory,
        }).map((key) => [key, getDelta(context, key)]),
      ),
    };
  }

  getSnapshot() {
    return {
      currentGoal: this.currentPlan?.goalName ?? 'Idle',
      currentGoalId: this.currentPlan?.goalId ?? null,
      currentSubgoal: this.currentPlan?.subgoal ?? 'No active subgoal.',
      reason: this.currentPlan?.reason ?? 'Autonomous playtest is not running a survival plan.',
      progress: round(this.currentPlan?.progress ?? 0, 3),
      target: this.currentPlan?.target ?? 'None',
      progressionTierReached: this.progressionTierReached,
      goalsCompleted: this.completedGoals.map((goal) => ({ ...goal })),
      goalsFailed: this.failedGoals.map((goal) => ({ ...goal })),
      timeSpentByGoal: roundRecord(this.timeSpentByGoal),
      noProgressSecondsByGoal: roundRecord(Object.fromEntries(this.noProgressSecondsByGoal.entries())),
      bottlenecks: this.bottlenecks.map((bottleneck) => ({ ...bottleneck })),
      goalTransitions: this.goalTransitions.map((transition) => ({ ...transition })),
      allGoals: this.goals.map((goal) => ({
        id: goal.id,
        label: goal.label,
        priority: goal.priority,
        status: this.resolveGoalStatus(goal.id),
        progress: this.completedGoalIds.has(goal.id)
          ? 1
          : round(clamp01(goal.getProgress(this.lastContext)), 3),
        requirements: [...goal.requirements],
        successCriteria: [...goal.successCriteria],
        failureCriteria: [...goal.failureCriteria],
      })),
    };
  }

  completeSatisfiedGoals(context, elapsedSeconds) {
    for (const goal of this.goals) {
      if (this.completedGoalIds.has(goal.id) || this.failedGoalIds.has(goal.id)) {
        continue;
      }

      if (!goal.isSuccessful(context)) {
        continue;
      }

      this.completedGoalIds.add(goal.id);
      this.completedGoals.push({
        id: goal.id,
        label: goal.label,
        priority: goal.priority,
        completedAtSeconds: round(elapsedSeconds, 2),
        timeSpentSeconds: round(this.timeSpentByGoal[goal.id] ?? 0, 2),
      });
      this.recordGoalTransition({
        type: 'completed',
        goalId: goal.id,
        goalName: goal.label,
        reason: `${goal.label} met its success criteria.`,
        atSeconds: elapsedSeconds,
      });
    }
  }

  selectGoal(context) {
    return this.goals.find((goal) => (
      !this.completedGoalIds.has(goal.id) &&
      !this.failedGoalIds.has(goal.id) &&
      goal.requirementsMet(context)
    )) ?? null;
  }

  captureBaseline(context) {
    if (this.initialInventory) {
      return;
    }

    this.initialInventory = { ...(context.inventory ?? {}) };
    this.initialWorld = { ...(context.world ?? {}) };
  }

  createProgressContext(context) {
    const inventory = context.inventory ?? {};
    const world = context.world ?? {};

    return {
      ...context,
      inventory,
      world,
      progressDeltas: {
        inventory: createDeltaRecord(inventory, this.initialInventory ?? {}),
        world: createDeltaRecord(world, this.initialWorld ?? {}),
      },
    };
  }

  updateProgressHealth({ goal, progress, lastProgress, deltaTime, elapsedSeconds, context }) {
    if (progress > lastProgress + 0.001) {
      this.noProgressSecondsByGoal.set(goal.id, 0);
      return;
    }

    const noProgressSeconds = (this.noProgressSecondsByGoal.get(goal.id) ?? 0) + deltaTime;

    this.noProgressSecondsByGoal.set(goal.id, noProgressSeconds);

    if (noProgressSeconds < NO_PROGRESS_BOTTLENECK_SECONDS) {
      return;
    }

    if (goal.id === SURVIVAL_GOAL_IDS.craftTools && getDelta(context, 'sticks') < 1) {
      this.addBottleneck({
        code: 'missing-sticks',
        goalId: goal.id,
        goalName: goal.label,
        summary: 'Target remained 0/2 sticks for more than 30 seconds.',
        atSeconds: elapsedSeconds,
      });
      return;
    }

    this.addBottleneck({
      code: `goal-no-progress:${goal.id}`,
      goalId: goal.id,
      goalName: goal.label,
      summary: `${goal.label} made no measurable resource progress for ${NO_PROGRESS_BOTTLENECK_SECONDS}s.`,
      atSeconds: elapsedSeconds,
    });
  }

  createBlockedPlan(context, elapsedSeconds) {
    const blockedGoal = this.goals.find((goal) => (
      !this.completedGoalIds.has(goal.id) &&
      !this.failedGoalIds.has(goal.id)
    ));

    if (blockedGoal) {
      this.addBottleneck({
        code: `goal-requirements-blocked:${blockedGoal.id}`,
        goalId: blockedGoal.id,
        goalName: blockedGoal.label,
        summary: `${blockedGoal.label} is waiting on: ${blockedGoal.requirements.join('; ')}`,
        atSeconds: elapsedSeconds,
      });
    }

    if (!blockedGoal) {
      return {
        goalId: 'continueExploration',
        goalName: 'Continue Exploration',
        priority: 0,
        action: 'exploreWorld',
        subgoal: 'Keep exploring beyond the current Alpha progression ceiling.',
        reason: 'All current progression goals are complete, so the bot keeps seeking new knowledge instead of idling in maintain survival.',
        progress: 1,
        target: 'Find more world knowledge',
      };
    }

    return {
      goalId: blockedGoal.id,
      goalName: blockedGoal.label,
      priority: blockedGoal.priority,
      action: 'blocked',
      subgoal: 'Resolve missing requirements.',
      reason: 'The planner could not find an executable progression goal.',
      progress: clamp01(blockedGoal.getProgress(context)),
      target: blockedGoal.target,
    };
  }

  failGoal(goal, elapsedSeconds, summary) {
    this.failedGoalIds.add(goal.id);
    this.failedGoals.push({
      id: goal.id,
      label: goal.label,
      priority: goal.priority,
      failedAtSeconds: round(elapsedSeconds, 2),
      timeSpentSeconds: round(this.timeSpentByGoal[goal.id] ?? 0, 2),
      reason: summary,
    });
    this.addBottleneck({
      code: `goal-failed:${goal.id}`,
      goalId: goal.id,
      goalName: goal.label,
      summary,
      atSeconds: elapsedSeconds,
    });
    this.recordGoalTransition({
      type: 'failed',
      goalId: goal.id,
      goalName: goal.label,
      reason: summary,
      atSeconds: elapsedSeconds,
    });
  }

  addBottleneck({ code, goalId, goalName, summary, atSeconds }) {
    const existing = this.bottlenecks.find((bottleneck) => bottleneck.code === code);

    if (existing) {
      existing.count += 1;
      existing.lastAtSeconds = round(atSeconds, 2);
      return;
    }

    this.bottlenecks.push({
      code,
      goalId,
      goalName,
      summary,
      firstAtSeconds: round(atSeconds, 2),
      lastAtSeconds: round(atSeconds, 2),
      count: 1,
    });
    this.bottlenecks = this.bottlenecks.slice(-16);
  }

  recordGoalTransition({
    type,
    fromGoalId = null,
    toGoalId = null,
    toGoalName = null,
    goalId = null,
    goalName = null,
    reason,
    atSeconds,
  }) {
    this.goalTransitions.push({
      type,
      fromGoalId,
      toGoalId,
      toGoalName,
      goalId,
      goalName,
      reason,
      atSeconds: round(atSeconds, 2),
    });
    this.goalTransitions = this.goalTransitions.slice(-64);
  }

  resolveGoalStatus(goalId) {
    if (this.completedGoalIds.has(goalId)) {
      return 'completed';
    }

    if (this.failedGoalIds.has(goalId)) {
      return 'failed';
    }

    if (this.currentPlan?.goalId === goalId) {
      return 'active';
    }

    return 'pending';
  }
}

function createSmeltingPlan(context, { subgoal, reason, target }) {
  if (getCount(context, 'ironOre') < 1) {
    return {
      action: 'gatherOre',
      subgoal: 'Locate and mine iron ore.',
      reason,
      target: `${Math.min(getDelta(context, 'ironOre'), 1)}/1 ore`,
    };
  }

  if (getCount(context, 'fuel') < 1) {
    return {
      action: 'gatherFuel',
      subgoal: 'Gather fuel for smelting.',
      reason,
      target: `${Math.min(getCount(context, 'fuel'), 1)}/1 fuel`,
    };
  }

  return {
    action: 'smeltOre',
    subgoal,
    reason,
    target,
  };
}

function resolveProgressionTier(context, completedGoalIds) {
  if (
    getCount(context, 'baseTier') >= 3 ||
    getDelta(context, 'permanentBaseBlocksPlaced') >= PERMANENT_BASE_BLOCK_TARGET ||
    completedGoalIds.has(SURVIVAL_GOAL_IDS.buildPermanentBase)
  ) {
    return 'settled';
  }

  if (getDelta(context, 'ironTools') >= 1 || completedGoalIds.has(SURVIVAL_GOAL_IDS.upgradeEquipment)) {
    return 'iron';
  }

  if (getDelta(context, 'ironIngot') >= 1 || completedGoalIds.has(SURVIVAL_GOAL_IDS.smeltOre)) {
    return 'iron-prep';
  }

  if (getDelta(context, 'furnace') >= 1 || completedGoalIds.has(SURVIVAL_GOAL_IDS.obtainFurnace)) {
    return 'stone-forge';
  }

  if (getDelta(context, 'stone') >= 8 || completedGoalIds.has(SURVIVAL_GOAL_IDS.gatherStone)) {
    return 'stone';
  }

  if (getDelta(context, 'planks') >= 4 || completedGoalIds.has(SURVIVAL_GOAL_IDS.craftPlanks)) {
    return 'wood';
  }

  return 'starter';
}

function getCount(context, key) {
  return Number(context.inventory?.[key] ?? context.world?.[key] ?? 0);
}

function getDelta(context, key) {
  return Number(context.progressDeltas?.inventory?.[key] ?? context.progressDeltas?.world?.[key] ?? 0);
}

function hasMiningPickaxe(context) {
  return getCount(context, 'pickaxes') >= 1;
}

function getEquippedTool(context) {
  return context.world?.equippedTool ?? context.inventory?.equippedTool ?? 'hand';
}

function getStat(context, key, fallback) {
  return Number(context.survival?.[key] ?? fallback);
}

function hasIronTier(context) {
  return getDelta(context, 'ironTools') >= 1 ||
    getCount(context, 'ironTools') >= 1 ||
    context.progression?.equipmentTier === 'iron' ||
    context.progression?.currentTier === 'iron';
}

function createWoodReason(context) {
  const preferredWoodBiome = context.memory?.preferredWoodBiome;

  if (!preferredWoodBiome) {
    return 'Wood unlocks planks, sticks, shelter blocks, fuel, and early crafting.';
  }

  return `Wood unlocks planks, sticks, shelter blocks, fuel, and early crafting. Memory says ${preferredWoodBiome} has proven wood targets.`;
}

function createExploreReason(context) {
  const knownBiomes = context.memory?.knownBiomes ?? [];

  if (knownBiomes.length === 0) {
    return 'Iron tier is secure; the bot should map the wider world for future routes.';
  }

  return `Iron tier is secure; known memory biomes are ${knownBiomes.join(', ')}, so exploration should search beyond them.`;
}

function createBiomeReason(context) {
  const knownBiomes = context.memory?.knownBiomes ?? [];

  if (knownBiomes.length === 0) {
    return 'Biome discovery teaches the AI where future resources are likely to be found.';
  }

  return `Biome discovery should expand beyond remembered biomes: ${knownBiomes.join(', ')}.`;
}

function createStructureReason(context) {
  const knownStructures = context.memory?.knownStructures ?? [];

  if (knownStructures.length === 0) {
    return 'Structures can reveal loot, storage candidates, and safer expansion routes.';
  }

  return `Structure search should avoid repeating only known sites: ${knownStructures.slice(0, 3).map((structure) => structure.type ?? structure.id ?? 'structure').join(', ')}.`;
}

function createReservePlan(context, reason) {
  const missingReserve = getMissingReserve(context);

  if (!missingReserve) {
    return {
      action: 'maintainStorageReserves',
      subgoal: 'Verify storage reserve state.',
      reason,
      target: 'reserve targets complete',
    };
  }

  if (missingReserve === 'food' && getCount(context, 'food') < 4) {
    return {
      action: 'gatherFood',
      subgoal: 'Gather food before stocking permanent base reserves.',
      reason,
      target: `${Math.min(getStoredReserve(context, 'food'), STORAGE_RESERVE_TARGETS.food)}/${STORAGE_RESERVE_TARGETS.food} food reserve`,
    };
  }

  if (missingReserve === 'wood' && getCount(context, 'wood') < 4) {
    return {
      action: 'gatherWood',
      subgoal: 'Gather wood before stocking permanent base reserves.',
      reason,
      target: `${Math.min(getStoredReserve(context, 'wood'), STORAGE_RESERVE_TARGETS.wood)}/${STORAGE_RESERVE_TARGETS.wood} wood reserve`,
    };
  }

  if (missingReserve === 'stone' && getCount(context, 'stone') < 4) {
    return {
      action: 'gatherStone',
      subgoal: 'Gather stone before stocking permanent base reserves.',
      reason,
      target: `${Math.min(getStoredReserve(context, 'stone'), STORAGE_RESERVE_TARGETS.stone)}/${STORAGE_RESERVE_TARGETS.stone} stone reserve`,
    };
  }

  return {
    action: 'maintainStorageReserves',
    subgoal: `Store ${missingReserve} in permanent base reserves.`,
    reason,
    target: `${missingReserve} reserve`,
  };
}

function getReserveScore(context) {
  return ['wood', 'stone', 'food'].reduce((score, key) => (
    score + (getStoredReserve(context, key) >= STORAGE_RESERVE_TARGETS[key] ? 1 : 0)
  ), 0);
}

function getMissingReserve(context) {
  return ['wood', 'stone', 'food'].find((key) => getStoredReserve(context, key) < STORAGE_RESERVE_TARGETS[key]) ?? null;
}

function getStoredReserve(context, key) {
  const storageKey = `stored${key.slice(0, 1).toUpperCase()}${key.slice(1)}`;

  return getCount(context, storageKey);
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function roundRecord(record) {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, round(value, 2)]),
  );
}

function createDeltaRecord(currentRecord, initialRecord) {
  return Object.fromEntries(
    Object.keys({
      ...initialRecord,
      ...currentRecord,
    }).map((key) => [
      key,
      Number(currentRecord[key] ?? 0) - Number(initialRecord[key] ?? 0),
    ]),
  );
}

function round(value, digits) {
  const scale = 10 ** digits;

  return Math.round((Number(value) || 0) * scale) / scale;
}
