import type { FieldType } from '../values'

export interface Profile {
  id: string
  db_name: string
  onboarded: boolean
  created_at: string
}

export interface Workspace {
  id: string
  owner_id: string
  name: string
  description: string
  accent: string
  position: number
  created_at: string
}

export interface Sheet {
  id: string
  owner_id: string
  workspace_id: string
  name: string
  description: string
  accent: string
  done_label: string
  position: number
  created_at: string
}

export interface SheetCount {
  sheet_id: string
  total: number
  done: number
}

export interface WorkspaceDraft {
  name: string
  description: string
  accent: string
}

export interface SheetDraft {
  name: string
  description: string
  accent: string
  done_label: string
}

export interface FieldDraft {
  key: string
  name: string
  type: FieldType
  options: string[]
  required: boolean
}
