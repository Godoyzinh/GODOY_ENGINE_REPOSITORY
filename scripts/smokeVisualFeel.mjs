import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { AudioFeedbackSystem } from '../src/audio/audioFeedbackSystem.js';
import { AmbientParticleSystem } from '../src/engine/ambientParticleSystem.js';
import { FeedbackParticleSystem } from '../src/engine/feedbackParticleSystem.js';
import { SkySystem } from '../src/engine/skySystem.js';

assertSkyFollowsCameraAndWeather();
assertAmbientParticlesUpdate();
assertFeedbackParticlesPool();
assertProceduralAudioCuesWithoutBrowserAudio();

console.log('smoke:visual-feel ok');

function assertSkyFollowsCameraAndWeather() {
  const skySystem = new SkySystem();
  const cameraPosition = new Vector3(3, 8, -5);

  skySystem.update({
    dayNightSnapshot: {
      daylight: 0.82,
      timeOfDay: 0.26,
      isNight: false,
    },
    weatherSnapshot: {
      state: 'clear',
      intensity: 0,
    },
    cameraPosition,
  });

  assert.equal(skySystem.group.position.x, cameraPosition.x);
  assert.ok(skySystem.getSnapshot().sunOpacity > 0.5, 'day sky should show the sun');
  skySystem.dispose();
}

function assertAmbientParticlesUpdate() {
  const ambientParticles = new AmbientParticleSystem({ particleCount: 8 });

  ambientParticles.update({
    deltaTime: 0.016,
    elapsedTime: 4,
    focusPosition: new Vector3(0, 6, 0),
    weatherSnapshot: {
      state: 'rain',
      isRaining: true,
      isFoggy: false,
      intensity: 0.7,
    },
    dayNightSnapshot: {
      isNight: false,
    },
    terrainStats: {
      activeBiome: 'Plains',
    },
  });

  assert.equal(ambientParticles.getSnapshot().activeParticles, 8);
  assert.equal(ambientParticles.getSnapshot().particleMode, 'rain');
  ambientParticles.dispose();
}

function assertFeedbackParticlesPool() {
  const feedbackParticles = new FeedbackParticleSystem({ maxParticles: 8 });

  feedbackParticles.emitHit({
    position: new Vector3(0, 1, 0),
    color: '#ff9c7a',
  });
  feedbackParticles.update(0.016);

  assert.ok(feedbackParticles.getSnapshot().activeParticles > 0, 'hit burst should activate particles');
  feedbackParticles.dispose();
}

function assertProceduralAudioCuesWithoutBrowserAudio() {
  const audioFeedback = new AudioFeedbackSystem();

  audioFeedback.applySettings({ audioVolume: 0.5 });
  assert.equal(audioFeedback.playCue('ui'), false, 'Node smoke should not require Web Audio');
  audioFeedback.update({
    deltaTime: 0.25,
    playerController: {
      movementSystem: {
        isGrounded: true,
        playerState: { isFlying: false },
        horizontalVelocity: { length: () => 6 },
      },
    },
    weatherSnapshot: {
      state: 'clear',
      isRaining: false,
      isFoggy: false,
    },
    dayNightSnapshot: {
      isNight: false,
    },
    terrainStats: {
      activeBiome: 'Plains',
    },
  });

  assert.equal(audioFeedback.getSnapshot().lastCue, 'footstep');
  assert.ok(audioFeedback.getSnapshot().pendingCues.includes('ui'));
  assert.ok(audioFeedback.getSnapshot().pendingCues.includes('footstep'));
  audioFeedback.dispose();
}
