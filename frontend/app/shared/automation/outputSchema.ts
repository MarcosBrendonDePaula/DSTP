// Output schema types for flow nodes — used for {{node.field}} autocomplete and
// validation in the editor. Lives in app/shared so a node's meta.ts (imported by
// BOTH the client editor and the server engine) can declare its output shape
// without pulling in any client- or server-only dependency.

export interface OutputField {
  name: string
  type: 'string' | 'number' | 'boolean' | 'object' | 'any'
  description: string
  children?: OutputField[] // for nested objects
}

export interface NodeOutputSchema {
  description: string
  fields: OutputField[]
}
