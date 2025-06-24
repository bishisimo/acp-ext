import { handleKubectlCore, navigateToKubectl, KubectlOpenType } from '@/composables/kubectl-handler';

declare global {
  interface Window {
    chrome: any;
  }
}

export default defineBackground(() => {
  // 监听扩展安装事件
  browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
      const defaultOptions = {
        clusterOptions: ['global'],
        namespaceOptions: ['kube-system', 'cpaas-system'],
        kubectlOpenType: 'tab',
      };
      browser.storage.local.set(defaultOptions).then(() => {
        console.log('默认选项已初始化');
      });
    }
  });

  // 处理快捷键命令
  browser.commands.onCommand.addListener(async (command: string) => {
    if (command === 'open-kubectl') {
      try {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        const currentTab = tabs[0];
        if (!currentTab || !currentTab.url) return;
        
        const result = await handleKubectlCore(currentTab.url);
        if (!result.success || !result.targetUrl) {
          console.error(result.error);
          return;
        }
        
        const data = await browser.storage.local.get(['kubectlOpenType']);
        const kubectlOpenType = (data.kubectlOpenType as KubectlOpenType) || 'tab';
        await navigateToKubectl(currentTab, result.targetUrl, kubectlOpenType);
      } catch (error) {
        console.error('打开终端失败:', error);
      }
    }
  });
});
