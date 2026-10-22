type HandKey = Pick<KeyboardEvent, 'key' | 'repeat' | 'ctrlKey' | 'metaKey' | 'altKey'>

/** A tap toggles once; native key repeat waves while held, with bounded requests. */
export function createHandShortcut(toggle: () => void, now = () => performance.now()) {
  let held = false
  let nextToggleAt = 0
  function reset() {
    held = false
    nextToggleAt = 0
  }
  return {
    reset,
    keydown(event: HandKey, enabled: boolean): boolean {
      if (event.key !== ' ' || !enabled || event.ctrlKey || event.metaKey || event.altKey) {
        if (event.key === ' ') reset()
        return false
      }
      // Repeats that began in an input or another window must not start a wave.
      if (event.repeat && !held) return false
      held = true
      const time = now()
      if (!event.repeat || time >= nextToggleAt) {
        nextToggleAt = time + 280
        toggle()
      }
      return true
    },
    keyup(event: Pick<KeyboardEvent, 'key'>): boolean {
      if (event.key !== ' ') return false
      const wasHeld = held
      reset()
      return wasHeld
    },
  }
}
