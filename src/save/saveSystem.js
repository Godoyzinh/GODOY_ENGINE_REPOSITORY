export class SaveSystem {
  serializeWorld() {
    return {
      version: 1,
      savedAt: new Date().toISOString(),
      chunks: [],
    };
  }
}
