import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { useEditSnapshot } from './useEditSnapshot'

describe('editing snapshots', () => {
  it('preserves the baseline and revision during refresh and replaces them only on explicit reload or access change', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    type Snapshot = { name: string; _revision: string }
    let editor: ReturnType<typeof useEditSnapshot<Snapshot>> | undefined
    function Probe({ source, access }: { source?: Snapshot; access: string }) {
      editor = useEditSnapshot(true, access, source)
      return null
    }
    const before = { name: 'Original', _revision: 'a' }
    const after = { name: 'Remote update', _revision: 'b' }
    try {
      await act(async () => root.render(<Probe source={before} access="unlocked" />))
      await act(async () => root.render(<Probe source={after} access="unlocked" />))
      expect(editor?.snapshot).toEqual(before)
      expect(editor?.changed).toBe(true)
      await act(async () => editor?.reload())
      expect(editor?.snapshot).toEqual(after)
      await act(async () => root.render(<Probe source={undefined} access="locked" />))
      expect(editor?.snapshot).toBeUndefined()
    } finally {
      await act(async () => root.unmount())
      host.remove()
      vi.unstubAllGlobals()
    }
  })
})
