export function triggerTextDownload(content, fileName, mimeType = "text/plain;charset=utf-8") {
  const blob = new Blob([String(content || "")], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function copyTextToClipboard(text) {
  const payload = String(text || "");
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(payload);
    return true;
  }
  const area = document.createElement("textarea");
  area.value = payload;
  area.setAttribute("readonly", "true");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.focus();
  area.select();
  const copied = document.execCommand("copy");
  area.remove();
  return Boolean(copied);
}
