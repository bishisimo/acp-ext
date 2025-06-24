<script lang="ts" setup>
import { ref, onMounted, nextTick } from 'vue';
import { createToast, injectToastStyles } from '@/composables/toast';

// 定义接口
interface OptionItem {
  id: string;
  value: string;
}

interface StorageData {
  namespaceOptions?: string[];
  clusterOptions?: string[];
  kubectlOpenType?: 'current' | 'tab' | 'window';
}

// 响应式数据
const clusterOptions = ref<OptionItem[]>([]);
const namespaceOptions = ref<OptionItem[]>([]);
const kubectlOpenType = ref<'current' | 'tab' | 'window'>('tab');
const isLoading = ref(true);
const isSaving = ref(false);

// 拖拽相关
const draggedItem = ref<OptionItem | null>(null);
const draggedType = ref<'cluster' | 'namespace' | null>(null);

onMounted(async () => {
  // 注入Toast样式
  injectToastStyles();
  
  // 隐藏加载界面
  await nextTick();
  const loadingEl = document.getElementById('loading');
  if (loadingEl) {
    setTimeout(() => {
      loadingEl.style.display = 'none';
    }, 500);
  }
  
  // 加载配置
  await loadOptions();
});

// 加载保存的选项
async function loadOptions(): Promise<void> {
  try {
    const result = await browser.storage.local.get(['namespaceOptions', 'clusterOptions', 'kubectlOpenType']) as StorageData;
    
    // 转换为 OptionItem 格式
    clusterOptions.value = (result.clusterOptions || ['global']).map((value, index) => ({
      id: `cluster-${index}`,
      value
    }));
    
    namespaceOptions.value = (result.namespaceOptions || ['kube-system', 'cpaas-system']).map((value, index) => ({
      id: `namespace-${index}`,
      value
    }));
    
    kubectlOpenType.value = result.kubectlOpenType || 'tab';
  } catch (error) {
    console.error('加载配置失败:', error);
    createToast('加载配置失败', 'error');
  } finally {
    isLoading.value = false;
  }
}

// 添加新选项
function addCluster(): void {
  const newId = `cluster-${Date.now()}`;
  clusterOptions.value.push({ id: newId, value: '' });
}

function addNamespace(): void {
  const newId = `namespace-${Date.now()}`;
  namespaceOptions.value.push({ id: newId, value: '' });
}

// 删除选项
function removeCluster(item: OptionItem): void {
  if (clusterOptions.value.length <= 1) {
    createToast('至少保留一个集群选项', 'warning');
    return;
  }
  const index = clusterOptions.value.findIndex(opt => opt.id === item.id);
  if (index > -1) {
    clusterOptions.value.splice(index, 1);
  }
}

function removeNamespace(item: OptionItem): void {
  if (namespaceOptions.value.length <= 1) {
    createToast('至少保留一个命名空间选项', 'warning');
    return;
  }
  const index = namespaceOptions.value.findIndex(opt => opt.id === item.id);
  if (index > -1) {
    namespaceOptions.value.splice(index, 1);
  }
}

// 拖拽事件处理
function handleDragStart(item: OptionItem, type: 'cluster' | 'namespace', event: DragEvent): void {
  draggedItem.value = item;
  draggedType.value = type;
  if (event.target) {
    (event.target as HTMLElement).style.opacity = '0.4';
  }
}

function handleDragOver(event: DragEvent): void {
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }
}

function handleDrop(targetItem: OptionItem, type: 'cluster' | 'namespace', event: DragEvent): void {
  event.preventDefault();
  
  if (!draggedItem.value || draggedType.value !== type || draggedItem.value.id === targetItem.id) {
    return;
  }
  
  const options = type === 'cluster' ? clusterOptions.value : namespaceOptions.value;
  const draggedIndex = options.findIndex(opt => opt.id === draggedItem.value!.id);
  const targetIndex = options.findIndex(opt => opt.id === targetItem.id);
  
  if (draggedIndex > -1 && targetIndex > -1) {
    // 移动元素
    const [draggedElement] = options.splice(draggedIndex, 1);
    options.splice(targetIndex, 0, draggedElement);
  }
}

function handleDragEnd(event: DragEvent): void {
  if (event.target) {
    (event.target as HTMLElement).style.opacity = '1';
  }
  draggedItem.value = null;
  draggedType.value = null;
}

// 保存配置
async function saveOptions(): Promise<void> {
  if (isSaving.value) return;
  
  isSaving.value = true;
  
  try {
    // 验证数据
    const clusters = clusterOptions.value.map(opt => opt.value.trim()).filter(Boolean);
    const namespaces = namespaceOptions.value.map(opt => opt.value.trim()).filter(Boolean);
    
    if (clusters.length === 0) {
      createToast('至少需要一个集群选项', 'error');
      return;
    }
    
    if (namespaces.length === 0) {
      createToast('至少需要一个命名空间选项', 'error');
      return;
    }
    
    // 保存到存储
    await browser.storage.local.set({
      clusterOptions: clusters,
      namespaceOptions: namespaces,
      kubectlOpenType: kubectlOpenType.value,
    });
    
    // 通知其他页面配置已更新
    try {
      await browser.runtime.sendMessage({ action: 'optionsUpdated' });
    } catch (error) {
      // 忽略消息发送错误
      console.warn('发送更新消息失败:', error);
    }
    
    createToast('配置已保存成功！', 'success');
  } catch (error) {
    console.error('保存配置失败:', error);
    createToast('保存配置失败', 'error');
  } finally {
    isSaving.value = false;
  }
}

// 重置为默认配置
function resetToDefaults(): void {
  if (confirm('确定要重置为默认配置吗？这将清除所有自定义设置。')) {
    clusterOptions.value = [{ id: 'cluster-default', value: 'global' }];
    namespaceOptions.value = [
      { id: 'namespace-default-1', value: 'kube-system' },
      { id: 'namespace-default-2', value: 'cpaas-system' }
    ];
    kubectlOpenType.value = 'tab';
    createToast('已重置为默认配置', 'info');
  }
}

// 键盘快捷键支持
function handleKeydown(event: KeyboardEvent): void {
  if ((event.ctrlKey || event.metaKey) && event.key === 's') {
    event.preventDefault();
    saveOptions();
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown);
});
</script>

<template>
  <div class="options-root">
    <header class="options-header">
      <div class="container">
        <div class="header-content">
          <div class="header-left">
            <div class="extension-icon">⚙️</div>
            <div class="header-text">
              <h1 class="header-title">ACP 扩展配置</h1>
              <p class="header-subtitle">管理您的集群和命名空间设置</p>
            </div>
          </div>
          <div class="header-actions">
            <button 
              class="btn btn-outline" 
              @click="resetToDefaults"
              :disabled="isSaving"
            >
              <span class="btn-icon">🔄</span>
              重置默认
            </button>
          </div>
        </div>
      </div>
    </header>

    <main class="options-content">
      <div class="container">
        <div v-if="isLoading" class="loading-state">
          <div class="loading-spinner"></div>
          <p>加载配置中...</p>
        </div>
        
        <div v-else class="content-grid">
          <section class="config-section">
            <header class="section-header">
              <h2 class="section-title">
                <span class="section-icon">🚀</span>
                功能设置
              </h2>
              <p class="section-description">配置扩展的基本行为选项</p>
            </header>
            
            <div class="section-content">
              <div class="setting-item">
                <div class="setting-label">
                  <label for="kubectlOpenType">kubectl 打开方式</label>
                  <p class="setting-hint">选择点击终端链接时的打开方式</p>
                </div>
                <select 
                  id="kubectlOpenType" 
                  v-model="kubectlOpenType" 
                  class="setting-select"
                >
                  <option value="current">当前页面</option>
                  <option value="tab">新标签页</option>
                  <option value="window">新窗口</option>
                </select>
              </div>
            </div>
          </section>

          <section class="config-section">
            <header class="section-header">
              <div class="section-title-group">
                <h2 class="section-title">
                  <span class="section-icon">🌐</span>
                  集群列表
                </h2>
                <button class="add-btn" @click="addCluster">
                  <span class="btn-icon">➕</span>
                  添加集群
                </button>
              </div>
              <p class="section-description">管理可用的集群选项，支持拖拽排序</p>
            </header>
            
            <div class="section-content">
              <div class="option-list">
                <div
                  v-for="item in clusterOptions"
                  :key="item.id"
                  class="option-item"
                  :class="{ dragging: draggedItem?.id === item.id }"
                  draggable="true"
                  @dragstart="handleDragStart(item, 'cluster', $event)"
                  @dragover="handleDragOver"
                  @drop="handleDrop(item, 'cluster', $event)"
                  @dragend="handleDragEnd"
                >
                  <span class="drag-handle">⋮⋮</span>
                  <input 
                    v-model="item.value" 
                    class="option-input"
                    placeholder="请输入集群名称"
                    type="text"
                  />
                  <button 
                    class="delete-btn" 
                    @click="removeCluster(item)"
                    :disabled="clusterOptions.length <= 1"
                    title="删除"
                  >
                    <span class="btn-icon">🗑️</span>
                  </button>
                </div>
              </div>
            </div>
          </section>

          <!-- 命名空间配置卡片 -->
          <section class="config-section">
            <header class="section-header">
              <div class="section-title-group">
                <h2 class="section-title">
                  <span class="section-icon">📁</span>
                  命名空间列表
                </h2>
                <button class="add-btn" @click="addNamespace">
                  <span class="btn-icon">➕</span>
                  添加命名空间
                </button>
              </div>
              <p class="section-description">管理可用的命名空间选项，支持拖拽排序</p>
            </header>
            
            <div class="section-content">
              <div class="option-list">
                <div
                  v-for="item in namespaceOptions"
                  :key="item.id"
                  class="option-item"
                  :class="{ dragging: draggedItem?.id === item.id }"
                  draggable="true"
                  @dragstart="handleDragStart(item, 'namespace', $event)"
                  @dragover="handleDragOver"
                  @drop="handleDrop(item, 'namespace', $event)"
                  @dragend="handleDragEnd"
                >
                  <span class="drag-handle">⋮⋮</span>
                  <input 
                    v-model="item.value" 
                    class="option-input"
                    placeholder="请输入命名空间名称"
                    type="text"
                  />
                  <button 
                    class="delete-btn" 
                    @click="removeNamespace(item)"
                    :disabled="namespaceOptions.length <= 1"
                    title="删除"
                  >
                    <span class="btn-icon">🗑️</span>
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>

    <!-- 底部保存按钮 -->
    <footer class="options-footer">
      <div class="container">
        <div class="footer-content">
          <div class="footer-info">
            <p class="save-hint">💡 修改配置后请及时保存以免丢失 (Ctrl+S)</p>
          </div>
          <button 
            class="btn btn-primary save-btn" 
            @click="saveOptions"
            :disabled="isSaving || isLoading"
          >
            <span v-if="isSaving" class="loading-spinner small"></span>
            <span v-else class="btn-icon">💾</span>
            {{ isSaving ? '保存中...' : '保存配置' }}
          </button>
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
/* 基础样式 */
.options-root {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  flex-direction: column;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
}

.container {
  max-width: 1000px;
  margin: 0 auto;
  padding: 0 24px;
}

/* 头部样式 */
.options-header {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  box-shadow: 0 2px 20px rgba(0, 0, 0, 0.1);
  position: sticky;
  top: 0;
  z-index: 100;
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 0;
  gap: 20px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.extension-icon {
  font-size: 36px;
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(102, 126, 234, 0.3);
  flex-shrink: 0;
}

.header-text {
  min-width: 0;
}

.header-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  line-height: 1.2;
}

.header-subtitle {
  margin: 4px 0 0 0;
  font-size: 14px;
  color: #666;
  line-height: 1.3;
}

/* 主要内容 */
.options-content {
  flex: 1;
  padding: 32px 0 120px 0;
}

.loading-state {
  text-align: center;
  padding: 80px 0;
  color: white;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(255, 255, 255, 0.3);
  border-top: 3px solid white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 16px;
}

.loading-spinner.small {
  width: 16px;
  height: 16px;
  border-width: 2px;
  margin: 0;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.content-grid {
  display: grid;
  gap: 24px;
}

/* 配置区块样式 */
.config-section {
  background: white;
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  transition: transform 0.2s, box-shadow 0.2s;
}

.config-section:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
}

.section-header {
  padding: 24px 24px 16px 24px;
  border-bottom: 1px solid #f0f0f0;
}

.section-title-group {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  gap: 16px;
}

.section-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 12px;
  color: #333;
}

.section-icon {
  font-size: 24px;
}

.section-description {
  margin: 0;
  font-size: 14px;
  color: #666;
}

.section-content {
  padding: 24px;
}

/* 设置项样式 */
.setting-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
}

.setting-label {
  flex: 1;
}

.setting-label label {
  font-size: 16px;
  font-weight: 500;
  color: #333;
  display: block;
  margin-bottom: 4px;
}

.setting-hint {
  margin: 0;
  font-size: 13px;
  color: #888;
}

.setting-select {
  flex: 0 0 200px;
  padding: 12px 16px;
  border: 2px solid #e1e5e9;
  border-radius: 8px;
  font-size: 14px;
  background-color: white;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.setting-select:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

/* 选项列表样式 */
.option-list {
  display: grid;
  gap: 8px;
}

.option-item {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  background: #f8f9fa;
  border: 2px solid #e9ecef;
  border-radius: 8px;
  transition: all 0.2s;
  cursor: move;
}

.option-item:hover {
  border-color: #667eea;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.1);
}

.option-item.dragging {
  opacity: 0.5;
  transform: rotate(2deg);
}

.drag-handle {
  cursor: move;
  padding: 4px 8px 4px 0;
  color: #999;
  user-select: none;
  font-size: 16px;
}

.option-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  margin: 0 12px;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.option-input:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.1);
}

/* 按钮样式 */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  text-decoration: none;
  line-height: 1;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none !important;
}

.btn-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
}

.btn-outline {
  background: white;
  color: #667eea;
  border: 2px solid #667eea;
}

.btn-outline:hover:not(:disabled) {
  background: #667eea;
  color: white;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.add-btn {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.add-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.delete-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 8px;
  border-radius: 6px;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #dc3545;
}

.delete-btn:not(:disabled):hover {
  background: #ffe6e6;
  transform: scale(1.1);
}

.delete-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.btn-icon {
  font-size: 16px;
  line-height: 1;
}

/* 底部样式 */
.options-footer {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-top: 1px solid #e1e5e9;
  box-shadow: 0 -2px 20px rgba(0, 0, 0, 0.1);
  z-index: 100;
}

.footer-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 0;
  gap: 16px;
}

.footer-info {
  flex: 1;
}

.save-hint {
  margin: 0;
  font-size: 13px;
  color: #666;
}

.save-btn {
  min-width: 120px;
  justify-content: center;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .container {
    padding: 0 16px;
  }
  
  .header-content {
    flex-direction: column;
    gap: 16px;
    text-align: center;
  }
  
  .setting-item {
    flex-direction: column;
    gap: 12px;
  }
  
  .setting-select {
    flex: none;
    width: 100%;
  }
  
  .footer-content {
    flex-direction: column;
    gap: 12px;
    text-align: center;
  }
  
  .section-title-group {
    flex-direction: column;
    gap: 12px;
  }
}
</style> 