import {
  BoxGeometry,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
} from 'three';

const outlineGeometry = new EdgesGeometry(new BoxGeometry(1.04, 1.04, 1.04));
const hoverGeometry = new BoxGeometry(1.02, 1.02, 1.02);
const ghostGeometry = new BoxGeometry(1, 1, 1);

export class VoxelInteractionFeedback {
  constructor() {
    this.group = new Group();
    this.group.name = 'VoxelInteractionFeedback';

    this.outlineMaterial = new LineBasicMaterial({
      color: '#f8f2a2',
      transparent: true,
      opacity: 0.95,
    });
    this.hoverMaterial = new MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
    });
    this.ghostMaterial = new MeshBasicMaterial({
      color: '#8ee6b5',
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      wireframe: true,
    });

    this.outline = new LineSegments(outlineGeometry, this.outlineMaterial);
    this.hoverHighlight = new Mesh(hoverGeometry, this.hoverMaterial);
    this.placementGhost = new Mesh(ghostGeometry, this.ghostMaterial);

    this.outline.visible = false;
    this.hoverHighlight.visible = false;
    this.placementGhost.visible = false;

    this.group.add(this.hoverHighlight, this.outline, this.placementGhost);
  }

  update({ targetBlock, placementPosition, selectedBlockDefinition, canPlace, miningProgress }) {
    this.updateTargetFeedback({ targetBlock, miningProgress });
    this.updatePlacementGhost({ placementPosition, selectedBlockDefinition, canPlace });
  }

  updateTargetFeedback({ targetBlock, miningProgress }) {
    if (!targetBlock) {
      this.outline.visible = false;
      this.hoverHighlight.visible = false;
      return;
    }

    this.outline.visible = true;
    this.hoverHighlight.visible = true;
    this.outlineMaterial.color.set(miningProgress > 0 ? '#ffcf69' : '#f8f2a2');
    this.hoverMaterial.opacity = 0.1 + miningProgress * 0.22;

    setBlockCenter(this.outline, {
      worldX: targetBlock.worldX,
      y: targetBlock.y,
      worldZ: targetBlock.worldZ,
    });
    setBlockCenter(this.hoverHighlight, {
      worldX: targetBlock.worldX,
      y: targetBlock.y,
      worldZ: targetBlock.worldZ,
    });
  }

  updatePlacementGhost({ placementPosition, selectedBlockDefinition, canPlace }) {
    if (!placementPosition || !selectedBlockDefinition || !canPlace) {
      this.placementGhost.visible = false;
      return;
    }

    const scale = selectedBlockDefinition.scale ?? { x: 1, y: 1, z: 1 };

    this.placementGhost.visible = true;
    this.ghostMaterial.color.set(selectedBlockDefinition.color);
    this.placementGhost.scale.set(scale.x, scale.y, scale.z);
    setBlockCenter(this.placementGhost, placementPosition, scale);
  }
}

function setBlockCenter(object, position, scale = { x: 1, y: 1, z: 1 }) {
  object.position.set(
    position.worldX + 0.5,
    position.y + scale.y / 2,
    position.worldZ + 0.5,
  );
}
