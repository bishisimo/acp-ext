<script lang="ts" setup>
import { ref } from 'vue';
import { handleKubectlCore, navigateToKubectl, KubectlOpenType } from '@/composables/kubectl-handler';
import { createToast, injectToastStyles } from '@/composables/toast';

injectToastStyles();

interface Tool {
  id: string;
  icon: string;
  text: string;
  description: string;
  handler: () => void | Promise<void>;
}

async function handleKubectl() {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const currentTab = tabs[0];
    if (!currentTab || !currentTab.url) {
      createToast('未获取到当前标签页', 'error');
      return;
    }
    const result = await handleKubectlCore(currentTab.url);
    if (!result.success || !result.targetUrl) {
      createToast(result.error || 'kubectl 跳转失败', 'error');
      return;
    }
    const data = await browser.storage.local.get(['kubectlOpenType']);
    const kubectlOpenType = (data.kubectlOpenType as KubectlOpenType) || 'tab';
    await navigateToKubectl(currentTab, result.targetUrl, kubectlOpenType);
    const messages: Record<KubectlOpenType, string> = {
      current: '正在打开 kubectl 终端...',
      window: '已在新窗口打开 kubectl 终端',
      tab: '已在新标签页打开 kubectl 终端',
    };
    createToast(messages[kubectlOpenType] || messages.tab, 'success');
    window.close(); // 操作完成后关闭popup
  } catch (e) {
    createToast('打开终端失败，请重试', 'error');
    console.error('kubectl error', e);
  }
}

const tools = ref<Tool[]>([
  {
    id: 'goCTL',
    icon: '⌘',
    text: 'kubectl 终端',
    description: '快速打开kubectl命令行',
    handler: handleKubectl,
  },
]);
</script>

<template>
  <div class="tools-container">
    <div
      v-for="tool in tools"
      :key="tool.id"
      class="tool-card"
      @click="tool.handler"
    >
      <div class="tool-content">
        <div class="tool-header">
          <span class="tool-icon">{{ tool.icon }}</span>
          <div class="tool-info">
            <h4 class="tool-title">{{ tool.text }}</h4>
            <p class="tool-description">{{ tool.description }}</p>
          </div>
        </div>
        <div class="tool-action">
          <span class="action-arrow">→</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tools-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tool-card {
  background: white;
  border: 2px solid #e9ecef;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  overflow: hidden;
}

.tool-card:hover {
  border-color: #667eea;
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(102, 126, 234, 0.15);
}

.tool-card:active {
  transform: translateY(0);
}

.tool-content {
  padding: 16px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.tool-header {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.tool-icon {
  font-size: 24px;
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.tool-info {
  flex: 1;
  min-width: 0;
}

.tool-title {
  margin: 0 0 4px 0;
  font-size: 15px;
  font-weight: 600;
  color: #333;
  line-height: 1.2;
}

.tool-description {
  margin: 0;
  font-size: 12px;
  color: #666;
  line-height: 1.3;
}

.tool-action {
  flex-shrink: 0;
}

.action-arrow {
  font-size: 18px;
  color: #667eea;
  font-weight: bold;
  transition: transform 0.2s ease;
}

.tool-card:hover .action-arrow {
  transform: translateX(4px);
}

/* 当只有一个工具时，让卡片更突出 */
.tools-container:has(.tool-card:only-child) .tool-card {
  background: linear-gradient(135deg, #f8f9ff 0%, #fff 100%);
  border-color: #667eea;
}

.tools-container:has(.tool-card:only-child) .tool-card:hover {
  background: linear-gradient(135deg, #eef2ff 0%, #f8f9ff 100%);
  box-shadow: 0 6px 24px rgba(102, 126, 234, 0.2);
}
</style> 