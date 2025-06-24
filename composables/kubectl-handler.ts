// 处理 kubectl 导航的核心逻辑
export interface KubectlResult {
  success: boolean;
  targetUrl?: string;
  error?: string;
}

export async function handleKubectlCore(currentUrl: string): Promise<KubectlResult> {
  const consoleMatch = currentUrl.match(/\/console-([^/]+)\//);
  if (!consoleMatch) {
    return {
      success: false,
      error: '请在控制台页面使用 kubectl',
    };
  }
  const baseUrl = currentUrl.split('/console-')[0];
  const consoleUrl = '/console-platform/terminal/cli-tools';
  const targetUrl = `${baseUrl}${consoleUrl}`;
  return {
    success: true,
    targetUrl,
  };
}

export type KubectlOpenType = 'tab' | 'window' | 'current';

export async function navigateToKubectl(
  currentTab: any,
  targetUrl: string,
  openType: KubectlOpenType = 'tab',
): Promise<void> {
  switch (openType) {
    case 'current':
      await browser.tabs.update(currentTab.id, { url: targetUrl });
      break;
    case 'window':
      await browser.windows.create({
        url: targetUrl,
        type: 'popup',
        width: 1200,
        height: 800,
        focused: true,
      });
      break;
    case 'tab':
    default:
      await browser.tabs.create({
        url: targetUrl,
        active: true,
        index: (currentTab.index ?? 0) + 1,
      });
      break;
  }
} 