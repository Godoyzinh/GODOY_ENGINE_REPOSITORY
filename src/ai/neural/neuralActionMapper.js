export const NEURAL_ACTIONS = Object.freeze([
  'moveForward',
  'turnLeft',
  'turnRight',
  'jump',
  'mine',
  'collect',
  'explore',
  'eatOrRecover',
]);

export class NeuralActionMapper {
  mapOutputs(outputs, { plan = {}, sensorSnapshot = null } = {}) {
    const scores = createActionScores(outputs);
    const selectedAction = selectAction(scores, {
      plan,
      sensorSnapshot,
    });

    return {
      selectedAction,
      actionScores: scores,
      neuralDecisionReason: createDecisionReason({
        selectedAction,
        plan,
        sensorSnapshot,
      }),
      mayRequestHardRecovery: false,
    };
  }
}

function createActionScores(outputs = []) {
  return Object.fromEntries(
    NEURAL_ACTIONS.map((action, index) => [action, Number(outputs[index] ?? 0)]),
  );
}

function selectAction(scores, { plan, sensorSnapshot }) {
  if (plan.action === 'gatherWood') {
    if (sensorSnapshot?.values?.targetReachable >= 1 && scores.mine >= scores.explore) {
      return 'mine';
    }

    if (sensorSnapshot?.values?.targetBlacklisted >= 1) {
      return 'explore';
    }
  }

  if (plan.action === 'surviveNight' && scores.eatOrRecover > 0) {
    return 'eatOrRecover';
  }

  return Object.entries(scores)
    .sort((left, right) => right[1] - left[1])[0]?.[0] ?? 'explore';
}

function createDecisionReason({ selectedAction, plan, sensorSnapshot }) {
  const targetDistance = sensorSnapshot?.nearestTarget?.distance;
  const goal = plan.goalName ?? plan.goalId ?? 'unknown goal';

  if (selectedAction === 'mine') {
    return `Neural local policy selected mine for ${goal}; reachable target distance ${targetDistance ?? 'unknown'}.`;
  }

  if (selectedAction === 'explore') {
    return `Neural local policy selected exploration for ${goal}; target may be missing or blocked.`;
  }

  return `Neural local policy selected ${selectedAction} for ${goal}.`;
}
