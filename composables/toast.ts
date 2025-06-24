export type ToastType = 'info' | 'success' | 'error' | 'warning';

export function createToast(message: string, type: ToastType = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('show');
  }, 10);

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      document.body.removeChild(toast);
    }, 300);
  }, 2000);
}

const toastStyles = `
.toast {
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%) translateY(-100%);
    background-color: #333;
    color: white;
    padding: 8px 16px;
    border-radius: 4px;
    font-size: 14px;
    opacity: 0;
    transition: all 0.3s ease;
    z-index: 1000;
    white-space: nowrap;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}
.toast.show {
    transform: translateX(-50%) translateY(0);
    opacity: 1;
}
.toast.success {
    background-color: #4caf50;
}
.toast.error {
    background-color: #f44336;
}
.toast.info {
    background-color: #336dab;
}
.toast.warning {
    background-color: #ff9800;
}
`;

export function injectToastStyles() {
  if (document.getElementById('acp-toast-style')) return;
  const styleSheet = document.createElement('style');
  styleSheet.id = 'acp-toast-style';
  styleSheet.textContent = toastStyles;
  document.head.appendChild(styleSheet);
} 