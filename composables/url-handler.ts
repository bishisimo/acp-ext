import { URL_TYPE, classifyAndParseUrl, type UrlInfo } from './url-classifier';

export interface GenerateUrlResult {
  success: boolean;
  url?: string;
  error?: string;
}

export function generateNewUrl(
  currentUrl: string,
  selectedCluster: string,
  selectedNamespace: string,
): GenerateUrlResult {
  // 使用新的分类器解析URL
  const classificationResult = classifyAndParseUrl(currentUrl);
  
  if (!classificationResult.success || !classificationResult.urlInfo) {
    return {
      success: false,
      error: classificationResult.error || '无法识别URL格式',
    };
  }
  
  const urlInfo = classificationResult.urlInfo;
  
  switch (urlInfo.type) {
    case URL_TYPE.ACP:
      return handleAcpUrl(urlInfo, selectedCluster, selectedNamespace);
    case URL_TYPE.DATA_SERVICES:
      return handleDataServicesUrl(urlInfo, selectedCluster, selectedNamespace);
    default:
      return {
        success: false,
        error: '不支持的页面类型',
      };
  }
}

function handleAcpUrl(
  urlInfo: UrlInfo,
  selectedCluster: string,
  selectedNamespace: string,
): GenerateUrlResult {
  if (!selectedCluster && !selectedNamespace) {
    return {
      success: false,
      error: '未选择任何更改，将留在当前页面',
    };
  }

  // 构建新的URL
  const newCluster = selectedCluster || urlInfo.cluster || '';
  const newNamespace = selectedNamespace || urlInfo.namespace || '';
  const project = urlInfo.project || '';

  // 构建ACP格式的URL
  const newPath = `/console-acp/workspace/${project}~${newCluster}~${newNamespace}/`;
  const currentUrl = urlInfo.originalUrl;
  
  // 替换路径部分
  const newUrl = currentUrl.replace(
    /\/console-acp\/workspace\/.*?\//,
    newPath
  );

  return {
    success: true,
    url: newUrl,
  };
}

function handleDataServicesUrl(
  urlInfo: UrlInfo,
  selectedCluster: string,
  selectedNamespace: string,
): GenerateUrlResult {
  if (!selectedCluster && !selectedNamespace) {
    return {
      success: false,
      error: '未选择任何更改，将留在当前页面',
    };
  }

  const newCluster = selectedCluster || urlInfo.cluster || '';
  const newNamespace = selectedNamespace || urlInfo.namespace || '';
  const project = urlInfo.project || '';
  const currentUrl = urlInfo.originalUrl;

  // 检查是否是参数模式的URL
  if (currentUrl.includes('?workspace=')) {
    const baseUrl = currentUrl.substring(0, currentUrl.indexOf('?'));
    const queryStart = currentUrl.indexOf('?');
    const queryString = currentUrl.substring(queryStart);
    
    const newWorkspaceParam = `workspace=${project}~${newCluster}~${newNamespace}`;
    const newQueryString = queryString.replace(
      /workspace=[^&]*/,
      newWorkspaceParam
    );
    
    return {
      success: true,
      url: baseUrl + newQueryString,
    };
  }
  
  // 检查是否是视图模式的URL
  if (currentUrl.includes('/view/')) {
    const newUrl = currentUrl.replace(
      /\/view\/.*?~.*?~.*?~(.*)/,
      `/view/${project}~${newCluster}~${newNamespace}~$1`
    );
    
    return {
      success: true,
      url: newUrl,
    };
  }

  return {
    success: false,
    error: '无法识别的DataServices URL格式',
  };
} 