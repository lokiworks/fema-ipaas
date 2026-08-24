export class BrowserStorage {
  private static instance: Storage;
  private constructor(value: Storage) {
    BrowserStorage.instance = value;
  }
  static getInstance() {
    if (!BrowserStorage.instance) {
      BrowserStorage.instance = window.localStorage;
    }
    return BrowserStorage.instance;
  }
  static setInstanceToSessionStorage() {
    BrowserStorage.instance = window.sessionStorage;
  }
}
