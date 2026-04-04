export class LiveUpload {
  static componentName = 'LiveUpload'
  static defaultState = {
    status: 'idle',
    progress: 0,
    fileName: '',
    fileSize: 0,
    fileType: '',
    fileUrl: '',
    bytesUploaded: 0,
    totalBytes: 0,
    error: null
  }
  static publicActions = ['startUpload', 'updateProgress', 'completeUpload', 'failUpload', 'reset']
}