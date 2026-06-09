export const NEURAL_SENSOR_NAMES = Object.freeze([
  'nearestReachableTrunkDistance',
  'nearestTrunkDirectionX',
  'nearestTrunkDirectionZ',
  'currentTargetDistance',
  'targetReachable',
  'targetBlacklisted',
  'playerGrounded',
  'stuckTimer',
  'blockedActionStreak',
  'recentRecoveryCount',
  'hunger',
  'health',
  'stamina',
  'nightDanger',
  'nearestHostileDistance',
  'woodInventory',
  'stoneInventory',
  'toolAvailability',
  'terrainSlopeRisk',
  'lastProgressSeconds',
  'distanceToBase',
  'goalProgress',
]);

export const NEURAL_SENSOR_COUNT = NEURAL_SENSOR_NAMES.length;

export class NeuralSensorSystem {
  collect({
    context = {},
    plan = {},
    resourceScanResults = null,
    terrainSafety = null,
    playerSafety = null,
    actionLoop = null,
    recoveryStats = {},
    plannerSnapshot = null,
  } = {}) {
    const nearestTarget = resourceScanResults?.nearestWoodTarget ?? null;
    const targetDistance = Number(nearestTarget?.distance ?? resourceScanResults?.woodTargetDistance ?? 999);
    const targetReachable = Boolean(nearestTarget && targetDistance <= 5.5);
    const targetBlacklisted = Boolean(nearestTarget?.blacklisted || resourceScanResults?.targetBlacklisted);
    const health = Number(context.survival?.health ?? 100);
    const hunger = Number(context.survival?.hunger ?? 100);
    const stamina = Number(context.survival?.stamina ?? 100);
    const slopeRisk = terrainSafety?.riskLevel === 'high'
      ? 1
      : terrainSafety?.riskLevel === 'medium'
        ? 0.5
        : 0;
    const nearestHostileDistance = Number(context.world?.nearestHostileDistance ?? (
      Number(context.world?.aggroHostiles ?? 0) > 0 ? 12 : 96
    ));
    const lastProgressSeconds = getCurrentGoalNoProgressSeconds(plannerSnapshot, plan.goalId);
    const distanceToBase = Number(context.world?.distanceToBase ?? playerSafety?.distanceFromSafePoint ?? 0);
    const direction = createDirectionSensors(nearestTarget);
    const sensorsByName = {
      nearestReachableTrunkDistance: invertDistance(targetDistance, 48),
      nearestTrunkDirectionX: direction.x,
      nearestTrunkDirectionZ: direction.z,
      currentTargetDistance: invertDistance(targetDistance, 64),
      targetReachable: targetReachable ? 1 : 0,
      targetBlacklisted: targetBlacklisted ? 1 : 0,
      playerGrounded: playerSafety?.isGrounded ? 1 : 0,
      stuckTimer: clamp01(Number(recoveryStats.stuckSeconds ?? 0) / 30),
      blockedActionStreak: clamp01(Number(actionLoop?.count ?? 0) / 12),
      recentRecoveryCount: clamp01(Number(recoveryStats.hardRecoveryCount ?? 0) / 4),
      hunger: clamp01(hunger / 100),
      health: clamp01(health / 100),
      stamina: clamp01(stamina / 100),
      nightDanger: Number(context.world?.isNight ?? false) ? 1 : 0,
      nearestHostileDistance: invertDistance(nearestHostileDistance, 64),
      woodInventory: clamp01(Number(context.inventory?.wood ?? 0) / 16),
      stoneInventory: clamp01(Number(context.inventory?.stone ?? 0) / 32),
      toolAvailability: Number(context.inventory?.pickaxes ?? 0) > 0 ? 1 : 0,
      terrainSlopeRisk: slopeRisk,
      lastProgressSeconds: clamp01(lastProgressSeconds / 60),
      distanceToBase: invertDistance(distanceToBase, 220),
      goalProgress: clamp01(Number(plan.progress ?? plannerSnapshot?.progress ?? 0)),
    };
    const inputs = NEURAL_SENSOR_NAMES.map((name) => sensorsByName[name] ?? 0);

    return {
      inputs,
      names: [...NEURAL_SENSOR_NAMES],
      values: sensorsByName,
      nearestTarget: nearestTarget ? { ...nearestTarget } : null,
    };
  }
}

function createDirectionSensors(target = null) {
  if (!target) {
    return { x: 0, z: 0 };
  }

  const worldX = Number(target.worldX ?? 0);
  const worldZ = Number(target.worldZ ?? 0);
  const magnitude = Math.hypot(worldX, worldZ) || 1;

  return {
    x: clampSigned(worldX / magnitude),
    z: clampSigned(worldZ / magnitude),
  };
}

function getCurrentGoalNoProgressSeconds(plannerSnapshot = null, goalId = null) {
  if (!goalId || !plannerSnapshot?.noProgressSecondsByGoal) {
    return 0;
  }

  return Number(plannerSnapshot.noProgressSecondsByGoal[goalId] ?? 0);
}

function invertDistance(distance, maximum) {
  if (!Number.isFinite(distance)) {
    return 0;
  }

  return clamp01(1 - Number(distance) / maximum);
}

function clamp01(value) {
  if (!Number.isFinite(Number(value))) {
    return 0;
  }

  return Math.max(0, Math.min(1, Number(value)));
}

function clampSigned(value) {
  if (!Number.isFinite(Number(value))) {
    return 0;
  }

  return Math.max(-1, Math.min(1, Number(value)));
}
