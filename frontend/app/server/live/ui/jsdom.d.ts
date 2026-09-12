// Minimal typing for the one jsdom entry point we use (no @types/jsdom dependency).
declare module 'jsdom' {
  export class JSDOM {
    constructor(html?: string, options?: Record<string, unknown>)
    window: any
  }
}
