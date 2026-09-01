import { useContext } from 'react'
import { GroupExpansionContext } from './groupExpansionContext'

export function useGroupExpansion() {
  const context = useContext(GroupExpansionContext)
  if (!context) {
    throw new Error('useGroupExpansion must be used within GroupExpansionProvider')
  }
  return context
}
