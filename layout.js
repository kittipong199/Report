/* CONNECTS: Controls movable/resizable widgets and the Edit Layout toolbar in index.html. */
(() => {
  'use strict';

  // V2 replaces fragile index-only widget keys. Older saved layouts could move
  // a card into another report after cards were added or removed.
  const STORAGE_KEY = 'aveva-v17-layout-v2';
  const editButton = document.getElementById('edit');
  const resetButton = document.getElementById('resetLayout');
  const modeLabel = document.getElementById('mode');
  const widgets = () => [...document.querySelectorAll('#dashboard .widget')];
  const initialLayout = widgets().map((widget, index) => ({
    widget,
    parent: widget.parentElement,
    index
  }));
  let editing = false;
  let draggedWidget = null;
  let resizeState = null;

  const assignKeysAndHandles = () => {
    widgets().forEach((widget, index) => {
      const group = widget.parentElement.dataset.group || 'ungrouped';
      const label = widget.id || widget.querySelector('h2,h3')?.textContent || `widget-${index}`;
      const stableLabel = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      widget.dataset.layoutKey ||= `${group}:${stableLabel}`;
      if (!widget.querySelector('.resize-handle')) {
        const handle = document.createElement('i');
        handle.className = 'resize-handle';
        handle.setAttribute('aria-hidden', 'true');
        widget.append(handle);
      }
    });
  };

  const saveLayout = () => {
    const layout = widgets().map((widget) => ({
      key: widget.dataset.layoutKey,
      group: widget.parentElement.dataset.group,
      width: widget.style.width,
      height: widget.style.height,
      flexBasis: widget.style.flexBasis,
      gridColumn: widget.style.gridColumn
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  };

  const restoreLayout = () => {
    let saved;
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }

    const byKey = new Map(widgets().map((widget) => [widget.dataset.layoutKey, widget]));
    saved.forEach((item) => {
      const widget = byKey.get(item.key);
      const parent = document.querySelector(`[data-group="${item.group}"]`);
      if (!widget || !parent) return;
      widget.style.width = item.width || '';
      widget.style.height = item.height || '';
      widget.style.flexBasis = item.flexBasis || '';
      widget.style.gridColumn = item.gridColumn || '';
      parent.append(widget);
    });
  };

  const setEditMode = (enabled) => {
    editing = enabled;
    document.body.classList.toggle('edit-mode', enabled);
    widgets().forEach((widget) => { widget.draggable = enabled; });
    modeLabel.textContent = enabled ? 'EDIT LAYOUT' : 'VIEW';
    editButton.textContent = enabled ? 'Switch to View' : 'Switch to Edit Layout';
    if (!enabled) saveLayout();
  };

  document.addEventListener('dragstart', (event) => {
    if (!editing || event.target.closest('.resize-handle')) return;
    draggedWidget = event.target.closest('#dashboard .widget');
    draggedWidget?.classList.add('dragging');
  });

  document.addEventListener('dragover', (event) => {
    if (!editing || !draggedWidget) return;
    const target = event.target.closest('#dashboard .widget');
    if (!target || target === draggedWidget || target.parentElement !== draggedWidget.parentElement) return;
    event.preventDefault();
    const box = target.getBoundingClientRect();
    const insertAfter = event.clientX > box.left + box.width / 2;
    target.parentElement.insertBefore(draggedWidget, insertAfter ? target.nextSibling : target);
  });

  document.addEventListener('dragend', () => {
    draggedWidget?.classList.remove('dragging');
    draggedWidget = null;
    saveLayout();
  });

  document.addEventListener('pointerdown', (event) => {
    if (!editing || !event.target.matches('.resize-handle')) return;
    event.preventDefault();
    const widget = event.target.parentElement;
    const box = widget.getBoundingClientRect();
    widget.draggable = false;
    resizeState = { widget, x: event.clientX, y: event.clientY, width: box.width, height: box.height };
  });

  document.addEventListener('pointermove', (event) => {
    if (!resizeState) return;
    const width = Math.max(190, resizeState.width + event.clientX - resizeState.x);
    const height = Math.max(90, resizeState.height + event.clientY - resizeState.y);
    resizeState.widget.style.width = `${width}px`;
    resizeState.widget.style.height = `${height}px`;
    resizeState.widget.style.flexBasis = `${width}px`;
    resizeState.widget.style.gridColumn = 'auto';
  });

  document.addEventListener('pointerup', () => {
    if (!resizeState) return;
    resizeState.widget.draggable = editing;
    resizeState = null;
    saveLayout();
    window.dispatchEvent(new Event('resize'));
  });

  editButton.onclick = () => setEditMode(!editing);
  resetButton.onclick = () => {
    localStorage.removeItem(STORAGE_KEY);
    initialLayout.forEach(({ widget, parent }) => {
      widget.removeAttribute('style');
      parent.append(widget);
    });
    setEditMode(false);
    window.dispatchEvent(new Event('resize'));
  };

  assignKeysAndHandles();
  restoreLayout();
  setEditMode(false);
})();

