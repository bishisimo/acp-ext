export interface ClusterInfo {
  name: string;
  isAvailable: boolean; // 是否在API集群列表中存在
  isUserConfigured: boolean; // 是否为用户配置的集群
  configuredIndex?: number; // 用户配置中的索引位置
}

export interface ClusterManagerResult {
  success: boolean;
  clusters?: ClusterInfo[];
  error?: string;
}

export interface NamespaceInfo {
  name: string;
  isAvailable: boolean; // 是否在API命名空间列表中存在
  isUserConfigured: boolean; // 是否为用户配置的命名空间
  configuredIndex?: number; // 用户配置中的索引位置
}

export interface NamespaceManagerResult {
  success: boolean;
  namespaces?: NamespaceInfo[];
  error?: string;
}

/**
 * 从API获取集群列表
 */
export async function fetchAvailableClusters(baseUrl: string, token: string): Promise<string[]> {
  try {
    const apiUrl = `${baseUrl}/apis/cluster.alauda.io/v1alpha1/clustermodules`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await fetch(apiUrl, {
      signal: controller.signal,
      headers,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    // 提取集群名称列表
    if (data && data.items && Array.isArray(data.items)) {
      return data.items
        .map((item: any) => item.metadata?.name)
        .filter((name: string) => name && typeof name === 'string')
        .sort(); // 按名称排序
    }
    
    return [];
  } catch (error: any) {
    console.warn('获取集群列表失败:', error);
    return [];
  }
}

/**
 * 合并用户配置的集群和API集群列表，进行过滤和排序
 */
export function processClusterOptions(
  userConfiguredClusters: string[],
  availableClusters: string[]
): ClusterInfo[] {
  const availableSet = new Set(availableClusters);
  const clusterInfoMap = new Map<string, ClusterInfo>();
  
  // 处理用户配置的集群，保持配置顺序
  userConfiguredClusters.forEach((cluster, index) => {
    if (cluster && cluster.trim()) {
      clusterInfoMap.set(cluster, {
        name: cluster,
        isAvailable: availableSet.has(cluster),
        isUserConfigured: true,
        configuredIndex: index
      });
    }
  });
  
  // 添加API中存在但用户未配置的集群
  availableClusters.forEach(cluster => {
    if (!clusterInfoMap.has(cluster)) {
      clusterInfoMap.set(cluster, {
        name: cluster,
        isAvailable: true,
        isUserConfigured: false
      });
    }
  });
  
  const clusters = Array.from(clusterInfoMap.values());
  
  // 排序规则：
  // 1. 用户配置的集群优先，按配置顺序排列
  // 2. 然后是API中存在但用户未配置的集群，按名称排序
  return clusters.sort((a, b) => {
    // 用户配置的集群优先
    if (a.isUserConfigured && !b.isUserConfigured) return -1;
    if (!a.isUserConfigured && b.isUserConfigured) return 1;
    
    // 如果都是用户配置的，按配置顺序排序
    if (a.isUserConfigured && b.isUserConfigured) {
      return (a.configuredIndex || 0) - (b.configuredIndex || 0);
    }
    
    // 如果都不是用户配置的，按名称排序
    return a.name.localeCompare(b.name);
  });
}

/**
 * 从API获取指定集群的命名空间列表
 */
export async function fetchAvailableNamespaces(baseUrl: string, cluster: string, token: string): Promise<string[]> {
  try {
    const apiUrl = `${baseUrl}/kubernetes/${cluster}/api/v1/namespaces`;
    console.log('🔍 调用命名空间API:', apiUrl);
    console.log('🔑 Token长度:', token ? token.length : 0);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    console.log('📤 请求头:', headers);
    
    const response = await fetch(apiUrl, {
      signal: controller.signal,
      headers,
    });
    
    clearTimeout(timeoutId);
    
    console.log('📥 响应状态:', response.status, response.statusText);
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => '无法获取错误详情');
      console.error('❌ API响应错误:', response.status, errorText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    const data = await response.json();
    console.log('📊 API响应数据结构:', {
      hasData: !!data,
      hasItems: !!(data && data.items),
      itemsIsArray: Array.isArray(data?.items),
      itemsLength: data?.items?.length || 0
    });
    
    // 提取命名空间名称列表
    if (data && data.items && Array.isArray(data.items)) {
      const namespaces = data.items
        .map((item: any) => item.metadata?.name)
        .filter((name: string) => name && typeof name === 'string')
        .sort(); // 按名称排序
      
      console.log('✅ 成功获取命名空间列表:', namespaces);
      return namespaces;
    }
    
    console.warn('⚠️ API响应格式不正确，未找到items数组');
    return [];
  } catch (error: any) {
    console.error('❌ 获取命名空间列表失败:', error);
    return [];
  }
}

/**
 * 合并用户配置的命名空间和API命名空间列表，进行过滤和排序
 */
export function processNamespaceOptions(
  userConfiguredNamespaces: string[],
  availableNamespaces: string[]
): NamespaceInfo[] {
  const availableSet = new Set(availableNamespaces);
  const namespaceInfoMap = new Map<string, NamespaceInfo>();
  
  // 处理用户配置的命名空间，保持配置顺序
  userConfiguredNamespaces.forEach((namespace, index) => {
    if (namespace && namespace.trim()) {
      namespaceInfoMap.set(namespace, {
        name: namespace,
        isAvailable: availableSet.has(namespace),
        isUserConfigured: true,
        configuredIndex: index
      });
    }
  });
  
  // 添加API中存在但用户未配置的命名空间
  availableNamespaces.forEach(namespace => {
    if (!namespaceInfoMap.has(namespace)) {
      namespaceInfoMap.set(namespace, {
        name: namespace,
        isAvailable: true,
        isUserConfigured: false
      });
    }
  });
  
  const namespaces = Array.from(namespaceInfoMap.values());
  
  // 排序规则：
  // 1. 用户配置的命名空间优先，按配置顺序排列
  // 2. 然后是API中存在但用户未配置的命名空间，按名称排序
  return namespaces.sort((a, b) => {
    // 用户配置的命名空间优先
    if (a.isUserConfigured && !b.isUserConfigured) return -1;
    if (!a.isUserConfigured && b.isUserConfigured) return 1;
    
    // 如果都是用户配置的，按配置顺序排序
    if (a.isUserConfigured && b.isUserConfigured) {
      return (a.configuredIndex || 0) - (b.configuredIndex || 0);
    }
    
    // 如果都不是用户配置的，按名称排序
    return a.name.localeCompare(b.name);
  });
}

/**
 * 获取处理后的集群选项
 */
export async function getProcessedClusterOptions(
  userConfiguredClusters: string[],
  baseUrl: string,
  token: string
): Promise<ClusterManagerResult> {
  try {
    const availableClusters = await fetchAvailableClusters(baseUrl, token);
    const clusters = processClusterOptions(userConfiguredClusters, availableClusters);
    
    return {
      success: true,
      clusters
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || '获取集群信息失败'
    };
  }
}

/**
 * 获取处理后的命名空间选项
 */
export async function getProcessedNamespaceOptions(
  userConfiguredNamespaces: string[],
  cluster: string,
  baseUrl: string,
  token: string
): Promise<NamespaceManagerResult> {
  try {
    console.log('🚀 开始处理命名空间选项:', {
      userConfiguredNamespaces,
      cluster,
      baseUrl,
      tokenLength: token ? token.length : 0
    });
    
    if (!cluster || !cluster.trim()) {
      console.log('⚠️ 没有选择集群，返回用户配置的命名空间');
      // 如果没有选择集群，只返回用户配置的命名空间
      const namespaces = userConfiguredNamespaces.map((name, index) => ({
        name,
        isAvailable: true, // 默认标记为可用
        isUserConfigured: true,
        configuredIndex: index
      }));
      
      console.log('✅ 返回用户配置的命名空间:', namespaces);
      return {
        success: true,
        namespaces
      };
    }
    
    console.log('🔄 开始获取API命名空间列表...');
    const availableNamespaces = await fetchAvailableNamespaces(baseUrl, cluster, token);
    console.log('📋 API返回的命名空间列表:', availableNamespaces);
    
    console.log('🔄 开始处理和合并命名空间选项...');
    const namespaces = processNamespaceOptions(userConfiguredNamespaces, availableNamespaces);
    console.log('✅ 处理完成的命名空间选项:', namespaces);
    
    return {
      success: true,
      namespaces
    };
  } catch (error: any) {
    console.error('❌ getProcessedNamespaceOptions 失败:', error);
    return {
      success: false,
      error: error.message || '获取命名空间信息失败'
    };
  }
} 