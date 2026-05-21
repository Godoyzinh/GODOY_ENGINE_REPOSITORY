import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';

const WALK_SPEED = 7;
const SPRINT_SPEED = 12;
const GRAVITY = -28;
const JUMP_FORCE = 10;
const PLAYER_HEIGHT = 1.8;

export class PlayerController {
  constructor({ camera, terrainSampler }) {
    this.camera = camera;
    this.terrainSampler = terrainSampler;
    this.object = new Group();
    this.object.name = 'PlayerController';
    this.position = new Vector3(0, 8, 0);
    this.velocity = new Vector3();
    this.input = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      sprint: false,
      jump: false,
    };
    this.cameraTarget = new Vector3();
    this.isGrounded = false;

    this.body = new Mesh(
      new BoxGeometry(0.8, PLAYER_HEIGHT, 0.8),
      new MeshStandardMaterial({ color: '#ffcf69', roughness: 0.8 }),
    );
    this.body.castShadow = true;
    this.body.position.y = PLAYER_HEIGHT / 2;
    this.object.add(this.body);

    window.addEventListener('keydown', (event) => this.setInput(event.code, true));
    window.addEventListener('keyup', (event) => this.setInput(event.code, false));
  }

  setInput(code, isPressed) {
    const inputMap = {
      KeyW: 'forward',
      ArrowUp: 'forward',
      KeyS: 'backward',
      ArrowDown: 'backward',
      KeyA: 'left',
      ArrowLeft: 'left',
      KeyD: 'right',
      ArrowRight: 'right',
      ShiftLeft: 'sprint',
      ShiftRight: 'sprint',
      Space: 'jump',
    };

    const inputName = inputMap[code];

    if (inputName) {
      this.input[inputName] = isPressed;
    }
  }

  update(deltaTime) {
    this.applyHorizontalMovement(deltaTime);
    this.applyVerticalMovement(deltaTime);

    this.object.position.copy(this.position);
    this.cameraTarget.copy(this.position);
  }

  applyHorizontalMovement(deltaTime) {
    const moveX = Number(this.input.right) - Number(this.input.left);
    const moveZ = Number(this.input.backward) - Number(this.input.forward);
    const moveLength = Math.hypot(moveX, moveZ);

    if (moveLength === 0) {
      return;
    }

    const speed = this.input.sprint ? SPRINT_SPEED : WALK_SPEED;
    this.position.x += (moveX / moveLength) * speed * deltaTime;
    this.position.z += (moveZ / moveLength) * speed * deltaTime;
  }

  applyVerticalMovement(deltaTime) {
    const groundHeight = this.terrainSampler.getHeightAt(this.position.x, this.position.z);
    const minimumY = groundHeight + 0.05;

    if (this.input.jump && this.isGrounded) {
      this.velocity.y = JUMP_FORCE;
      this.isGrounded = false;
    }

    this.velocity.y += GRAVITY * deltaTime;
    this.position.y += this.velocity.y * deltaTime;

    if (this.position.y <= minimumY) {
      this.position.y = minimumY;
      this.velocity.y = 0;
      this.isGrounded = true;
    }
  }
}
