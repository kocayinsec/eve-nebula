// The context window as the mod last read it: the share still free (0 to
// 100), the tokens still free, and the window's size; null before the
// session's first reading.
export type ContextReading = { left: number; tokensLeft: number | null; window: number } | null

// The capacitor's mood: lavender with room to spare, gold under half, rose in
// the last quarter, a rose pulse at the very end.
export type SkyLevel = 'calm' | 'half' | 'low' | 'alarm'

declare module 'claude-code' {
  interface PluginState {
    // lookOn: whether this chat shows the look now, which the orange prose follows.
    'eve-nebula': { reading: ContextReading; lookOn: boolean }
  }
}
