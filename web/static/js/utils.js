export function cleanMarkdownText(text) {
  return text.replace(/\*\*/g, "").replace(/\*/g, "");
}

export function scrollToBottom() {
  const log = document.getElementById("console-log");
  log.scrollTop = log.scrollHeight;
}

export function escapeHtml(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}