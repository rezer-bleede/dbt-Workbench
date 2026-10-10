import '@testing-library/jest-dom'

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver

class MemoryStorage implements Storage {
  private map = new Map<string, string>()

  get length() {
    return this.map.size
  }

  clear() {
    this.map.clear()
  }

  getItem(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null
  }

  setItem(key: string, value: string) {
    this.map.set(key, String(value))
  }

  removeItem(key: string) {
    this.map.delete(key)
  }

  key(index: number) {
    return Array.from(this.map.keys())[index] ?? null
  }
}

const storageShapeOk = (candidate?: Storage | null) =>
  !!candidate && typeof candidate.setItem === 'function' && typeof candidate.clear === 'function'

if (!storageShapeOk(window.localStorage)) {
  const polyfill = new MemoryStorage()
  Object.defineProperty(window, 'localStorage', { value: polyfill, configurable: true, writable: true })
  Object.defineProperty(globalThis, 'localStorage', { value: polyfill, configurable: true, writable: true })
}
