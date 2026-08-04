import type { ExtensionLanguage, ResolutionReason } from '@extension/types'

const messages = {
  'zh-CN': {
    options: {
      title: '设置新标签页',
      subtitle: '主地址一般填内网地址，切换地址一般填外网地址。',
      languageToggleAriaLabel: '切换语言',
      languageChinese: '中文',
      languageEnglish: 'EN',
      primaryUrlLabel: '主地址',
      primaryUrlPlaceholder: '例如 http://localhost:3000 或 https://app.example.com',
      primaryUrlHint: '优先打开这个地址。',
      fallbackUrlLabel: '切换地址',
      fallbackUrlPlaceholder: '例如 https://wan.example.com',
      fallbackUrlHint: '主地址不可用时，自动切换到这个地址。',
      openModeLabel: '打开方式',
      openModeAriaLabel: '打开方式',
      openModeDirect: '直接跳转',
      openModeEmbedded: '内嵌显示',
      openModeHint:
        '建议选“直接跳转”。“内嵌显示”下，部分页面可能无法正常显示；遇到这类书签，可在导航页里开启“强制新标签页打开”。',
      probeTimeoutLabel: '检测超时（毫秒）',
      probeTimeoutHint: (defaultTimeoutMs: number, cacheDuration: string) =>
        `默认 ${defaultTimeoutMs}ms。越小越快，越大越稳。最近成功地址会缓存 ${cacheDuration}。`,
      saveButton: '保存配置',
      savingButton: '保存中...',
      statusIdle: '填好地址后保存即可。',
      statusSaved: '已保存，新标签页会按这个设置打开。',
      statusSavedNoPermission:
        '已保存，但没有授予地址访问权限，插件可能无法准确判断哪个地址可用。',
      statusInvalidUrl: '地址格式无效，请输入完整地址或 IP:端口。',
      statusSaveFailed: '保存失败，请稍后再试。',
    },
    newtab: {
      loadingTitle: '正在打开导航页',
      loadingHint: '请稍候...',
      unconfiguredTitle: '先配置导航页地址',
      unconfiguredDescription: '先到设置页填写主地址和切换地址，再选择打开方式。',
      openSettingsButton: '打开配置页',
      redirectCancelledTitle: '已暂停自动跳转',
      redirectCancelledDescription: '检测到页面离开，自动跳转已暂停。你可以手动打开导航页继续。',
      openNavigationButton: '打开导航页',
      noticeOpeningTitle: '正在打开导航页',
      noticeFallbackTitle: '已切换地址',
      statusByReason: {
        primary: '主地址可用，正在打开导航页。',
        fallback: '主地址不可用，已自动切换到切换地址。',
        'primary-unverified': '无法验证主地址，已直接尝试打开。',
        'fallback-unverified': '已切换到切换地址，但扩展没有权限验证其连通性。',
        unconfigured: '尚未配置导航页地址。',
      } satisfies Record<ResolutionReason, string>,
    },
  },
  en: {
    options: {
      title: 'New Tab Settings',
      subtitle: 'Use your LAN URL as primary and your WAN URL as secondary in most cases.',
      languageToggleAriaLabel: 'Switch language',
      languageChinese: '中文',
      languageEnglish: 'EN',
      primaryUrlLabel: 'Primary URL',
      primaryUrlPlaceholder: 'For example http://localhost:3000 or https://app.example.com',
      primaryUrlHint: 'Open this address first.',
      fallbackUrlLabel: 'Secondary URL',
      fallbackUrlPlaceholder: 'For example https://wan.example.com',
      fallbackUrlHint: 'Use this address when the primary one is unavailable.',
      openModeLabel: 'Open mode',
      openModeAriaLabel: 'Open mode',
      openModeDirect: 'Direct',
      openModeEmbedded: 'Embedded',
      openModeHint:
        'Direct is recommended. In embedded mode, some pages may not display correctly. For those bookmarks, turn on "Force open in new tab" in HarborDeck.',
      probeTimeoutLabel: 'Check timeout (ms)',
      probeTimeoutHint: (defaultTimeoutMs: number, cacheDuration: string) =>
        `Default ${defaultTimeoutMs}ms. Lower is faster, higher is safer. The last successful address is cached for ${cacheDuration}.`,
      saveButton: 'Save',
      savingButton: 'Saving...',
      statusIdle: 'Fill in the addresses and save.',
      statusSaved: 'Saved. New tabs will use this setting.',
      statusSavedNoPermission:
        'Saved, but address access permission was not granted, so availability checks may be less accurate.',
      statusInvalidUrl: 'Invalid address. Enter a full URL or IP:port.',
      statusSaveFailed: 'Save failed. Please try again.',
    },
    newtab: {
      loadingTitle: 'Opening HarborDeck',
      loadingHint: 'Please wait...',
      unconfiguredTitle: 'Set the navigation page first',
      unconfiguredDescription:
        'Open settings, fill in the primary and secondary URLs, then choose how the page should open.',
      openSettingsButton: 'Open Settings',
      redirectCancelledTitle: 'Auto-redirect paused',
      redirectCancelledDescription:
        'The page started to leave, so auto-redirect was paused. You can open HarborDeck manually.',
      openNavigationButton: 'Open navigation page',
      noticeOpeningTitle: 'Opening HarborDeck',
      noticeFallbackTitle: 'Switched to secondary URL',
      statusByReason: {
        primary: 'Primary address is available. Opening HarborDeck.',
        fallback: 'Primary address is unavailable. Switched to the secondary URL.',
        'primary-unverified': 'The primary address could not be verified, so it is being opened directly.',
        'fallback-unverified':
          'Switched to the secondary URL, but the extension cannot verify its availability.',
        unconfigured: 'No navigation page address has been configured yet.',
      } satisfies Record<ResolutionReason, string>,
    },
  },
} as const

export function getMessages(language: ExtensionLanguage) {
  return messages[language] ?? messages['zh-CN']
}
