export enum URL_TYPE {
  ACP = 'acp',
  DATA_SERVICES = 'dataservices',
  UNKNOWN = 'unknown',
}

export interface UrlInfo {
  type: URL_TYPE;
  baseUrl: string;
  project?: string;
  cluster?: string;
  namespace?: string;
  originalUrl: string;
}

export interface UrlClassificationResult {
  success: boolean;
  urlInfo?: UrlInfo;
  error?: string;
}

// URL标识符
const URL_FLAGS = {
  ACP: '/console-acp/',
  DATA_SERVICES: '/console-dataservices/',
} as const;

// URL匹配模式
const URL_PATTERNS = {
  ACP: /\/console-acp\/workspace\/(.*?)~(.*?)~(.*?)\//,
  DATA_SERVICES_PARAM: /\/console-dataservices\/project\/(.*?)\/(.*?)\?workspace=(.*?)~(.*?)~(.*?)(?:$|&)/,
  DATA_SERVICES_VIEW: /\/console-dataservices\/project\/(.*?)\/(.*?)\/view\/(.*?)~(.*?)~(.*?)~(.*)/,
} as const;

/**
 * 识别URL类型
 */
export function classifyUrlType(url: string): URL_TYPE {
  if (url.includes(URL_FLAGS.ACP)) return URL_TYPE.ACP;
  if (url.includes(URL_FLAGS.DATA_SERVICES)) return URL_TYPE.DATA_SERVICES;
  return URL_TYPE.UNKNOWN;
}

/**
 * 提取URL基础地址
 */
export function extractBaseUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return `${urlObj.protocol}//${urlObj.host}`;
  } catch (error) {
    console.warn('无法解析URL:', url);
    return '';
  }
}

/**
 * 解析ACP URL
 */
function parseAcpUrl(url: string): UrlInfo | null {
  const match = url.match(URL_PATTERNS.ACP);
  if (!match) return null;
  
  const [, project, cluster, namespace] = match;
  return {
    type: URL_TYPE.ACP,
    baseUrl: extractBaseUrl(url),
    project,
    cluster,
    namespace,
    originalUrl: url
  };
}

/**
 * 解析DataServices URL
 */
function parseDataServicesUrl(url: string): UrlInfo | null {
  // 尝试参数模式
  let match = url.match(URL_PATTERNS.DATA_SERVICES_PARAM);
  if (match) {
    const [, , , project, cluster, namespace] = match;
    return {
      type: URL_TYPE.DATA_SERVICES,
      baseUrl: extractBaseUrl(url),
      project,
      cluster,
      namespace,
      originalUrl: url
    };
  }
  
  // 尝试视图模式
  match = url.match(URL_PATTERNS.DATA_SERVICES_VIEW);
  if (match) {
    const [, , , project, cluster, namespace] = match;
    return {
      type: URL_TYPE.DATA_SERVICES,
      baseUrl: extractBaseUrl(url),
      project,
      cluster,
      namespace,
      originalUrl: url
    };
  }
  
  return null;
}

/**
 * 完整的URL分类和解析
 */
export function classifyAndParseUrl(url: string): UrlClassificationResult {
  try {
    const urlType = classifyUrlType(url);
    
    let urlInfo: UrlInfo | null = null;
    
    switch (urlType) {
      case URL_TYPE.ACP:
        urlInfo = parseAcpUrl(url);
        break;
      case URL_TYPE.DATA_SERVICES:
        urlInfo = parseDataServicesUrl(url);
        break;
      case URL_TYPE.UNKNOWN:
        return {
          success: false,
          error: '不支持的页面类型'
        };
    }
    
    if (!urlInfo) {
      return {
        success: false,
        error: `无法解析${urlType}类型的URL格式`
      };
    }
    
    return {
      success: true,
      urlInfo
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'URL解析失败'
    };
  }
}

/**
 * 检查URL是否支持平台功能
 */
export function isSupportedPlatformUrl(url: string): boolean {
  if (!url) return false;
  
  try {
    const urlObj = new URL(url);
    
    // 排除本地和文件URL
    if (urlObj.hostname === 'localhost' || 
        urlObj.hostname.startsWith('127.') || 
        urlObj.protocol === 'file:') {
      return false;
    }
    
    // 检查是否包含支持的平台标识
    return Object.values(URL_FLAGS).some(flag => url.includes(flag));
  } catch (error) {
    return false;
  }
} 