// Tiny pub/sub bus so modules never import each other's internals.
export function createBus() {
  const handlers = new Map();
  return {
    on(type, fn) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(fn);
      return () => handlers.get(type).delete(fn);
    },
    emit(type, detail) {
      handlers.get(type)?.forEach((fn) => fn(detail));
    },
  };
}
