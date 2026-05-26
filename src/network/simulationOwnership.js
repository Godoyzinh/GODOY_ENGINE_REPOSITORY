import { NETWORK_OWNERS } from './networkConstants.js';

export const SIMULATION_OWNERSHIP_RULES = {
  playerInput: {
    owner: NETWORK_OWNERS.localClient,
    authority: NETWORK_OWNERS.server,
    replication: 'input-command',
    notes: 'Client predicts input locally; server validates movement and state.',
  },
  playerState: {
    owner: NETWORK_OWNERS.server,
    authority: NETWORK_OWNERS.server,
    replication: 'snapshot',
    notes: 'Health, hunger, mode, inventory slot and combat state are server-owned.',
  },
  remotePlayerPresentation: {
    owner: NETWORK_OWNERS.remoteClient,
    authority: NETWORK_OWNERS.server,
    replication: 'interpolated-snapshot',
    notes: 'Remote players render from server snapshots with client interpolation.',
  },
  entities: {
    owner: NETWORK_OWNERS.server,
    authority: NETWORK_OWNERS.server,
    replication: 'delta-snapshot',
    notes: 'NPCs, hostiles and drops are simulated by the authoritative server.',
  },
  chunks: {
    owner: NETWORK_OWNERS.server,
    authority: NETWORK_OWNERS.server,
    replication: 'chunk-delta-prep',
    notes: 'Chunk generation and block edits are server-owned; clients receive synced chunks.',
  },
  localRendering: {
    owner: NETWORK_OWNERS.localClient,
    authority: NETWORK_OWNERS.localClient,
    replication: 'none',
    notes: 'Renderer, camera, HUD and interpolation are client-only presentation systems.',
  },
};

export class SimulationOwnership {
  constructor({ rules = SIMULATION_OWNERSHIP_RULES } = {}) {
    this.rules = rules;
  }

  getRule(resourceType) {
    return this.rules[resourceType] ?? {
      owner: NETWORK_OWNERS.server,
      authority: NETWORK_OWNERS.server,
      replication: 'snapshot',
      notes: 'Default authoritative server ownership.',
    };
  }

  getSnapshot() {
    return {
      authoritativeServer: true,
      clientPredictionReady: true,
      interpolationReady: true,
      serverOwnedSystems: Object.entries(this.rules)
        .filter(([, rule]) => rule.authority === NETWORK_OWNERS.server)
        .map(([resourceType]) => resourceType),
      clientOwnedSystems: Object.entries(this.rules)
        .filter(([, rule]) => rule.owner === NETWORK_OWNERS.localClient)
        .map(([resourceType]) => resourceType),
      rules: Object.entries(this.rules).map(([resourceType, rule]) => ({
        resourceType,
        owner: rule.owner,
        authority: rule.authority,
        replication: rule.replication,
      })),
    };
  }
}
