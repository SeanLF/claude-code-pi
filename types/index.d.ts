export type Choice = {
  model?: string
  tools?: string
  thinking?: string
}
declare module 'claude-code' {
  interface EngineInterface {
    viaChildren: { wait: (input: { key: string }) => Promise<void> }
    viaSteps: { wait: (input: { agentId: string; turnId: string }) => Promise<void>; sleep: (input: { ms: number }) => Promise<void> }
  }

  interface PluginState {
    via: {
      agents: StateFamily<Choice>
      sessions: StateFamily<string>
      handbacks: StateFamily<boolean>
      reports: StateFamily<string>
      handedBack: StateFamily<boolean>
      modes: StateFamily<string>
    }
  }
}
