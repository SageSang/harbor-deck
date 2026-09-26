import { useRef, useState } from 'react'
import { MAX_TRANSFER_BYTES, transferRequest, type TransferImportResult } from './transferClient'
import type { ExtensionLanguage } from './types'

export function TransferPanel({
  language,
  disabled,
  hasUnsavedChanges,
  onImported,
  onBusy,
}: {
  language: ExtensionLanguage
  disabled: boolean
  hasUnsavedChanges: boolean
  onImported(result: TransferImportResult): void
  onBusy(busy: boolean): void
}) {
  const input = useRef<HTMLInputElement>(null)
  const working = useRef(false)
  const [message, setMessage] = useState('')
  const zh = language === 'zh-CN'
  async function run(work: () => Promise<void>) {
    if (working.current || disabled) return
    working.current = true
    onBusy(true)
    setMessage('')
    try {
      await work()
    } catch (error) {
      const code = error instanceof Error ? error.message : ''
      setMessage(
        code === 'target-not-empty'
          ? zh
            ? '当前安装已有设置、偏好或草稿，未导入。请保留现有安装，在空白的新安装中迁移。'
            : 'This installation contains settings, preferences or drafts. Nothing was imported. Keep it and import into an empty installation.'
          : code === 'invalid-transfer' || code === 'transfer-too-large'
            ? zh
              ? '迁移文件无效、版本不支持或超过5MB，未导入。'
              : 'Invalid, unsupported or oversized transfer file (maximum 5 MB). Nothing was imported.'
            : zh
              ? '迁移操作未完成。请保留原安装和文件，重新检查当前设置后再试。'
              : 'Transfer did not complete. Keep the original installation and file; check the current settings before retrying.'
      )
    } finally {
      working.current = false
      onBusy(false)
    }
  }
  function exportFile() {
    void run(async () => {
      const text = await transferRequest<string>('export')
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = 'harbordeck-extension-transfer.json'
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setMessage(
        zh
          ? '已生成迁移文件，不含Token。请在新安装核对设置和草稿，重新填写Token并授予地址权限。'
          : 'Transfer file generated without the token. Verify settings and drafts in the new installation, re-enter your token and grant site permissions.'
      )
    })
  }
  return (
    <section className="field" aria-label={zh ? '迁移设置与草稿' : 'Transfer settings and drafts'}>
      <h2>{zh ? '迁移设置与草稿' : 'Transfer settings and drafts'}</h2>
      <p className="field-help">
        {zh
          ? '连接设置仅保存在这台设备。导出包含已保存设置、偏好和未提交草稿，不含Token；未保存的表单修改请先保存。导入仅用于空白安装，核对完成前保留旧安装。'
          : 'Connection settings stay on this device. Export includes saved settings, preferences and unfinished drafts, without the token. Save form edits first. Import only into an empty installation and keep the old one until verification is complete.'}
      </p>
      <div className="status-actions">
        <button type="button" className="btn" disabled={disabled} onClick={exportFile}>
          {zh ? '导出迁移文件' : 'Export transfer file'}
        </button>
        <button
          type="button"
          className="btn"
          disabled={disabled || hasUnsavedChanges}
          onClick={() => input.current?.click()}
        >
          {zh ? '导入迁移文件' : 'Import transfer file'}
        </button>
      </div>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (!file || hasUnsavedChanges) return
          void run(async () => {
            if (file.size > MAX_TRANSFER_BYTES) throw new Error('transfer-too-large')
            const result = await transferRequest<TransferImportResult>('import', await file.text())
            onImported(result)
            const importedZh = (result.languageApplied ? result.language : language) === 'zh-CN'
            setMessage(
              importedZh
                ? `设置和${result.draftCount}份草稿已导入。请核对后保存以授予地址权限${result.tokenOmitted ? '，并重新填写Token' : ''}。${result.languageApplied ? '' : '语言同步失败，请用语言按钮重新选择。'}`
                : `Settings and ${result.draftCount} drafts imported. Verify and save to grant site permissions${result.tokenOmitted ? ', and re-enter the token' : ''}.${result.languageApplied ? '' : ' Language sync failed; select the language again.'}`
            )
          })
        }}
      />
      {hasUnsavedChanges && (
        <p className="field-help">
          {zh
            ? '请先保存或撤回当前表单修改，再导入文件。'
            : 'Save or revert the current form edits before importing.'}
        </p>
      )}
      {message && (
        <p className="field-help" role="status">
          {message}
        </p>
      )}
    </section>
  )
}
