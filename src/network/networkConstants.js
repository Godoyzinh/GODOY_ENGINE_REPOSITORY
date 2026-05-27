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

export const PACKET_TYPES = {
  hello: 'hello',
  welcome: 'welcome',
  playerJoined: 'playerJoined',
  playerLeft: 'playerLeft',
  worldList: 'worldList',
  joinWorld: 'joinWorld',
  worldJoined: 'worldJoined',
  reconnect: 'reconnect',
  reconnectAccepted: 'reconnectAccepted',
  playerSnapshot: 'playerSnapshot',
  serverSnapshot: 'serverSnapshot',
  blockEdit: 'blockEdit',
  combatAction: 'combatAction',
  chunkInterest: 'chunkInterest',
  ack: 'ack',
  resendRequest: 'resendRequest',
  reconciliation: 'reconciliation',
  ping: 'ping',
  pong: 'pong',
  error: 'error',
};

export const DEFAULT_SERVER_TICK_RATE = 20;
export const DEFAULT_INTERPOLATION_SECONDS = 0.12;
export const DEFAULT_LATENCY_PLACEHOLDER_MS = 0;
export const DEFAULT_MULTIPLAYER_URL = 'ws://127.0.0.1:8787';
export const DEFAULT_WORLD_ID = 'default';
export const MAX_REPLICATION_BATCH_SIZE = 64;
export const MAX_BLOCK_EDITS_PER_PACKET = 128;
export const SNAPSHOT_BUFFER_SIZE = 90;
export const SESSION_RECOVERY_SECONDS = 45;
