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
    this.group.add(part);

    return part;
  }

  update({ deltaTime, movementSpeed, playerHeightScale, yaw }) {
    this.group.rotation.y = yaw;
    this.group.scale.y = playerHeightScale;

    if (movementSpeed <= 0.01) {
      this.resetLimbSwing();
      return;
    }

    this.limbPhase += deltaTime * Math.min(12, 5 + movementSpeed);
    this.applyLimbSwing(Math.sin(this.limbPhase) * 0.34);
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
}
