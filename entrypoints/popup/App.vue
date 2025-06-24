<script lang="ts" setup>
import { ref, onMounted, computed, watch } from 'vue';
import Switch from '@/components/Switch.vue';
import Tools from '@/components/Tools.vue';
import { injectToastStyles } from '@/composables/toast';
import { generateNewUrl } from '@/composables/url-handler';
import { createToast } from '@/composables/toast';
import { getProcessedClusterOptions, getProcessedNamespaceOptions, type ClusterInfo, type NamespaceInfo } from '@/composables/cluster-manager';
import { isSupportedPlatformUrl, classifyAndParseUrl } from '@/composables/url-classifier';
import type { SwitchOption } from '@/components/Switch.vue';

// 这个函数会被注入到目标页面中执行
function getIdTokenFromPage() {
  try {
    const pageInfo = {
      url: window.location.href,
      host: window.location.host,
      origin: window.location.origin,
    };

    console.log('=== Token获取调试信息 ===');
    console.log('当前页面信息:', pageInfo);

    let foundToken = '';
    let foundIn = null;
    const debugInfo = {
      localStorage: {} as Record<string, any>,
    };

    // 1. 尝试从localStorage获取token
    console.log('1. 尝试从localStorage获取token...');
    
    const possibleKeys = [
      'id_token', 'idToken', 'ID_TOKEN', 'Id_Token',
      'access_token', 'accessToken', 'ACCESS_TOKEN',
      'token', 'Token', 'TOKEN',
      'authToken', 'auth_token', 'AUTH_TOKEN',
      'jwt', 'JWT',
      'bearerToken', 'bearer_token', 'BEARER_TOKEN'
    ];

    for (const key of possibleKeys) {
      try {
        const token = localStorage.getItem(key);
        if (token && token.trim()) {
          console.log(`✅ 在localStorage中通过key "${key}" 找到token (长度: ${token.length})`);
          foundToken = token.trim();
          foundIn = `localStorage[${key}]`;
          break; // 找到后立即退出循环
        }
      } catch (e) {
        // 忽略单个key的获取错误
      }
    }

    // 2. 收集localStorage调试信息 (可选)
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          const value = localStorage.getItem(key);
          if (value) {
            // 避免打印过长的token
            const displayValue = value.length > 200 ? `${value.substring(0, 50)}...[过长]...${value.substring(value.length - 50)}` : value;
            debugInfo.localStorage[key] = displayValue;
          }
        }
      }
    } catch (e) {
      console.warn('无法访问localStorage:', e);
    }
    
    console.log('=== 调试信息汇总 ===');
    const result = {
      token: foundToken,
      foundIn,
      pageInfo,
      debugInfo,
    };
    console.log('完整调试信息:', result);

    if (!foundToken) {
      console.log('❌ 未在localStorage中找到任何token');
    }

    return result;
  } catch (e) {
    console.error('Token获取过程中发生错误:', e);
    return {
      token: '',
      foundIn: null,
      pageInfo: { url: '', host: '', origin: '' },
      debugInfo: { localStorage: {} },
    };
  }
}



const pages = [
  { name: 'switch', title: '切换', icon: '🔄' },
  { name: 'tools', title: '工具', icon: '🛠️' },
];
const currentPage = ref('switch');

// 状态：集群/命名空间选项与当前值
const clusterOptions = ref<SwitchOption[]>([]);
const namespaceOptions = ref<SwitchOption[]>([]);
const selectedCluster = ref('');
const selectedNamespace = ref('');

// 平台版本
const platformVersion = ref('');
const versionLoading = ref(false);
const platformSupported = ref(true); // 平台是否支持

// 计算是否可以执行切换
const canSwitch = computed(() => {
  return platformSupported.value && (selectedCluster.value || selectedNamespace.value);
});

// 计算是否有配置（配置功能不依赖平台支持状态）
const hasConfig = computed(() => {
  return clusterOptions.value.length > 0 || namespaceOptions.value.length > 0;
});

// 当前页面信息
const currentPageInfo = ref<any>(null);

// 监听集群选择变化，自动获取对应的命名空间
watch(selectedCluster, async (newCluster) => {
  // 重置命名空间选择
  selectedNamespace.value = '';

  const clusterForNamespaces = newCluster || currentPageInfo.value?.cluster;
  
  if (clusterForNamespaces && platformSupported.value && currentPageInfo.value) {
    // 按需获取Token
    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      const currentTab = tabs[0];
      if (!currentTab?.id) throw new Error('无法获取标签页ID');
      
      const results = await browser.scripting.executeScript({
        target: { tabId: currentTab.id },
        func: getIdTokenFromPage
      });
      const token = results?.[0]?.result?.token || '';
      
      await loadProcessedNamespaceOptions(clusterForNamespaces, token);
    } catch (error) {
      console.error('在watch中获取token或命名空间失败:', error);
      createToast('获取命名空间列表失败', 'error');
    }
  } else {
    // 如果没有选定集群且当前URL也没有集群信息，则清空命名空间选项
    namespaceOptions.value = [];
  }
});

// 计算是否有配置且平台支持
const hasConfigAndSupported = computed(() => {
  return platformSupported.value && hasConfig.value;
});

onMounted(() => {
  injectToastStyles();
  loadOptions();
  fetchPlatformVersion();
  browser.runtime.onMessage.addListener(async (request: any) => {
    if (request.action === 'optionsUpdated') {
      await loadOptions();
    }
  });
});

async function loadOptions(token: string = '') {
  try {
    const result = await browser.storage.local.get(['namespaceOptions', 'clusterOptions']);
    const userConfiguredClusters = result.clusterOptions || [];
    const userConfiguredNamespaces = result.namespaceOptions || [];
    
    // 初始化命名空间选项为用户配置的选项
    namespaceOptions.value = userConfiguredNamespaces.map((name: string) => ({
      name,
      isAvailable: true,
      isUserConfigured: true
    }));
    
    // 如果有当前页面信息且支持平台，尝试获取实际集群列表
    if (currentPageInfo.value && platformSupported.value) {
      // 必须传入有效的token
      if (token) {
        await loadProcessedClusterOptions(userConfiguredClusters, token);
      } else {
        console.warn('loadOptions需要token，但未提供，跳过集群API获取');
        // 降级处理
        clusterOptions.value = userConfiguredClusters.map((name: string) => ({
          name,
          isAvailable: true,
          isUserConfigured: true
        }));
      }
    } else {
      // 否则使用用户配置的集群列表
      clusterOptions.value = userConfiguredClusters.map((name: string) => ({
        name,
        isAvailable: true, // 默认标记为可用
        isUserConfigured: true
      }));
    }
    
    selectedCluster.value = '';
    selectedNamespace.value = '';
  } catch (error) {
    console.warn('加载配置失败:', error);
    // 降级到基本配置
    const result = await browser.storage.local.get(['namespaceOptions', 'clusterOptions']);
    clusterOptions.value = (result.clusterOptions || []).map((name: string) => ({
      name,
      isAvailable: true,
      isUserConfigured: true
    }));
    namespaceOptions.value = (result.namespaceOptions || []).map((name: string) => ({
      name,
      isAvailable: true,
      isUserConfigured: true
    }));
  }
}

async function loadProcessedClusterOptions(userConfiguredClusters: string[], token: string) {
  if (!currentPageInfo.value?.baseUrl) return;
  
  try {
    // 获取处理后的集群选项
    const clusterResult = await getProcessedClusterOptions(
      userConfiguredClusters,
      currentPageInfo.value.baseUrl,
      token
    );
    
    if (clusterResult.success && clusterResult.clusters) {
      clusterOptions.value = clusterResult.clusters.map(cluster => ({
        name: cluster.name,
        isAvailable: cluster.isAvailable,
        isUserConfigured: cluster.isUserConfigured
      }));
    } else {
      // 如果API调用失败，使用用户配置的列表
      clusterOptions.value = userConfiguredClusters.map((name: string) => ({
        name,
        isAvailable: true,
        isUserConfigured: true
      }));
    }
  } catch (error) {
    console.warn('获取集群信息失败:', error);
    // 降级到用户配置的列表
    clusterOptions.value = userConfiguredClusters.map((name: string) => ({
      name,
      isAvailable: true,
      isUserConfigured: true
    }));
  }
}

async function loadProcessedNamespaceOptions(cluster: string, token: string) {
  if (!currentPageInfo.value?.baseUrl || !cluster) {
    createToast('无法获取命名空间：缺少基础URL或集群信息', 'error');
    return;
  }
  
  
  try {
    // 获取用户配置的命名空间
    const result = await browser.storage.local.get(['namespaceOptions']);
    const userConfiguredNamespaces = result.namespaceOptions || [];
    
    console.log('用户配置的命名空间:', userConfiguredNamespaces);
    
    // 构建API URL进行调试
    const apiUrl = `${currentPageInfo.value.baseUrl}/kubernetes/${cluster}api/v1/namespaces`;
    console.log('命名空间API URL:', apiUrl);
    
    // 获取处理后的命名空间选项
    const namespaceResult = await getProcessedNamespaceOptions(
      userConfiguredNamespaces,
      cluster,
      currentPageInfo.value.baseUrl,
      token
    );
    
    console.log('命名空间API调用结果:', namespaceResult);
    
    if (namespaceResult.success && namespaceResult.namespaces) {
      const availableCount = namespaceResult.namespaces.filter(ns => ns.isAvailable).length;
      const userConfiguredCount = namespaceResult.namespaces.filter(ns => ns.isUserConfigured).length;
      
      
      namespaceOptions.value = namespaceResult.namespaces.map(namespace => ({
        name: namespace.name,
        isAvailable: namespace.isAvailable,
        isUserConfigured: namespace.isUserConfigured
      }));
    } else {
      createToast(`❌ API调用失败：${namespaceResult.error || '未知错误'}，使用用户配置列表`, 'warning');
      console.error('命名空间API调用失败:', namespaceResult.error);
      
      // 如果API调用失败，使用用户配置的列表
      namespaceOptions.value = userConfiguredNamespaces.map((name: string) => ({
        name,
        isAvailable: true,
        isUserConfigured: true
      }));
    }
  } catch (error) {
    console.error('获取命名空间信息失败:', error);
    createToast(`❌ 获取命名空间失败：${error instanceof Error ? error.message : '未知错误'}`, 'error');
    
    // 降级到用户配置的列表
    const result = await browser.storage.local.get(['namespaceOptions']);
    const userConfiguredNamespaces = result.namespaceOptions || [];
    namespaceOptions.value = userConfiguredNamespaces.map((name: string) => ({
      name,
      isAvailable: true,
      isUserConfigured: true
    }));
  }
}

async function fetchPlatformVersion() {
  let token = ''; // 在函数作用域顶部定义token
  try {
    versionLoading.value = true;
    platformSupported.value = true; // 重置状态
    currentPageInfo.value = null; // 重置页面信息
    
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const currentTab = tabs[0];
    if (!currentTab || !currentTab.url) {
      console.warn('未获取到当前标签页');
      platformSupported.value = false;
      return;
    }
    
    // 使用新的URL分类器检查页面支持性
    if (!isSupportedPlatformUrl(currentTab.url)) {
      console.warn('当前页面不是支持的平台环境');
      platformSupported.value = false;
      return;
    }
    
    // 解析页面信息
    const classificationResult = classifyAndParseUrl(currentTab.url);
    if (classificationResult.success && classificationResult.urlInfo) {
      currentPageInfo.value = classificationResult.urlInfo;
    }
    
    // 从当前URL提取基础地址
    const baseUrl = currentPageInfo.value?.baseUrl || '';
    if (!baseUrl) {
      console.warn('无法获取基础URL');
      platformSupported.value = false;
      return;
    }
    const apiUrl = `${baseUrl}/api/v1/namespaces/kube-public/configmaps/platform`;
    
    // 获取当前页面的Authorization token - 使用Manifest V3方式
    try {
      if (!currentTab.id) {
        throw new Error('无法获取标签页ID');
      }
      
      // 使用WXT的scripting API注入函数到页面
      const results = await browser.scripting.executeScript({
        target: { tabId: currentTab.id },
        func: getIdTokenFromPage
      });
      
      if (results && results[0] && results[0].result) {
        const tokenData = results[0].result;
        token = tokenData.token || ''; // 赋值给外部的token变量
        console.log('Token获取结果:', tokenData);
        
      } else {
        console.log('未能获取到token结果');
        token = '';
      }
    } catch (error) {
      console.warn('获取token失败:', error);
      token = '';
    }
    
    // 设置请求超时
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    // 准备请求头
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    
    // 如果有token，添加到请求头
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    // 发送API请求
    const response = await fetch(apiUrl, {
      signal: controller.signal,
      headers,
    });
    
    // 调试 response
    
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    if (data && data.data && data.data.version) {
      // 确保版本号格式正确，如果没有v前缀则添加
      let version = data.data.version.toString().trim();
      if (version && !version.startsWith('v') && !version.startsWith('V')) {
        version = 'v' + version;
      }
      platformVersion.value = version;
      platformSupported.value = true;
    } else {
      platformSupported.value = false;
    }
  } catch (error: any) {
    platformSupported.value = false;
    if (error.name === 'AbortError') {
      console.warn('获取平台版本超时');
    } else {
      console.warn('获取平台版本失败:', error);
    }
    // 不显示错误toast，因为这不是关键功能
  } finally {
    versionLoading.value = false;
    // 平台检测完成后重新加载选项，并传入已获取的token
    await loadOptions(token);
    
    // 如果当前页面已经有集群信息，加载对应的命名空间，并传入已获取的token
    if (currentPageInfo.value?.cluster && platformSupported.value) {
      if (token) {
        await loadProcessedNamespaceOptions(currentPageInfo.value.cluster, token);
      } else {
        console.warn('fetchPlatformVersion缺少token，跳过命名空间获取');
      }
    }
  }
}

async function openOptionsPage() {
  try {
    // 直接创建新标签页打开选项页面，确保全屏显示
    const optionsUrl = browser.runtime.getURL('/options.html');
    await browser.tabs.create({ 
      url: optionsUrl,
      active: true 
    });
    window.close(); // 关闭popup
  } catch (error) {
    console.error('打开配置页面失败:', error);
    createToast('打开配置页面失败', 'error');
  }
}

async function goSwitch() {
  if (!canSwitch.value) {
    createToast('请选择集群或命名空间', 'warning');
    return;
  }
  
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const currentTab = tabs[0];
    if (!currentTab || !currentTab.url) {
      createToast('未获取到当前标签页', 'error');
      return;
    }
    
    const result = generateNewUrl(currentTab.url, selectedCluster.value, selectedNamespace.value);
    if (!result.success || !result.url) {
      createToast(result.error || 'URL 生成失败', 'error');
      return;
    }
    
    if (currentTab.id) {
      await browser.tabs.update(currentTab.id, { url: result.url });
    }
    
    createToast('正在切换...', 'success');
    window.close(); // 操作完成后关闭popup
  } catch (error) {
    console.error('切换失败:', error);
    createToast('切换失败，请重试', 'error');
  }
}


</script>

<template>
  <div class="popup-root">
    <!-- 头部 -->
    <div class="popup-header">
      <div class="header-icon">⚙️</div>
      <div class="header-content">
        <div class="header-main">
          <h1 class="header-title">ACP 扩展</h1>
          <div class="version-badge" :class="{ 
            loading: versionLoading, 
            unsupported: !versionLoading && !platformSupported,
            supported: !versionLoading && platformSupported && platformVersion
          }">
            <template v-if="versionLoading">
              <span class="loading-spinner"></span>
              检测中
            </template>
            <template v-else-if="!platformSupported">
              <span class="unsupported-icon">⊘</span>
              不支持
            </template>
            <template v-else-if="platformVersion">
              {{ platformVersion }}
            </template>
          </div>
        </div>
        <p class="header-subtitle">快速切换集群和命名空间</p>
      </div>
    </div>
    
    <!-- 导航栏 -->
    <div class="navigation">
      <div
        v-for="page in pages"
        :key="page.name"
        class="nav-item"
        :class="{ active: currentPage === page.name }"
        @click="currentPage = page.name"
      >
        <span class="nav-icon">{{ page.icon }}</span>
        <span class="nav-title">{{ page.title }}</span>
      </div>
    </div>
    
    <!-- 内容区域 -->
    <div class="content-wrapper">
      <div class="content" :class="`content-${currentPage}`">
        <!-- 切换页面 -->
        <div v-if="currentPage === 'switch'" class="page-content">
          <!-- 检测状态容器 - 统一布局避免跳动 -->
          <div v-if="versionLoading || !platformSupported" class="detection-state">
            <div class="state-icon-container">
              <div class="state-icon-circle" :class="{ loading: versionLoading, unsupported: !versionLoading }">
                <span v-if="versionLoading" class="loading-spinner-large"></span>
                <span v-else class="icon-dash">⊘</span>
              </div>
            </div>
            
            <div class="state-content">
              <h3 class="state-title">
                {{ versionLoading ? '检测页面环境中...' : '当前页面不支持' }}
              </h3>
              <p class="state-desc">
                <span v-if="versionLoading">正在验证当前页面是否支持切换功能</span>
                                 <span v-else>
                   此页面不是平台环境，切换功能暂不可用<br>
                   <span class="hint-text">请在平台环境中使用此功能</span>
                 </span>
              </p>
            </div>
            
            <div v-if="!versionLoading" class="state-actions">
              <button class="btn btn-secondary" @click="openOptionsPage">
                <span class="btn-icon">⚙️</span>
                <span>管理配置</span>
              </button>
            </div>
          </div>
          
          <!-- 检测通过但无配置 -->
          <div v-else-if="!hasConfig" class="empty-state">
            <div class="empty-icon">📝</div>
            <h3 class="empty-title">暂无配置选项</h3>
            <p class="empty-desc">检测通过！请先配置集群和命名空间选项</p>
            <button class="btn btn-primary" @click="openOptionsPage">
              <span class="btn-icon">⚙️</span>
              开始配置
            </button>
          </div>
          
          <!-- 检测通过且有配置 - 可以切换 -->
          <div v-else class="switch-content">
            <div class="form-section">
              <div class="form-fields">
                <Switch
                  :options="clusterOptions"
                  label="集群"
                  v-model="selectedCluster"
                />
                <Switch
                  :options="namespaceOptions"
                  label="命名空间"
                  v-model="selectedNamespace"
                />
              </div>
            </div>
            
            <div class="action-section">
              <button 
                class="btn btn-primary btn-switch" 
                @click="goSwitch"
                :disabled="!canSwitch"
              >
                <span class="btn-icon">🚀</span>
                <span>{{ canSwitch ? '立即切换' : '请选择选项' }}</span>
              </button>
              
              <button class="btn btn-secondary" @click="openOptionsPage">
                <span class="btn-icon">⚙️</span>
                <span>管理配置</span>
              </button>
            </div>
          </div>
        </div>
        
        <!-- 工具页面 -->
        <div v-else-if="currentPage === 'tools'" class="page-content">
          <Tools />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.popup-root {
  width: 400px;
  height: 520px; /* 固定高度，避免跳动 */
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 10px 40px rgba(0,0,0,0.15);
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
  display: flex;
  flex-direction: column;
}

/* 头部样式 */
.popup-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 16px 20px;
  display: flex;
  align-items: center;
  gap: 14px;
  flex-shrink: 0;
}

.header-icon {
  font-size: 28px;
  width: 48px;
  height: 48px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.header-content {
  flex: 1;
  min-width: 0;
}

.header-main {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 4px;
}

.header-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.2;
}

.version-badge {
  background: rgba(255, 255, 255, 0.25);
  color: white;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.5px;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  flex-shrink: 0;
  transition: all 0.4s ease;
  opacity: 0;
  transform: translateX(10px);
  animation: slideInRight 0.4s ease 0.5s forwards;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 60px;
  justify-content: center;
}

.version-badge.loading {
  background: rgba(255, 255, 255, 0.15);
}

.version-badge.supported {
  background: rgba(34, 197, 94, 0.3);
  border-color: rgba(34, 197, 94, 0.4);
}

.version-badge.unsupported {
  background: rgba(239, 68, 68, 0.3);
  border-color: rgba(239, 68, 68, 0.4);
}

.loading-spinner {
  width: 10px;
  height: 10px;
  border: 1.5px solid rgba(255, 255, 255, 0.3);
  border-top: 1.5px solid white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  flex-shrink: 0;
}

.unsupported-icon {
  font-size: 10px;
  flex-shrink: 0;
}

/* 统一的检测状态样式 */
.detection-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 16px;
  transition: all 0.3s ease;
}

.state-icon-container {
  margin-bottom: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.state-icon-circle {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  transition: all 0.4s ease;
}

/* 检测中状态 */
.state-icon-circle.loading {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  animation: detectPulse 2s ease-in-out infinite;
}

/* 不支持状态 */
.state-icon-circle.unsupported {
  background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
  border: 2px solid #cbd5e1;
}

.state-icon-circle.unsupported:hover {
  transform: scale(1.02);
  border-color: #94a3b8;
}

.loading-spinner-large {
  width: 32px;
  height: 32px;
  border: 3px solid rgba(255, 255, 255, 0.3);
  border-top: 3px solid white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.icon-dash {
  font-size: 24px;
  font-weight: 300;
  color: #64748b;
  line-height: 1;
  transition: color 0.3s ease;
}

.state-content {
  margin-bottom: 32px;
  transition: all 0.3s ease;
}

.state-title {
  margin: 0 0 12px 0;
  font-size: 18px;
  font-weight: 600;
  transition: color 0.3s ease;
}

.detection-state .state-title {
  color: #475569;
}

/* 检测中时的标题颜色 */
.detection-state:has(.state-icon-circle.loading) .state-title {
  color: #667eea;
}

.state-desc {
  margin: 0;
  font-size: 14px;
  color: #64748b;
  line-height: 1.5;
  transition: opacity 0.3s ease;
}

.state-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  max-width: 200px;
  opacity: 1;
  transform: translateY(0);
  transition: all 0.3s ease 0.1s;
}

.hint-text {
  font-size: 12px;
  color: #94a3b8;
  font-style: italic;
}

@keyframes slideInRight {
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.header-subtitle {
  margin: 0;
  font-size: 13px;
  opacity: 0.9;
  line-height: 1.3;
}

/* 导航栏样式 */
.navigation {
  display: flex;
  background: #f8f9fa;
  border-bottom: 1px solid #e9ecef;
  flex-shrink: 0;
}

.nav-item {
  flex: 1;
  padding: 10px 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-bottom: 3px solid transparent;
}

.nav-item:hover {
  background: #e9ecef;
}

.nav-item.active {
  background: #fff;
  border-bottom-color: #667eea;
}

.nav-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.nav-title {
  font-size: 13px;
  font-weight: 600;
  color: #333;
  line-height: 1;
}

.nav-item.active .nav-title {
  color: #667eea;
}

/* 内容区域 */
.content-wrapper {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
}

.page-content {
  flex: 1;
  display: flex;
  flex-direction: column;
}

/* 空状态 */
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 16px;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.6;
}

.empty-title {
  margin: 0 0 8px 0;
  font-size: 18px;
  font-weight: 600;
  color: #333;
}

.empty-desc {
  margin: 0 0 24px 0;
  font-size: 14px;
  color: #666;
  line-height: 1.4;
}

/* 切换内容 */
.switch-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-section {
  flex: 1;
}

.section-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.section-desc {
  margin: 4px 0 0 0;
  font-size: 13px;
  color: #666;
}

.form-fields {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.action-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 12px;
  border-top: 1px solid #f0f0f0;
  flex-shrink: 0;
}

/* 工具页面 */
.tools-header {
  margin-bottom: 20px;
}

/* 按钮样式 */
.btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 14px 20px;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  text-decoration: none;
  line-height: 1;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none !important;
}

.btn-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  box-shadow: 0 4px 16px rgba(102, 126, 234, 0.3);
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 24px rgba(102, 126, 234, 0.4);
}



/* 检测状态脉冲动画 */
@keyframes detectPulse {
  0%, 100% { 
    box-shadow: 0 4px 16px rgba(102, 126, 234, 0.3);
    transform: scale(1);
  }
  50% { 
    box-shadow: 0 6px 24px rgba(102, 126, 234, 0.5);
    transform: scale(1.02);
  }
}

.btn-secondary {
  background: #f8f9fa;
  color: #667eea;
  border: 2px solid #e9ecef;
}

.btn-secondary:hover {
  background: #e9ecef;
  border-color: #667eea;
  transform: translateY(-1px);
}

.btn-switch {
  min-height: 48px;
  font-size: 15px;
}

.btn-icon {
  font-size: 18px;
}

/* 滚动条样式 */
.content::-webkit-scrollbar {
  width: 6px;
}

.content::-webkit-scrollbar-track {
  background: transparent;
}

.content::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.1);
  border-radius: 3px;
}

.content::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.2);
}
</style>
