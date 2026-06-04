export class LiveAutomation {
  static componentName = 'LiveAutomation'
  static defaultState = {
    flows: [],
    logs: [],
  }
  static publicActions = [
    'saveFlow',
    'deleteFlow',
    'toggleFlow',
    'moveFlow',
    'createFolder',
    'deleteFolder',
    'reorderFolder',
    'moveFolder',
    'renameFolder',
    'toggleFolder',
    'loadFlows',
    'clearLogs',
    'getEventSchemas',
    'exportFlow',
    'importFlow',
    'startCapture',
    'stopCapture',
  ]
}