export const CREATOR_ROLES = {
  owner: 'owner',
  admin: 'admin',
  editor: 'editor',
  viewer: 'viewer',
};

const ROLE_CAPABILITIES = {
  [CREATOR_ROLES.owner]: {
    edit: true,
    publish: true,
    admin: true,
  },
  [CREATOR_ROLES.admin]: {
    edit: true,
    publish: true,
    admin: true,
  },
  [CREATOR_ROLES.editor]: {
    edit: true,
    publish: false,
    admin: false,
  },
  [CREATOR_ROLES.viewer]: {
    edit: false,
    publish: false,
    admin: false,
  },
};

export class CreatorPermissionSystem {
  constructor({
    localPlayerId = 'player-local',
    savedState = null,
  } = {}) {
    this.localPlayerId = localPlayerId;
    this.ownerId = savedState?.ownerId ?? localPlayerId;
    this.roles = {
      [this.ownerId]: CREATOR_ROLES.owner,
      ...(savedState?.roles ?? {}),
    };
    this.lastPermissionEvent = 'Ready';
  }

  getRole(playerId = this.localPlayerId) {
    if (playerId === this.ownerId) {
      return CREATOR_ROLES.owner;
    }

    return this.roles[playerId] ?? CREATOR_ROLES.viewer;
  }

  canEdit(playerId = this.localPlayerId) {
    return ROLE_CAPABILITIES[this.getRole(playerId)]?.edit === true;
  }

  canPublish(playerId = this.localPlayerId) {
    return ROLE_CAPABILITIES[this.getRole(playerId)]?.publish === true;
  }

  canAdmin(playerId = this.localPlayerId) {
    return ROLE_CAPABILITIES[this.getRole(playerId)]?.admin === true;
  }

  setRole({ playerId, role, actingPlayerId = this.localPlayerId }) {
    if (!this.canAdmin(actingPlayerId) || !ROLE_CAPABILITIES[role] || playerId === this.ownerId) {
      this.lastPermissionEvent = 'Permission denied';
      return false;
    }

    this.roles[playerId] = role;
    this.lastPermissionEvent = `${playerId} -> ${role}`;

    return true;
  }

  updateFromServerMetadata(worldMetadata) {
    if (!worldMetadata?.ownerId) {
      return;
    }

    this.ownerId = worldMetadata.ownerId;
    this.roles = {
      [this.ownerId]: CREATOR_ROLES.owner,
      ...(worldMetadata.roles ?? this.roles),
    };
  }

  getPersistenceState() {
    return {
      ownerId: this.ownerId,
      roles: this.roles,
    };
  }

  getSnapshot() {
    const role = this.getRole();

    return {
      ownerId: this.ownerId,
      localPlayerId: this.localPlayerId,
      localRole: role,
      roleCount: Object.keys(this.roles).length,
      canEdit: this.canEdit(),
      canPublish: this.canPublish(),
      canAdmin: this.canAdmin(),
      lastPermissionEvent: this.lastPermissionEvent,
    };
  }
}
