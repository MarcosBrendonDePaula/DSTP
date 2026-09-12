export class LiveDSTP {
  static componentName = 'LiveDSTP'
  static defaultState = {
    serverIds: [],
    events: [],
  }
  static publicActions = [
    'joinServerRoom',
    'leaveServerRoom',
    'sendCommand',
    'sendPlayerCommand',
    'broadcastCommand',
    'toggleEventCategory',
    'updateDebounce',
    'getEventSchemas',
    'saveEventSchema',
    'refresh',
  ]
}