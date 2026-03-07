const fileTreeEl = document.getElementById('fileTree');
const editorWrapEl = document.getElementById('editorWrap');
const lineNumbersEl = document.getElementById('lineNumbers');
const editorEl = document.getElementById('editor');
const editBtn = document.getElementById('editBtn');
const closeEditorBtn = document.getElementById('closeEditorBtn');
const saveBtn = document.getElementById('saveBtn');
const saveMessageEl = document.getElementById('saveMessage');
const currentFileEl = document.getElementById('currentFile');
const currentFileMetaEl = document.getElementById('currentFileMeta');
const rootPathEl = document.getElementById('rootPath');
const toggleTreeBtn = document.getElementById('toggleTreeBtn');
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

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? '#c12525' : '#63708a';
}

function setSaveMessage(message, type = '') {
  saveMessageEl.textContent = message;
  saveMessageEl.className = type;
}

function updateLineNumbers() {
  const lines = editorEl.value.split('\n').length;
  let text = '';
  for (let i = 1; i <= lines; i += 1) {
    text += i + '\n';
  }
  lineNumbersEl.textContent = text || '1\n';
}

function syncLineNumberScroll() {
  lineNumbersEl.scrollTop = editorEl.scrollTop;
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
  rootPathEl.textContent = `Root: ${data.root} / Current: ${data.path || '/'}`;
  fileTreeEl.innerHTML = '';
  data.items.forEach((item) => {
    fileTreeEl.appendChild(buildNode(item, data.path));
  });
}

async function loadRoot() {
  try {
    const rootData = await fetchTree('');
    if (rootData.startPath) {
      try {
        const startData = await fetchTree(rootData.startPath);
        renderTree(startData);
      } catch {
        renderTree(rootData);
      }
    } else {
      renderTree(rootData);
    }
    setStatus('파일 트리를 불러왔습니다.');
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

loadRoot();
showInfoPanel();
clearPreview();
updateLineNumbers();
syncLineNumberScroll();
updateStatusMeta();
currentFileMetaEl.textContent = '';

toggleTreeBtn.addEventListener('click', () => {
  document.body.classList.toggle('tree-collapsed');
  updateTreeToggleLabel();
});

if (window.matchMedia('(max-width: 900px)').matches) {
  document.body.classList.add('tree-collapsed');
}
updateTreeToggleLabel();


if (window.matchMedia('(pointer: coarse)').matches) {
  document.body.classList.add('touch-device');
}

