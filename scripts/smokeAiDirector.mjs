import assert from 'node:assert/strict';
import { AutoQaReportSystem } from '../src/diagnostics/autoQaReportSystem.js';
import { AiTaskGenerator } from '../src/diagnostics/aiTaskGenerator.js';
import { TelemetrySystem } from '../src/diagnostics/telemetrySystem.js';

assertTelemetryCountsAndConsoleCapture();
assertAutoQaReportAndTaskGeneration();
assertReportExportIntegrityTask();

console.log('smoke:ai-director ok');

function assertTelemetryCountsAndConsoleCapture() {
  let now = 0;
  const telemetry = new TelemetrySystem({
    now: () => now,
  });

  now = 16;
  telemetry.updateFrame(0.016);
  now = 32;
  telemetry.updateFrame(0.016);
  telemetry.recordGameplayEvent('mining', { block: 'Stone' });
  telemetry.recordGameplayEvent('building', { count: 3, blockId: 4 });
  telemetry.recordGameplayEvent('combat', { result: 'miss' });
  telemetry.recordGameplayEvent('combat-hit');
  telemetry.recordGameplayEvent('death', { source: 'attack' });
  telemetry.recordConsoleEvent('error', [new Error('Synthetic smoke error')], {
    source: 'C:/local/path/source.js',
  });

  const snapshot = telemetry.getSnapshot();

  assert.equal(snapshot.counts.mining, 1);
  assert.equal(snapshot.counts.building, 3);
  assert.equal(snapshot.counts.combat, 1);
  assert.equal(snapshot.counts.combatHits, 1);
  assert.equal(snapshot.counts.deaths, 1);
  assert.equal(snapshot.consoleErrors, 1);
  assert.equal(snapshot.consoleEvents[0].source, 'source.js');
  assert.ok(snapshot.fps.average >= 60);
}

function assertAutoQaReportAndTaskGeneration() {
  let now = 0;
  const telemetry = new TelemetrySystem({
    now: () => now,
  });
  const memoryStorage = createMemoryStorage();
  const reportSystem = new AutoQaReportSystem({
    telemetrySystem: telemetry,
    runtimeConfig: {
      appName: 'Godoy Engine',
      releaseVersion: 'v0.1.0-alpha',
      releaseChannel: 'Public Alpha',
      environmentName: 'test',
    },
    storage: memoryStorage,
  });

  for (let frame = 0; frame < 140; frame += 1) {
    now += 80;
    telemetry.updateFrame(0.08);
  }

  telemetry.recordGameplayEvent('mining', { block: 'Iron Ore' });
  telemetry.recordConsoleEvent('error', ['Renderer failed to allocate test buffer'], {
    source: 'rendererSystem.js',
  });

  const report = reportSystem.createReport({
    runtimeSnapshot: {
      renderer: {
        width: 1280,
        height: 720,
        pixelRatio: 1,
        isWebGL2: true,
        maxTextureSize: 4096,
        precision: 'highp',
        shadowsEnabled: true,
      },
      settings: {
        graphicsQuality: 'medium',
        renderDistancePreset: 'near',
        debugOverlay: false,
        controlsHelp: true,
      },
      terrain: {
        chunksLoaded: 9,
        activeBiome: 'Plains',
      },
      entities: {
        activeEntities: 4,
      },
      survival: {
        lastEvent: 'Ready',
      },
    },
  });

  const taskGenerator = new AiTaskGenerator();
  const tasks = taskGenerator.createTasks(report);

  assert.equal(report.schemaVersion, 1);
  assert.equal(report.privacy.automaticUpload, false);
  assert.ok(report.issues.some((issue) => issue.code === 'console-errors'));
  assert.ok(report.issues.some((issue) => issue.code === 'low-average-fps'));
  assert.ok(report.aiTasks.some((task) => task.category === 'bug'));
  assert.ok(tasks.length >= report.aiTasks.length);
  assert.ok(memoryStorage.getItem('godoy:auto-qa:last-report').includes(report.id));
  assert.equal(report.runtimeStats.renderer.width, 1280);
}

function assertReportExportIntegrityTask() {
  const telemetry = new TelemetrySystem({
    now: () => 0,
  });
  const reportSystem = new AutoQaReportSystem({
    telemetrySystem: telemetry,
    storage: createLossyReportStorage(),
  });

  telemetry.recordConsoleEvent('error', ['Synthetic export loss trigger'], {
    source: 'feedbackReport.js',
  });

  const report = reportSystem.createReport();

  assert.ok(
    report.issues.some((issue) => issue.code === 'report-export-integrity-loss'),
    'report export loss should create a bug issue',
  );
  assert.ok(
    report.aiTasks.some((task) => task.id.includes('report-export-integrity-loss')),
    'report export loss should create an AI task',
  );
}

function createMemoryStorage() {
  const values = new Map();

  return {
    setItem(key, value) {
      values.set(key, String(value));
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

function createLossyReportStorage() {
  const values = new Map();

  return {
    setItem(key, value) {
      const report = JSON.parse(String(value));

      report.issues = [];
      report.aiTasks = [];
      values.set(key, JSON.stringify(report));
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}
