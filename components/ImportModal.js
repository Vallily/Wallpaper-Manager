const React = require('react');
const { ipcRenderer } = require('electron');
const { TagEditor } = require('./TagEditor.js'); // 引入新的 TagEditor

const ImportModal = ({ onClose, onImportSuccess }) => {
  const [step, setStep] = React.useState(1);
  const [sourcePath, setSourcePath] = React.useState('');
  const [scanData, setScanData] = React.useState(null);
  const [isDragging, setIsDragging] = React.useState(false); // 新增：拖拽状态
  // 修改 formData.tags 的初始值为空数组
  const [formData, setFormData] = React.useState({
    title: '',
    type: 'scene',
    rating: 'everyone',
    tags: [], // 现在是数组
    notes: '',
    description: '',
    preview: ''
  });
  const [scanInfo, setScanInfo] = React.useState({
    size: '',
    files: '',
    id: '' // Removed types, added id
  });
  const [previewUrl, setPreviewUrl] = React.useState('assets/俺的图图呢.webp');
  const [statusText, setStatusText] = React.useState('');
  const [settings, setSettings] = React.useState(null); // 添加 settings state

  // 在组件加载时获取设置
  React.useEffect(() => {
    ipcRenderer.invoke('get-settings').then(loadedSettings => {
      setSettings(loadedSettings);
    });
  }, []);

  // --- Utility Functions ---
  const formatBytes = (bytes, decimals = 2) => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  // --- Event Handlers ---
  const processSelectedPath = async (selectedPath) => {
    if (!selectedPath) return;
    
    setSourcePath(selectedPath);
    setStatusText('正在扫描文件夹...');
    // 可以在这里临时进入一个加载状态，如果扫描时间长的话
    const scanResult = await ipcRenderer.invoke('handle-scan-import-folder', selectedPath);

    if (!scanResult.success) {
      alert(`扫描失败: ${scanResult.error}`);
      resetState();
      return;
    }

    const data = scanResult.data;
    setScanData(data);

    const { projectData, size, fileCount, typeCounts } = data;
    const folderName = selectedPath.split(/\\|\//).pop();
    let determinedType = 'scene';
    if (projectData?.type) {
      determinedType = projectData.type.toLowerCase();
    } else {
      if (typeCounts.mp4 > 0) determinedType = 'video';
      else if (typeCounts.pkg > 0) determinedType = 'scene';
      else if (typeCounts.exe > 0) determinedType = 'application';
      else if (typeCounts.html > 0) determinedType = 'web';
    }

    const previewFileName = projectData?.preview || '';
    setFormData({
      title: projectData?.title || folderName,
      type: determinedType,
      rating: projectData?.contentrating?.toLowerCase() || 'everyone',
      tags: [], // 初始化为空数组
      notes: '',
      description: projectData?.description || '',
      preview: previewFileName,
    });
    
    if (previewFileName) {
        // 关键修复：在拼接前，将所有路径部分的 `\` 替换为 `/`，确保URL格式正确
        const safePath = selectedPath.replace(/\\/g, '/');
        const safeFileName = previewFileName.replace(/\\/g, '/');
        setPreviewUrl(`file://${safePath}/${safeFileName}`);
    } else {
        setPreviewUrl('assets/俺的图图呢.webp');
    }

    setScanInfo({
      size: `总大小: ${formatBytes(size)}`,
      files: `文件总数: ${fileCount}`,
      id: `预分配ID: ${data.id}` // Use the new ID from scanData
    });

    setStep(2);
  };

  const handleSelectFolder = async () => {
    const result = await ipcRenderer.invoke('handle-open-import-dialog');
    if (result.success) {
      processSelectedPath(result.path);
    }
  };

  // --- Drag and Drop Handlers ---
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      // 在Electron中，我们可以直接访问路径
      const droppedPath = files[0].path;
      // 简单检查是否是文件夹（注意：这依赖于 OS 如何报告它）
      // 更可靠的方式是让主进程检查
      ipcRenderer.invoke('is-directory', droppedPath).then(isDir => {
          if(isDir) {
              processSelectedPath(droppedPath);
          } else {
              alert('请拖入一个文件夹，而不是文件。');
          }
      });
    }
  };


  const handleConfirmImport = async (e) => {
    e.preventDefault();
    setStatusText('正在移动文件并更新数据库...');
    setStep(3);

    // formData.tags 已经是正确的数组格式，无需处理
    const processedMetadata = {
      ...formData,
      id: scanData?.id, // 关键修复：将扫描时生成的ID传递给后端
      file: scanData?.projectData?.file || null,
    };

    const importData = {
      sourcePath: sourcePath,
      metadata: processedMetadata,
      projectData: scanData?.projectData,
    };

    const result = await ipcRenderer.invoke('handle-process-import', importData);

    if (result.success) {
      alert(`导入成功！\n新壁纸 ID: ${result.wallpaperId}`);
      onImportSuccess();
      onClose();
    } else {
      alert(`导入失败: ${result.error}`);
      setStep(2);
    }
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // 新的 handler 用于处理 TagEditor 的变更
  const handleTagsChange = (newTags) => {
    setFormData(prev => ({...prev, tags: newTags}));
  };
  
  const handlePreviewInputChange = (e) => {
    const newFileName = e.target.value;
    setFormData(prev => ({ ...prev, preview: newFileName }));
    if (newFileName.trim() && sourcePath) {
        // 关键修复：同样在这里确保URL格式正确
        const safePath = sourcePath.replace(/\\/g, '/');
        const safeFileName = newFileName.replace(/\\/g, '/');
        setPreviewUrl(`file://${safePath}/${safeFileName}`);
    } else {
        setPreviewUrl('assets/俺的图图呢.webp');
    }
  };

  const resetState = () => {
    setStep(1);
    setSourcePath('');
    setScanData(null);
    setFormData({ title: '', type: 'scene', rating: 'everyone', tags: [], notes: '', description: '', preview: '' });
    setPreviewUrl('assets/俺的图图呢.webp');
  };
  
  const handleClose = () => {
    resetState();
    onClose();
  };

  // --- Render Functions ---
  const renderStep1 = () => (
    React.createElement('div', { 
        className: 'import-step',
        onDragOver: handleDragOver,
        onDragLeave: handleDragLeave,
        onDrop: handleDrop
      },
      React.createElement('div', { className: `drop-zone ${isDragging ? 'drag-over' : ''}` },
        React.createElement('p', { className: 'drop-zone-text' }, '将文件夹拖到此处'),
        React.createElement('p', { className: 'drop-zone-or' }, '或'),
        React.createElement('button', { id: 'import-select-folder-btn', onClick: handleSelectFolder }, '选择文件夹')
      ),
      sourcePath && React.createElement('p', { id: 'import-folder-path-display', style: { marginTop: '15px', textAlign: 'center' } }, `已选择: ${sourcePath}`)
    )
  );

  const renderStep2 = () => (
    React.createElement('div', { className: 'import-step' },
      React.createElement('div', { className: 'import-form-container' },
        React.createElement('div', { className: 'import-form-left' },
          React.createElement('form', { id: 'import-metadata-form', onSubmit: handleConfirmImport },
            React.createElement('label', { htmlFor: 'import-title' }, '标题:'),
            React.createElement('input', { type: 'text', id: 'import-title', name: 'title', value: formData.title, onChange: handleFormChange, required: true }),
            
            React.createElement('label', { htmlFor: 'import-type' }, '类型:'),
            React.createElement('select', { id: 'import-type', name: 'type', value: formData.type, onChange: handleFormChange },
              React.createElement('option', { value: 'scene' }, '🏞️ Scene'),
              React.createElement('option', { value: 'video' }, '🎬 Video'),
              React.createElement('option', { value: 'application' }, '💻 Application'),
              React.createElement('option', { value: 'web' }, '🌐 Web')
            ),

            React.createElement('label', { htmlFor: 'import-rating' }, '分级:'),
            React.createElement('select', { id: 'import-rating', name: 'rating', value: formData.rating, onChange: handleFormChange },
              React.createElement('option', { value: 'everyone' }, '😊 Everyone'),
              React.createElement('option', { value: 'questionable' }, '🤔 Questionable'),
              React.createElement('option', { value: 'mature' }, '🔞 Mature')
            ),

            React.createElement('label', { htmlFor: 'import-preview' }, '预览图文件名:'),
            React.createElement('input', { type: 'text', id: 'import-preview', name: 'preview', value: formData.preview, onChange: handlePreviewInputChange }),

            // 使用 TagEditor 组件替换原来的 input
            React.createElement('label', { htmlFor: 'import-tags' }, '标签:'),
            settings && React.createElement(TagEditor, {
                tags: formData.tags,
                presetTags: settings.presetTags || [],
                onTagsChange: handleTagsChange
            }),
            
            React.createElement('label', { htmlFor: 'import-description' }, '描述:'),
            React.createElement('textarea', { id: 'import-description', name: 'description', rows: '3', value: formData.description, onChange: handleFormChange }),

            React.createElement('label', { htmlFor: 'import-notes' }, '备注:'),
            React.createElement('textarea', { id: 'import-notes', name: 'notes', rows: '2', value: formData.notes, onChange: handleFormChange })
          )
        ),
        React.createElement('div', { className: 'import-form-right' },
          React.createElement('img', { 
              id: 'import-preview-image', 
              src: previewUrl, 
              alt: '壁纸预览',
              onError: (e) => { e.target.src = 'assets/俺的图图呢.webp'; }
          }),
          React.createElement('div', { id: 'import-scan-info' },
            React.createElement('h4', null, '扫描信息:'),
            React.createElement('p', null, scanInfo.size),
            React.createElement('p', null, scanInfo.files),
            React.createElement('p', null, scanInfo.id) // Display the ID
          )
        )
      ),
      React.createElement('div', { className: 'import-modal-footer' },
        React.createElement('button', { id: 'import-cancel-btn', onClick: handleClose }, '取消'),
        React.createElement('button', { id: 'import-confirm-btn', className: 'primary-btn', onClick: handleConfirmImport }, '确认导入')
      )
    )
  );

  const renderStep3 = () => (
    React.createElement('div', { className: 'import-step' },
      React.createElement('h4', null, '正在导入...'),
      React.createElement('div', { className: 'spinner' }),
      React.createElement('p', { id: 'import-status-text' }, statusText)
    )
  );

  const modalOverlayClass = `import-modal-overlay ${step > 0 ? 'visible' : ''}`;

  return React.createElement('div', { 
      id: 'import-modal-overlay', 
      className: modalOverlayClass,
      // 仅在第一步时允许点击背景关闭
      onClick: step === 1 ? handleClose : undefined 
    },
    React.createElement('div', { 
        id: 'import-modal-content', 
        className: 'import-modal-content',
        onClick: e => e.stopPropagation() 
      },
      React.createElement('div', { className: 'import-modal-header' },
        React.createElement('h2', null, '导入新壁纸'),
        React.createElement('button', { id: 'import-modal-close-btn', onClick: handleClose }, '×')
      ),
      React.createElement('div', { className: 'import-modal-body' },
        step === 1 && renderStep1(),
        step === 2 && renderStep2(),
        step === 3 && renderStep3()
      )
    )
  );
};

module.exports = { ImportModal };
