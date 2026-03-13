export function activeElementWithin(node) {
  const active = document.activeElement;
  return node instanceof HTMLElement && active instanceof HTMLElement && node.contains(active);
}

export function setSubtreeInert(node, inactive) {
  if (!(node instanceof HTMLElement)) {
    return;
  }
  if (inactive) {
    node.setAttribute("inert", "");
  } else {
    node.removeAttribute("inert");
  }
}

export function focusElement(node, options = {}) {
  if (!(node instanceof HTMLElement)) {
    return false;
  }
  if (!node.hasAttribute("tabindex") && !["BUTTON", "INPUT", "SELECT", "TEXTAREA", "SUMMARY", "A"].includes(node.tagName)) {
    node.setAttribute("tabindex", "-1");
  }
  window.requestAnimationFrame(() => {
    node.focus({ preventScroll: options.scroll === false });
  });
  return true;
}
