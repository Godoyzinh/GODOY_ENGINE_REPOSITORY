import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';

export const PLAYER_SKIN_IDS = {
  alpha: 'alpha',
};

const DEFAULT_SKIN = {
  id: PLAYER_SKIN_IDS.alpha,
  head: '#f0c58a',
  torso: '#4f8edb',
  arm: '#f0c58a',
  leg: '#2d4059',
  accent: '#171d26',
};

const sharedBoxGeometry = new BoxGeometry(1, 1, 1);

export class PlayerAvatar {
  constructor({ skin = DEFAULT_SKIN } = {}) {
    this.skin = skin;
    this.group = new Group();
    this.group.name = 'PlayerAvatar';
    this.limbPhase = 0;
    this.animationTime = 0;
    this.landingTimer = 0;
    this.miningTimer = 0;
    this.state = 'idle';
    this.parts = new Map();

    this.createHumanoid();
  }

  createHumanoid() {
    this.parts.set('torso', this.createPart({
      name: 'Torso',
      color: this.skin.torso,
      scale: [0.78, 0.86, 0.34],
      position: [0, 1.12, 0],
    }));
    this.parts.set('head', this.createPart({
      name: 'Head',
      color: this.skin.head,
      scale: [0.46, 0.46, 0.46],
      position: [0, 1.78, 0],
    }));
    this.parts.set('face', this.createPart({
      name: 'Face',
      color: this.skin.accent,
      scale: [0.28, 0.08, 0.03],
      position: [0, 1.82, -0.245],
    }));
    this.parts.set('leftArm', this.createPart({
      name: 'LeftArm',
      color: this.skin.arm,
      scale: [0.22, 0.72, 0.24],
      position: [-0.56, 1.08, 0],
    }));
    this.parts.set('rightArm', this.createPart({
      name: 'RightArm',
      color: this.skin.arm,
      scale: [0.22, 0.72, 0.24],
      position: [0.56, 1.08, 0],
    }));
    this.parts.set('leftLeg', this.createPart({
      name: 'LeftLeg',
      color: this.skin.leg,
      scale: [0.26, 0.74, 0.26],
      position: [-0.2, 0.38, 0],
    }));
    this.parts.set('rightLeg', this.createPart({
      name: 'RightLeg',
      color: this.skin.leg,
      scale: [0.26, 0.74, 0.26],
      position: [0.2, 0.38, 0],
    }));
  }

  createPart({ name, color, scale, position }) {
    const part = new Mesh(
      sharedBoxGeometry,
      new MeshStandardMaterial({
        color,
        roughness: 0.82,
        metalness: 0,
      }),
    );

    part.name = `Player${name}`;
    part.castShadow = true;
    part.receiveShadow = true;
    part.scale.set(...scale);
    part.position.set(...position);
    part.userData.baseScale = part.scale.clone();
    part.userData.basePosition = part.position.clone();
    this.group.add(part);

    return part;
  }

  update({
    deltaTime,
    movementSpeed,
    playerHeightScale,
    yaw,
    isGrounded = true,
    verticalVelocity = 0,
  }) {
    this.animationTime += deltaTime;
    this.landingTimer = Math.max(0, this.landingTimer - deltaTime);
    this.miningTimer = Math.max(0, this.miningTimer - deltaTime);
    this.group.rotation.y = yaw;
    this.group.scale.y = playerHeightScale;
    this.state = this.getAnimationState({ movementSpeed, isGrounded, verticalVelocity });
    this.resetPartTransforms();

    if (this.state === 'walk') {
      this.limbPhase += deltaTime * Math.min(13, 5.5 + movementSpeed);
      this.applyLimbSwing(Math.sin(this.limbPhase) * 0.4);
    } else if (this.state === 'jump') {
      this.applyJumpPose(verticalVelocity);
    } else {
      this.applyIdlePose();
    }

    this.applyLandingFeedback();
    this.applyMiningFeedback();
  }

  applyLimbSwing(swing) {
    this.parts.get('leftArm').rotation.x = swing;
    this.parts.get('rightArm').rotation.x = -swing;
    this.parts.get('leftLeg').rotation.x = -swing * 0.72;
    this.parts.get('rightLeg').rotation.x = swing * 0.72;
  }

  resetLimbSwing() {
    this.applyLimbSwing(0);
  }

  applyIdlePose() {
    const idleBob = Math.sin(this.animationTime * 2.2) * 0.018;

    this.group.position.y = idleBob;
    this.parts.get('leftArm').rotation.z = -0.05;
    this.parts.get('rightArm').rotation.z = 0.05;
    this.parts.get('head').rotation.y = Math.sin(this.animationTime * 1.2) * 0.03;
  }

  applyJumpPose(verticalVelocity) {
    const liftPose = verticalVelocity > 0 ? 1 : -0.35;

    this.group.position.y = 0.04;
    this.parts.get('leftArm').rotation.x = -0.18 * liftPose;
    this.parts.get('rightArm').rotation.x = -0.18 * liftPose;
    this.parts.get('leftLeg').rotation.x = 0.18;
    this.parts.get('rightLeg').rotation.x = 0.18;
  }

  applyLandingFeedback() {
    if (this.landingTimer <= 0) {
      return;
    }

    const landingPercent = this.landingTimer / 0.22;
    const squash = Math.sin(landingPercent * Math.PI) * 0.12;
    const torso = this.parts.get('torso');
    const head = this.parts.get('head');

    torso.scale.y *= 1 - squash;
    torso.scale.x *= 1 + squash * 0.34;
    torso.scale.z *= 1 + squash * 0.34;
    head.position.y -= squash * 0.08;
    this.group.position.y -= squash * 0.12;
  }

  applyMiningFeedback() {
    if (this.miningTimer <= 0) {
      return;
    }

    const miningPercent = this.miningTimer / 0.24;
    const swing = -0.92 + Math.sin((1 - miningPercent) * Math.PI) * 0.34;

    this.parts.get('rightArm').rotation.x = swing;
    this.parts.get('rightArm').rotation.z = -0.12;
    this.parts.get('torso').rotation.y = -0.08;
  }

  resetPartTransforms() {
    this.group.position.y = 0;

    for (const part of this.parts.values()) {
      part.position.copy(part.userData.basePosition);
      part.scale.copy(part.userData.baseScale);
      part.rotation.set(0, 0, 0);
    }
  }

  triggerLanding(intensity = 1) {
    this.landingTimer = Math.min(0.22, 0.1 + intensity * 0.04);
  }

  triggerMining() {
    this.miningTimer = 0.24;
  }

  getAnimationState({ movementSpeed, isGrounded, verticalVelocity }) {
    if (!isGrounded || Math.abs(verticalVelocity) > 2.2) {
      return 'jump';
    }

    if (movementSpeed > 0.1) {
      return 'walk';
    }

    return 'idle';
  }
}
