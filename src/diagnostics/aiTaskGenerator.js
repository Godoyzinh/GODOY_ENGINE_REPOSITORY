export const AI_TASK_CATEGORIES = {
  bug: 'bug',
  ux: 'UX',
  performance: 'performance',
  gameplay: 'gameplay',
  polish: 'polish',
};

export class AiTaskGenerator {
  createTasks(report) {
    const issues = report.issues ?? [];
    const tasks = [];

    for (const issue of issues) {
      tasks.push(this.createTaskFromIssue(issue, report));
    }

    if ((report.telemetry?.counts?.gameplayEvents ?? 0) === 0) {
      tasks.push({
        id: createTaskId(report, 'polish', 'telemetry-coverage'),
        category: AI_TASK_CATEGORIES.polish,
        priority: 'low',
        title: 'Improve telemetry event coverage',
        summary: 'The session report did not include gameplay events. Verify that normal player verbs are being captured.',
        evidence: 'Telemetry gameplayEvents count was 0.',
        proposedChange: 'Add focused telemetry hooks to the relevant gameplay systems without expanding data collection scope.',
      });
    }

    return dedupeTasks(tasks);
  }

  createTaskFromIssue(issue, report) {
    const category = classifyIssue(issue);

    return {
      id: createTaskId(report, category, issue.code),
      category,
      priority: issue.severity,
      title: issue.title,
      summary: issue.summary,
      evidence: issue.evidence,
      proposedChange: proposeChange(issue),
    };
  }
}

function classifyIssue(issue) {
  if (issue.category) {
    return issue.category;
  }

  if (issue.code.includes('fps')) {
    return AI_TASK_CATEGORIES.performance;
  }

  if (issue.code.includes('death') || issue.code.includes('combat')) {
    return AI_TASK_CATEGORIES.gameplay;
  }

  if (issue.code.includes('console')) {
    return AI_TASK_CATEGORIES.bug;
  }

  return AI_TASK_CATEGORIES.polish;
}

function proposeChange(issue) {
  if (issue.code === 'console-errors') {
    return 'Reproduce the session path, fix the source error, and add a focused smoke test when possible.';
  }

  if (issue.code === 'low-average-fps' || issue.code === 'low-min-fps') {
    return 'Profile chunk, entity, particle, and render costs before reducing visuals or render distance defaults.';
  }

  if (issue.code === 'player-deaths') {
    return 'Review hostile pressure, survival drain, spawn safety, and onboarding hints for early player sessions.';
  }

  return 'Review the report evidence, identify the owning module, and propose a scoped patch with Alpha verification.';
}

function createTaskId(report, category, code) {
  const baseId = report.id ?? 'local-report';

  return `${baseId}:${String(category).toLowerCase()}:${code}`;
}

function dedupeTasks(tasks) {
  const seen = new Set();
  const deduped = [];

  for (const task of tasks) {
    if (seen.has(task.id)) {
      continue;
    }

    seen.add(task.id);
    deduped.push(task);
  }

  return deduped;
}
