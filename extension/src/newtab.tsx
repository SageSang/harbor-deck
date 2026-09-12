import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { readLanguage, defaultLanguage } from './storage'
import { restoreExtensionTheme } from './theme'
import './styles.css'

export function App() {
  const [language, setLanguage] = useState(defaultLanguage)
  const [retry, setRetry] = useState(0)
  const [showHelp, setShowHelp] = useState(false)
  const snapshot = window.__harborDeckBootSnapshot
  useEffect(() => {
    void readLanguage()
      .then(setLanguage)
      .catch(() => undefined)
    void restoreExtensionTheme().catch(() => undefined)
    document.body.dataset.page = 'newtab'
    return () => {
      delete document.body.dataset.page
    }
  }, [])
  const zh = language === 'zh-CN'
  if (!snapshot?.activeUrl)
    return (
      <button onClick={() => void chrome.runtime.openOptionsPage()}>
        {zh ? '打开设置' : 'Open settings'}
      </button>
    )
  const url = new URL(snapshot.activeUrl)
  url.searchParams.set('embedded', '1')
  return (
    <main className="embedded-shell">
      <iframe
        key={retry}
        title="HarborDeck"
        src={url.toString()}
        className="embedded-frame fullbleed"
        referrerPolicy="no-referrer"
      />
      <div className="floating-notice embedded-help">
        <button
          type="button"
          className="btn"
          aria-expanded={showHelp}
          onClick={() => setShowHelp((value) => !value)}
        >
          {zh ? '内嵌显示帮助' : 'Embedded view help'}
        </button>
        {showHelp ? (
          <>
            <p>
              {zh
                ? '若页面未显示，请检查服务端可信扩展 ID、地址权限和反向代理设置。登录状态可能与直接访问不同。'
                : 'If the page is not visible, check trusted extension IDs, site permissions and your reverse proxy. Login state can differ from a direct visit.'}
            </p>
            <div className="status-actions">
              <button className="btn" onClick={() => setRetry((value) => value + 1)}>
                {zh ? '重新加载' : 'Reload'}
              </button>
              <a className="btn" href={snapshot.activeUrl} target="_top" rel="noreferrer">
                {zh ? '直接打开' : 'Open directly'}
              </a>
              <button className="btn" onClick={() => void chrome.runtime.openOptionsPage()}>
                {zh ? '设置' : 'Settings'}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </main>
  )
}
createRoot(document.getElementById('root')!).render(<App />)
