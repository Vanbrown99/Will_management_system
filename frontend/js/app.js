/**
 * app.js — Core utilities only
 * All wallet/ethereum code removed
 */

const CONFIG = {
  API_BASE: 'http://localhost:5000/api',
};

// Toast notifications
function showToast(message, type = 'info', duration = 4000) {
  const toast   = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMessage');
  if (!toast || !toastMsg) return;

  const colors = {
    info:    'var(--color-primary)',
    success: 'var(--color-success)',
    warning: 'var(--color-warning)',
    error:   'var(--color-error)',
  };

  toastMsg.textContent   = message;
  toast.style.borderColor = colors[type] || 'var(--color-border)';
  toast.classList.remove('hidden');

  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => toast.classList.add('hidden'), duration);
}

function formatDate(dateString) {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(dateString));
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text)
    .then(() => showToast('Copied!', 'success', 2000))
    .catch(() => showToast('Copy failed', 'error'));
}

window.showToast = showToast;
window.CONFIG    = CONFIG;
window.formatDate = formatDate;
window.copyToClipboard = copyToClipboard;
