export const NETWORK_MODES = {
  localPreview: 'localPreview',
  client: 'client',
  server: 'server',
};

export const NETWORK_OWNERS = {
  server: 'server',
  localClient: 'localClient',
  remoteClient: 'remoteClient',
  shared: 'shared',
};

export const SNAPSHOT_TYPES = {
  player: 'player',
  entity: 'entity',
  chunk: 'chunk',
  world: 'world',
};

export const DEFAULT_SERVER_TICK_RATE = 20;
export const DEFAULT_INTERPOLATION_SECONDS = 0.12;
export const DEFAULT_LATENCY_PLACEHOLDER_MS = 0;
export const MAX_REPLICATION_BATCH_SIZE = 64;
