import { useCallback, useEffect } from 'react'
import { useFeedback } from '@/features/feedback/useFeedback'
import { useI18n } from '@/i18n/runtime'

export function useDiscardDraft(dirty: boolean, pending: boolean, onClose: () => void) {
  const { confirm } = useFeedback()
  const { language } = useI18n()
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  return useCallback(async () => {
    if (pending) return
    if (
      !dirty ||
      (await confirm({
        title: language === 'zh-CN' ? '放弃未保存的修改？' : 'Discard unsaved changes?',
        message:
          language === 'zh-CN' ? '关闭后将丢弃当前输入。' : 'Closing will discard your input.',
      }))
    )
      onClose()
  }, [confirm, dirty, language, onClose, pending])
}
