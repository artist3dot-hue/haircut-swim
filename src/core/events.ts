// 极简事件总线：系统之间（剪发、音效、HUD、存档）用它解耦。

type Handler<T> = (payload: T) => void

export class EventBus<E extends object> {
  private map = new Map<keyof E, Set<Handler<never>>>()

  on<K extends keyof E>(type: K, handler: Handler<E[K]>): () => void {
    let set = this.map.get(type)
    if (!set) {
      set = new Set()
      this.map.set(type, set)
    }
    set.add(handler as Handler<never>)
    return () => set.delete(handler as Handler<never>)
  }

  emit<K extends keyof E>(type: K, payload: E[K]): void {
    const set = this.map.get(type)
    if (!set) return
    for (const h of set) (h as Handler<E[K]>)(payload)
  }

  clear(): void {
    this.map.clear()
  }
}
