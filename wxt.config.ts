import { defineConfig } from 'wxt';
import { resolve } from 'node:path';

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: 'ACP 扩展',
    description: 'ACP 扩展工具, 提升非功能性的使用体验',
    version: '0.0.1',
    icons: {
      '16': '/icon/32.png',
      '32': '/icon/32.png',
      '48': '/icon/48.png',
      '96': '/icon/128.png',
      '128': '/icon/128.png',
    },
    permissions: ['tabs', 'storage', 'activeTab', 'contextMenus','scripting'],
    commands: {
      'open-kubectl': {
        description: '打开 kubectl 页面',
      },
    },
  },
  alias: {
    '@': resolve(__dirname, '.'),
  },
  modules: ['@wxt-dev/module-vue'],
});