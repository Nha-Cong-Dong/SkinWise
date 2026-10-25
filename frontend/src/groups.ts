import { createContext, useContext } from 'react'
import type { CosmeticFunction, Group } from './api'

export const GroupsContext = createContext<Map<string, Group>>(new Map())
export const FunctionsContext = createContext<Map<string, CosmeticFunction>>(new Map())

/** "AHA (alpha hydroxy acid)" -> "AHA"; unknown codes fall back to the code itself. */
export function useGroupName(): (code: string) => string {
  const groups = useContext(GroupsContext)
  return (code) => groups.get(code)?.name_vi.replace(/\s*\(.*\)$/, '') ?? code
}
