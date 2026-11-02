export type Choice = {
  model?: string
  tools?: string
  thinking?: string
}
declare module 'claude-code' {
  interface EngineInterface {
    viaSteps: { wait: (input: { agentId: string; turnId: string }) => Promise<void> }
    viaChildren: { wait: (input: { key: string }) => Promise<void> }
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
