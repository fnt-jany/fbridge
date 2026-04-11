const fileTreeEl = document.getElementById('fileTree');
const mainEl = document.querySelector('main');
const treePaneEl = document.getElementById('treePane');
const splitHandleEl = document.getElementById('splitHandle');
const editorWrapEl = document.getElementById('editorWrap');
const lineNumbersEl = document.getElementById('lineNumbers');
const lineNumbersInnerEl = document.getElementById('lineNumbersInner');
const editorEl = document.getElementById('editor');
const editBtn = document.getElementById('editBtn');
const closeEditorBtn = document.getElementById('closeEditorBtn');
const saveBtn = document.getElementById('saveBtn');
const downloadBtn = document.getElementById('downloadBtn');
const deleteBtn = document.getElementById('deleteBtn');
const saveMessageEl = document.getElementById('saveMessage');
const currentFileEl = document.getElementById('currentFile');
const currentFileMetaEl = document.getElementById('currentFileMeta');
const rootPathEl = document.getElementById('rootPath');
const toggleTreeBtn = document.getElementById('toggleTreeBtn');
const logoutBtn = document.getElementById('logoutBtn');
const treeCurrentPathEl = document.getElementById('treeCurrentPath');
const parentFolderBtn = document.getElementById('parentFolderBtn');
const openPathBtn = document.getElementById('openPathBtn');
const statusEl = document.getElementById('status');
const statusMetaEl = document.getElementById('statusMeta');
const infoPanelEl = document.getElementById('infoPanel');
const infoPathEl = document.getElementById('infoPath');
const infoTypeEl = document.getElementById('infoType');
const infoMimeEl = document.getElementById('infoMime');
const infoSizeEl = document.getElementById('infoSize');
const infoEditableEl = document.getElementById('infoEditable');
const previewImageEl = document.getElementById('previewImage');
const previewVideoEl = document.getElementById('previewVideo');
const previewTextEl = document.getElementById('previewText');

let currentFilePath = null;
let currentFileEditable = false;
let activeNode = null;
let lineNumberSyncFrame = null;
let lastLineNumberScrollTop = -1;
let currentTreePath = '';
let startTreePath = '';
let treePaneWidth = 320;
let isResizingTreePane = false;

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? '#c12525' : '#63708a';
}

function setSaveMessage(message, type = '') {
  saveMessageEl.textContent = message;
  saveMessageEl.className = type;
}

function getDownloadFileName(contentDisposition) {
  const match = String(contentDisposition || '').match(/filename="?([^";]+)"?/i);
  if (!match) return currentFilePath.split('/').pop() || 'download';

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

async function downloadCurrentFile() {
  if (!currentFilePath) return;

  const res = await fetch(`/api/download?path=${encodeURIComponent(currentFilePath)}`);
  if (!res.ok) {
    let message = 'Download failed';
    try {
      const data = await res.json();
      message = data.error || message;
    } catch {}
    throw new Error(message);
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = getDownloadFileName(res.headers.get('content-disposition'));
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function updateLineNumbers() {
  const lines = editorEl.value.split('\n').length;
  let text = '';
  for (let i = 1; i <= lines; i += 1) {
    text += i + '\n';
  }
  lineNumbersInnerEl.textContent = text || '1\n';
}

function syncLineNumberScroll() {
  const scrollTop = editorEl.scrollTop;
  if (scrollTop === lastLineNumberScrollTop) return;
  lastLineNumberScrollTop = scrollTop;
  lineNumbersInnerEl.style.transform = 'translateY(-' + scrollTop + 'px)';
}

function startLineNumberSyncLoop() {
  if (lineNumberSyncFrame !== null) return;

  const tick = () => {
    if (editorWrapEl.style.display !== 'flex') {
      lineNumberSyncFrame = null;
      lastLineNumberScrollTop = -1;
      return;
    }

    syncLineNumberScroll();
    lineNumberSyncFrame = requestAnimationFrame(tick);
  };

  lineNumberSyncFrame = requestAnimationFrame(tick);
}

function stopLineNumberSyncLoop() {
  if (lineNumberSyncFrame !== null) {
    cancelAnimationFrame(lineNumberSyncFrame);
    lineNumberSyncFrame = null;
  }
  lastLineNumberScrollTop = -1;
}

function updateStatusMeta() {
  let mode = 'Preview';
  if (editorWrapEl.style.display === 'flex') {
    mode = editorEl.readOnly ? 'Read' : 'Edit';
  }

  let line = 1;
  let col = 1;
  if (!editorEl.disabled) {
    const pos = editorEl.selectionStart || 0;
    const before = editorEl.value.slice(0, pos);
    line = before.split('\n').length;
    const lastNl = before.lastIndexOf('\n');
    col = pos - (lastNl + 1) + 1;
  }

  statusMetaEl.textContent = `${mode} | Ln ${line}, Col ${col}`;
}


function updateTreeToggleLabel() {
  const collapsed = document.body.classList.contains('tree-collapsed');
  toggleTreeBtn.textContent = collapsed ? '폴더 보이기' : '폴더 숨기기';
}

function normalizeTreePath(value = '') {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function getParentTreePath(value = '') {
  const normalized = normalizeTreePath(value);
  if (!normalized) return '';
  const parts = normalized.split('/');
  parts.pop();
  return parts.join('/');
}

function updateTreePathControls() {
  treeCurrentPathEl.textContent = currentTreePath || '/';
  parentFolderBtn.disabled = !currentTreePath;
}

function setTreePaneWidth(nextWidth) {
  treePaneWidth = nextWidth;
  treePaneEl.style.width = `${nextWidth}px`;
  treePaneEl.style.flexBasis = `${nextWidth}px`;
}

function resizeTreePane(pointerClientX) {
  const mainRect = mainEl.getBoundingClientRect();
  const minWidth = 180;
  const maxWidth = Math.max(minWidth, mainRect.width - 320);
  const nextWidth = Math.min(Math.max(pointerClientX - mainRect.left, minWidth), maxWidth);
  setTreePaneWidth(nextWidth);
}

function handleSplitPointerMove(event) {
  if (!isResizingTreePane) return;
  resizeTreePane(event.clientX);
}

function stopTreePaneResize() {
  if (!isResizingTreePane) return;
  isResizingTreePane = false;
  document.body.classList.remove('is-resizing');
}

function formatBytes(size) {
  if (size < 1024) return `${size} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = size / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function showInfoPanel() {
  stopLineNumberSyncLoop();
  infoPanelEl.style.display = 'flex';
  editorWrapEl.style.display = 'none';
  editorEl.disabled = true;
  saveBtn.disabled = true;
  closeEditorBtn.hidden = true;
  updateStatusMeta();
}

function showEditor(readOnlyMode = true) {
  infoPanelEl.style.display = 'none';
  editorWrapEl.style.display = 'flex';
  editorEl.disabled = false;
  editorEl.readOnly = readOnlyMode;
  saveBtn.disabled = readOnlyMode;
  closeEditorBtn.hidden = readOnlyMode;
  startLineNumberSyncLoop();
  updateStatusMeta();
}

function clearPreview() {
  previewImageEl.hidden = true;
  previewImageEl.removeAttribute('src');
  previewVideoEl.hidden = true;
  previewVideoEl.pause();
  previewVideoEl.removeAttribute('src');
  previewVideoEl.load();
  previewTextEl.hidden = false;
}

function renderPreview(path, mimeType) {
  clearPreview();
  const src = `/api/raw?path=${encodeURIComponent(path)}`;

  if (mimeType.startsWith('image/')) {
    previewImageEl.src = src;
    previewImageEl.hidden = false;
    previewTextEl.hidden = true;
    return;
  }

  if (mimeType.startsWith('video/')) {
    previewVideoEl.src = src;
    previewVideoEl.hidden = false;
    previewTextEl.hidden = true;
    return;
  }
}

async function fetchTree(path = '') {
  const res = await fetch(`/api/tree?path=${encodeURIComponent(path)}`);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || '트리 로드 실패');
  }
  return res.json();
}

async function fetchFileInfo(path) {
  const res = await fetch(`/api/file-info?path=${encodeURIComponent(path)}`);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || '파일 정보 로드 실패');
  }
  return res.json();
}

async function fetchFile(path) {
  const res = await fetch(`/api/file?path=${encodeURIComponent(path)}`);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || '파일 로드 실패');
  }
  return res.json();
}

async function deleteCurrentFileRequest(path) {
  const res = await fetch(`/api/file?path=${encodeURIComponent(path)}`, {
    method: 'DELETE',
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || '?? ?? ??');
  }

  return res.json();
}

async function saveFile(path, content) {
  const res = await fetch('/api/file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, content }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || '파일 저장 실패');
  }

  return res.json();
}

async function logout() {
  const res = await fetch('/logout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    throw new Error('로그아웃 실패');
  }
}

function buildNode(item, basePath) {
  const fullPath = basePath ? `${basePath}/${item.name}` : item.name;
  const wrapper = document.createElement('div');
  const label = document.createElement('div');
  label.className = 'node';
  label.textContent = item.type === 'directory' ? `📁 ${item.name}` : `📄 ${item.name}`;
  wrapper.appendChild(label);

  if (item.type === 'file') {
    label.addEventListener('click', async () => {
      try {
        const data = await fetchFileInfo(fullPath);
        currentFilePath = fullPath;
        currentFileEditable = data.editable;

        currentFileEl.textContent = fullPath;
        currentFileMetaEl.textContent = `${data.extension} | ${formatBytes(data.size)}`;
        infoPathEl.textContent = data.path;
        infoTypeEl.textContent = data.extension;
        infoMimeEl.textContent = data.mimeType;
        infoSizeEl.textContent = formatBytes(data.size);
        infoEditableEl.textContent = data.editable ? '예' : '아니오';

        editBtn.hidden = !data.editable;
        editBtn.disabled = !data.editable;
        downloadBtn.hidden = false;
        downloadBtn.disabled = false;
        deleteBtn.hidden = false;
        deleteBtn.disabled = false;
        setSaveMessage('');

        if (data.editable) {
          const file = await fetchFile(fullPath);
          editorEl.value = file.content;
          updateLineNumbers();
          syncLineNumberScroll();
          showEditor(true);
          setSaveMessage('보기 모드');
          setStatus('내용을 표시했습니다. 편집 버튼을 누르면 수정할 수 있습니다.');
        } else {
          editorEl.value = '';
          updateLineNumbers();
          syncLineNumberScroll();
          renderPreview(fullPath, data.mimeType);
          showInfoPanel();
          setStatus('파일 미리보기를 표시했습니다.');
        }

        if (activeNode) activeNode.classList.remove('active');
        activeNode = label;
        activeNode.classList.add('active');
      } catch (err) {
        setStatus(err.message, true);
      }
    });
  } else {
    const childrenEl = document.createElement('div');
    childrenEl.className = 'children';
    childrenEl.hidden = true;
    wrapper.appendChild(childrenEl);

    let loaded = false;
    label.addEventListener('click', async () => {
      if (!loaded) {
        try {
          const data = await fetchTree(fullPath);
          data.items.forEach((child) => {
            childrenEl.appendChild(buildNode(child, fullPath));
          });
          loaded = true;
        } catch (err) {
          setStatus(err.message, true);
          return;
        }
      }
      childrenEl.hidden = !childrenEl.hidden;
    });
  }

  return wrapper;
}

function renderTree(data) {
  currentTreePath = normalizeTreePath(data.path);
  startTreePath = normalizeTreePath(data.startPath || '');
  rootPathEl.textContent = `Root: ${data.root} / Current: ${data.path || '/'}`;
  updateTreePathControls();
  fileTreeEl.innerHTML = '';
  data.items.forEach((item) => {
    fileTreeEl.appendChild(buildNode(item, data.path));
  });
}

async function loadTree(path = '') {
  const data = await fetchTree(normalizeTreePath(path));
  renderTree(data);
}

async function loadRoot() {
  try {
    const rootData = await fetchTree('');
    const initialPath = normalizeTreePath(rootData.startPath || '');

    if (initialPath) {
      try {
        await loadTree(initialPath);
      } catch {
        renderTree(rootData);
      }
    } else {
      renderTree(rootData);
    }
    setStatus('\uD30C\uC77C \uD2B8\uB9AC\uB97C \uBD88\uB7EC\uC654\uC2B5\uB2C8\uB2E4.');
  } catch (err) {
    setStatus(err.message, true);
  }
}

editBtn.addEventListener('click', () => {
  if (!currentFilePath || !currentFileEditable) return;
  showEditor(false);
  setSaveMessage('편집 모드', 'success');
  setStatus('편집 모드로 전환했습니다.');
});

closeEditorBtn.addEventListener('click', () => {
  if (!currentFileEditable) return;
  showEditor(true);
  setSaveMessage('보기 모드');
  setStatus('보기 모드로 전환했습니다.');
});

downloadBtn.addEventListener('click', async () => {
  if (!currentFilePath) return;

  try {
    await downloadCurrentFile();
    setStatus('Download started.');
  } catch (err) {
    setStatus(err.message, true);
  }
});

deleteBtn.addEventListener('click', async () => {
  if (!currentFilePath) return;
  if (!window.confirm(`?? ??????\n${currentFilePath}`)) return;

  deleteBtn.disabled = true;

  try {
    await deleteCurrentFileRequest(currentFilePath);
    currentFilePath = null;
    currentFileEditable = false;
    currentFileEl.textContent = '??? ?? ??';
    currentFileMetaEl.textContent = '';
    editBtn.hidden = true;
    closeEditorBtn.hidden = true;
    saveBtn.disabled = true;
    downloadBtn.hidden = true;
    deleteBtn.hidden = true;
    editorEl.value = '';
    updateLineNumbers();
    clearPreview();
    showInfoPanel();
    infoPathEl.textContent = '-';
    infoTypeEl.textContent = '-';
    infoMimeEl.textContent = '-';
    infoSizeEl.textContent = '-';
    infoEditableEl.textContent = '-';
    if (activeNode) {
      activeNode.classList.remove('active');
      activeNode = null;
    }
    await loadTree(currentTreePath);
    setStatus('??? ??????.');
  } catch (err) {
    deleteBtn.disabled = false;
    setStatus(err.message, true);
  }
});

saveBtn.addEventListener('click', async () => {
  if (!currentFilePath || !currentFileEditable) return;

  saveBtn.disabled = true;
  setSaveMessage('저장 중...');

  try {
    await saveFile(currentFilePath, editorEl.value);
    setStatus('저장 완료');
    setSaveMessage('저장됨', 'success');
  } catch (err) {
    setStatus(err.message, true);
    setSaveMessage('저장 실패', 'error');
  } finally {
    if (!editorEl.readOnly) {
      saveBtn.disabled = false;
    }
  }
});

editorEl.addEventListener('input', () => {
  updateLineNumbers();
  syncLineNumberScroll();
  updateStatusMeta();
});

editorEl.addEventListener('scroll', syncLineNumberScroll);
editorEl.addEventListener('click', updateStatusMeta);
editorEl.addEventListener('keyup', updateStatusMeta);
lineNumbersEl.addEventListener('wheel', (event) => {
  event.preventDefault();
  editorEl.scrollTop += event.deltaY;
  syncLineNumberScroll();
}, { passive: false });


loadRoot();
showInfoPanel();
clearPreview();
updateLineNumbers();
syncLineNumberScroll();
updateStatusMeta();
currentFileMetaEl.textContent = '';

toggleTreeBtn.addEventListener('click', () => {
  document.body.classList.toggle('tree-collapsed');

  if (document.body.classList.contains('tree-collapsed')) {
    treePaneEl.style.width = '0px';
    treePaneEl.style.flexBasis = '0px';
  } else {
    setTreePaneWidth(treePaneWidth);
  }

  updateTreeToggleLabel();
});

logoutBtn.addEventListener('click', async () => {
  logoutBtn.disabled = true;
  setStatus('\uB85C\uADF8\uC544\uC6C3 \uC911...');

  try {
    await logout();
    window.location.href = '/login';
  } catch (err) {
    logoutBtn.disabled = false;
    setStatus(err.message, true);
  }
});

parentFolderBtn.addEventListener('click', async () => {
  if (!currentTreePath) return;

  try {
    await loadTree(getParentTreePath(currentTreePath));
    setStatus('\uC0C1\uC704 \uD3F4\uB354\uB85C \uC774\uB3D9\uD588\uC2B5\uB2C8\uB2E4.');
  } catch (err) {
    setStatus(err.message, true);
  }
});

openPathBtn.addEventListener('click', async () => {
  const nextPath = window.prompt('\uC5F4 \uD3F4\uB354 \uACBD\uB85C\uB97C \uC785\uB825\uD558\uC138\uC694.', currentTreePath || startTreePath || '');
  if (nextPath === null) return;

  try {
    await loadTree(nextPath);
    setStatus('\uACBD\uB85C\uB97C \uC5F4\uC5C8\uC2B5\uB2C8\uB2E4.');
  } catch (err) {
    setStatus(err.message, true);
  }
});

splitHandleEl.addEventListener('pointerdown', (event) => {
  if (document.body.classList.contains('tree-collapsed')) return;

  isResizingTreePane = true;
  document.body.classList.add('is-resizing');
  splitHandleEl.setPointerCapture(event.pointerId);
  resizeTreePane(event.clientX);
});

window.addEventListener('pointermove', handleSplitPointerMove);
window.addEventListener('pointerup', stopTreePaneResize);
window.addEventListener('pointercancel', stopTreePaneResize);

if (window.matchMedia('(max-width: 900px)').matches) {
  document.body.classList.add('tree-collapsed');
} else {
  setTreePaneWidth(treePaneWidth);
}
updateTreeToggleLabel();
updateTreePathControls();


if (window.matchMedia('(pointer: coarse)').matches) {
  document.body.classList.add('touch-device');
}





