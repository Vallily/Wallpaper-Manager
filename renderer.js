const { ipcRenderer } = require('electron');
const React = require('react');
const { createRoot } = require('react-dom/client');
const { WallpaperGrid, WallpaperList } = require('./components/mainPage.js');
const { searchWallpapers } = require('./experimental-features/search.js');
const { LocalFileBrowser } = require('./components/LocalFileBrowser.js');
const { VirtualFolderBrowser, NewFolderModal, DecompressionModal } = require('./components/viewManager.js');
const { ImportModal } = require('./components/ImportModal.js');
const { VideoPlayer } = require('./components/VideoPlayer.js');
const { TagEditor } = require('./components/TagEditor.js');

// --- 数据 ---
const ALL_TYPES = ['scene', 'video', 'application', 'web'];
const ALL_RATINGS = ['everyone', 'questionable', 'mature'];
let notificationIdCounter = 0;

// --- 组件 ---

const ViewModeSwitcher = ({ viewMode, onViewModeChange }) => {
  return React.createElement('div', { className: 'view-mode-switcher' },
    React.createElement('button', { className: `view-mode-btn ${viewMode === 'grid' ? 'active' : ''}`, onClick: () => onViewModeChange('grid') }, '网格'),
    React.createElement('button', { className: `view-mode-btn ${viewMode === 'list' ? 'active' : ''}`, onClick: () => onViewModeChange('list') }, '列表')
  );
};

const Header = ({ currentVPath, onNavigate, onNewFolder, viewMode, onViewModeChange, onSelectAll, onDeselectAll, numItems, numSelected, isSearchModeActive, onSearchToggle, searchQuery, onSearchQueryChange, onBatchMove, onImportWallpaper }) => {
  const pathParts = currentVPath.replace(/^\.\/|\/$/g, '').split('/').filter(p => p);

  const handlePathClick = (index) => {
    const newPath = './' + pathParts.slice(0, index + 1).join('/') + '/';
    onNavigate(newPath);
  };

  const handleGoBack = () => {
    if (currentVPath === './') return;
    const parentPath = currentVPath.slice(0, -1).substring(0, currentVPath.slice(0, -1).lastIndexOf('/') + 1);
    onNavigate(parentPath || './');
  };

  const headerClassName = `header ${isSearchModeActive ? 'search-active' : ''}`;

  return React.createElement('div', { className: headerClassName },
    !isSearchModeActive && React.createElement('div', { className: 'header-nav' },
      React.createElement('button', { onClick: handleGoBack, disabled: currentVPath === './' }, '↑'),
      React.createElement('div', { className: 'breadcrumbs' },
        React.createElement('span', { onClick: () => onNavigate('./'), className: 'breadcrumb-part' }, '根目录'),
        pathParts.map((part, index) =>
          React.createElement(React.Fragment, { key: index },
            React.createElement('span', { className: 'breadcrumb-separator' }, '/'),
            React.createElement('span', { onClick: () => handlePathClick(index), className: 'breadcrumb-part' }, part)
          )
        )
      )
    ),
    React.createElement('div', { className: 'header-actions' },
      !isSearchModeActive && React.createElement(React.Fragment, null,
        React.createElement('button', {
          onClick: numSelected === numItems ? onDeselectAll : onSelectAll,
          className: 'select-all-btn',
          disabled: numItems === 0
        }, numSelected === numItems ? '取消全选' : '全选'),
      ),
      React.createElement('button', { className: 'search-btn', onClick: onSearchToggle }, '🔍'),
      isSearchModeActive && React.createElement('input', {
        type: 'text',
        className: 'search-input',
        placeholder: '搜索...',
        value: searchQuery,
        onChange: (e) => onSearchQueryChange(e.target.value),
        autoFocus: true
      }),
      !isSearchModeActive && React.createElement(ViewModeSwitcher, { viewMode, onViewModeChange }),
      !isSearchModeActive && React.createElement('button', { onClick: onNewFolder, className: 'new-folder-btn' }, '新建文件夹'),
      !isSearchModeActive && React.createElement('button', { onClick: onImportWallpaper, className: 'new-folder-btn' }, '导入壁纸')
    )
  );
};
const ContextMenu = ({ menu, onAction, selectedItems, settings }) => {
  const [position, setPosition] = React.useState({ top: 0, left: 0, opacity: 0 });
  const menuRef = React.useRef(null);

  React.useEffect(() => {
    if (menu && menuRef.current) {
      const menuWidth = menuRef.current.offsetWidth;
      const menuHeight = menuRef.current.offsetHeight;
      const { innerWidth, innerHeight } = window;
      const { x, y } = menu;

      let newX = x;
      let newY = y;

      // Adjust horizontally
      if (x + menuWidth > innerWidth) {
        newX = innerWidth - menuWidth - 5; // 5px buffer
      }

      // Adjust vertically
      if (y + menuHeight > innerHeight) {
        newY = innerHeight - menuHeight - 5; // 5px buffer
      }
      
      // Ensure it's not off-screen top/left
      if (newX < 0) newX = 5;
      if (newY < 0) newY = 5;

      setPosition({ top: newY, left: newX, opacity: 1 });
    }
  }, [menu]);

  if (!menu) return null;

  const { item, isMultiSelect } = menu;
  const menuStyle = { top: `${position.top}px`, left: `${position.left}px`, opacity: position.opacity };

  // A helper component for menu items to standardize them.
  const MenuItem = ({ iconClass, text, onClick, className = '', disabled = false }) => {
    const fullClassName = `context-menu-item ${className} ${disabled ? 'disabled' : ''}`;
    // The icon is now an empty span with a specific class for the SVG mask
    return React.createElement('div', { className: fullClassName, onClick: disabled ? null : onClick },
      React.createElement('span', { className: `menu-item-icon ${iconClass || ''}` }),
      React.createElement('span', { className: 'menu-item-text' }, text)
    );
  };
  
  const MenuSeparator = () => React.createElement('hr', { className: 'context-menu-separator' });

  if (isMultiSelect && selectedItems.size > 1) {
    const openInExplorerEnabled = selectedItems.size <= (settings?.openInExplorerLimit || 5);
    return React.createElement('div', { ref: menuRef, style: menuStyle, className: 'context-menu' },
      React.createElement('div', { className: 'context-menu-header' }, `已选择 ${selectedItems.size} 个项目`),
      React.createElement(MenuSeparator),
      React.createElement(MenuItem, { iconClass: 'icon-move-to', text: '移动...', onClick: () => onAction('move-multiple') }),
      settings.enableBatchMove && React.createElement(MenuItem, {
        iconClass: 'icon-move-to',
        text: '物理移动...',
        onClick: () => onAction('batch-move'),
        className: 'experimental'
      }),
      React.createElement(MenuItem, { 
        iconClass: 'icon-show-in-explorer', 
        text: `在资源管理器中显示 (${selectedItems.size})`, 
        onClick: () => onAction('open-multiple'),
        disabled: !openInExplorerEnabled
      }),
      React.createElement(MenuItem, { iconClass: 'icon-delete', text: '删除...', onClick: () => onAction('delete-multiple'), className: 'danger' })
    );
  }

  if (item.itemType === 'folder') {
    return React.createElement('div', { ref: menuRef, style: menuStyle, className: 'context-menu' },
      React.createElement(MenuItem, { iconClass: 'icon-move-to', text: '移动...', onClick: () => onAction('move-folder') }),
      React.createElement(MenuItem, { iconClass: 'icon-delete', text: '删除...', onClick: () => onAction('delete-folder'), className: 'danger' })
    );
  }

  // Single wallpaper context menu
  const showDecompressOption = item.type && item.type.toLowerCase() === 'application';

  const handleDecompressClick = () => {
    if (!settings.bandizipPath) {
      // 指向正确的设置位置
      onAction('show-notification', '错误：请先在“设置”>“常规”中配置 Bandizip 的路径。');
      return;
    }
    onAction('decompress');
  };

  return React.createElement('div', { ref: menuRef, style: menuStyle, className: 'context-menu' },
    item.type && item.type.toLowerCase() === 'application'
      ? React.createElement(MenuItem, { iconClass: 'icon-set-wallpaper', text: '定位可执行文件...', onClick: () => onAction('locate') })
      : React.createElement(MenuItem, { iconClass: 'icon-open', text: '预览', onClick: () => onAction('preview') }),
    React.createElement(MenuItem, { iconClass: 'icon-details', text: '详细信息...', onClick: () => onAction('show-details') }),
    React.createElement(MenuSeparator),
    React.createElement(MenuItem, { iconClass: 'icon-move-to', text: '移动到...', onClick: () => onAction('move-wallpaper') }),
    React.createElement(MenuItem, { iconClass: 'icon-show-in-explorer', text: '在资源管理器中显示', onClick: () => onAction('open') }),
    /^\d+$/.test(item.id) && React.createElement(MenuItem, {
        iconClass: 'icon-steam',
        text: '在创意工坊中浏览',
        onClick: () => onAction('open-in-workshop')
    }),
    settings.enableBatchMove && React.createElement(MenuItem, {
        iconClass: 'icon-move-to', // Re-use icon
        text: '物理移动...',
        onClick: () => onAction('batch-move'),
        className: 'experimental'
    }),
    React.createElement(MenuSeparator),
    // 移除实验性标志和文本
    showDecompressOption && React.createElement(MenuItem, { iconClass: 'icon-unzip', text: '浏览并解压...', onClick: handleDecompressClick }),
    React.createElement(MenuItem, { iconClass: 'icon-delete', text: '清理ZIP文件', onClick: () => onAction('cleanup-zip') }),
    React.createElement(MenuSeparator),
    React.createElement(MenuItem, { iconClass: 'icon-delete', text: '移至回收站...', onClick: () => onAction('delete'), className: 'danger' })
  );
};

// --- 新的详细信息模态框组件 (重构后) ---

const DetailsModal = ({ item, onClose, onSave, onAction, settings }) => {
  const [editedData, setEditedData] = React.useState({});
  const [hasChanges, setHasChanges] = React.useState(false);

  // Helper to generate a random color for new tags (used for initial processing)
  const getRandomColor = () => {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
  };

  // Populate and process data when item or settings are available
  React.useEffect(() => {
    if (item && settings) {
      const presetTagsFlat = (settings.presetTags || []).flatMap(group => group.tags);

      // Process tags to ensure they are all objects with a name and color
      const processedTags = (item.tags || []).map(tag => {
        // If it's already a valid tag object, return it
        if (typeof tag === 'object' && tag.name && tag.color) {
          return tag;
        }
        // If it's a string or an incomplete object, process it
        const tagName = (typeof tag === 'object' ? tag.name : tag) || '';
        const preset = presetTagsFlat.find(p => p.name === tagName);
        return {
          name: tagName,
          color: preset ? preset.color : getRandomColor()
        };
      }).filter(tag => tag.name); // Ensure no empty tags

      setEditedData({
        rating: item.rating || 'everyone',
        tags: processedTags,
        notes: item.notes || '',
        description: item.description || '',
      });
      setHasChanges(false); // Reset changes on new item
    }
  }, [item, settings]);

  if (!item) return null;

  // --- Helper Functions ---
  const formatBytes = (bytes, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return '未知';
    return new Date(timestamp).toLocaleString();
  };
  
  const handleValueChange = (field, value) => {
    setEditedData(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };
  
  const handleSave = () => {
    onSave(item.id, editedData);
  };

  const handleActionClick = () => {
    onClose(); // Close the modal first
    
    let action;
    const itemType = item.type.toLowerCase();

    if (itemType === 'application') {
      // If path exists, the primary action is to launch; otherwise, it's to locate.
      action = item.appPath ? 'launch' : 'locate';
    } else if (itemType === 'video' || itemType === 'scene' || itemType === 'web') {
      // For other types, the default action is 'preview'.
      action = 'preview';
    }

    if (action) {
      // Use a small timeout to ensure the modal has started closing before the action is triggered.
      // We pass the specific item to the action handler.
      setTimeout(() => onAction(action, item), 50);
    }
  };

  // --- Render Functions ---
  const renderInfoGrid = () => (
    React.createElement('div', { className: 'details-info-grid' },
      React.createElement('div', { className: 'details-label' }, 'ID'),
      React.createElement('div', { className: 'details-value' }, item.id),
      
      React.createElement('div', { className: 'details-label' }, '类型'),
      React.createElement('div', { className: 'details-value' }, item.type),
      
      React.createElement('div', { className: 'details-label' }, '大小'),
      React.createElement('div', { className: 'details-value' }, formatBytes(item.size)),
      
      React.createElement('div', { className: 'details-label' }, '加入时间'),
      React.createElement('div', { className: 'details-value' }, formatDate(item.dateAdded)),

      React.createElement('div', { className: 'details-label' }, '分级'),
      React.createElement('div', { className: 'rating-select-wrapper' },
        React.createElement('select', {
          className: 'rating-select',
          value: editedData.rating,
          onChange: e => handleValueChange('rating', e.target.value)
        },
          ALL_RATINGS.map(r => React.createElement('option', { key: r, value: r }, r))
        )
      ),

    )
  );

  const renderTagsSection = () => (
    React.createElement('div', { className: 'details-section' },
      React.createElement('h3', { className: 'details-section-title' }, '标签'),
      React.createElement(TagEditor, {
        tags: editedData.tags || [],
        presetTags: settings.presetTags || [],
        onTagsChange: (newTags) => handleValueChange('tags', newTags)
      })
    )
  );

  const renderDescriptionSection = () => (
    React.createElement('div', { className: 'details-section' },
      React.createElement('h3', { className: 'details-section-title' }, '描述'),
      React.createElement('textarea', {
        className: 'notes-textarea',
        value: editedData.description,
        onChange: e => handleValueChange('description', e.target.value),
        placeholder: '在此处输入壁纸的描述信息...'
      })
    )
  );

  const renderNotesSection = () => (
    React.createElement('div', { className: 'details-section' },
      React.createElement('h3', { className: 'details-section-title' }, '备注'),
      React.createElement('textarea', {
        className: 'notes-textarea',
        value: editedData.notes,
        onChange: e => handleValueChange('notes', e.target.value),
        placeholder: '在此处输入个人备注...'
      })
    )
  );

  const getActionInfo = () => {
    switch (item.type.toLowerCase()) {
      case 'application':
        return { text: item.appPath ? '启动应用' : '定位应用', disabled: false };
      case 'video':
        return { text: '播放视频', disabled: !item.video };
      case 'scene':
        return { text: '预览场景', disabled: false };
      case 'web':
        return { text: '预览网页', disabled: false };
      default:
        return { text: '无可用操作', disabled: true };
    }
  };
  const { text: actionText, disabled: actionDisabled } = getActionInfo();

  return React.createElement('div', { className: 'modal-overlay', onClick: onClose },
    React.createElement('div', { className: 'details-modal-content', onClick: e => e.stopPropagation() },
      // New scrolling container
      React.createElement('div', { className: 'details-modal-scroll-container' },
        React.createElement('div', { className: 'details-modal-cover', style: { backgroundImage: `url('${item.preview}')` } }),
        React.createElement('div', { className: 'details-modal-body' },
          React.createElement('div', { className: 'details-modal-header' },
            React.createElement('h2', { className: 'details-modal-title' }, item.title),
            React.createElement('button', {
              className: 'details-action-btn',
              onClick: handleActionClick,
              disabled: actionDisabled
            }, actionText)
          ),
          renderInfoGrid(),
          renderTagsSection(),
          renderDescriptionSection(),
          renderNotesSection()
        )
      ),
      React.createElement('div', { className: 'details-modal-footer' },
        React.createElement('button', { className: 'details-close-btn', onClick: onClose }, '关闭'),
        React.createElement('button', {
          className: 'details-save-btn',
          onClick: handleSave,
          disabled: !hasChanges
        }, '保存更改')
      )
    )
  );
};


const NotificationContainer = ({ notifications }) => {
  return React.createElement('div', { className: 'notification-container' },
    notifications.map(note => React.createElement('div', { key: note.id, className: 'notification' }, note.message))
  );
};

const FilterGroup = ({ title, items, selectedItems, onFilterChange }) => {
  const [isOpen, setIsOpen] = React.useState(true);
  return React.createElement('div', { className: 'filter-group' },
    React.createElement('h3', { onClick: () => setIsOpen(!isOpen), className: 'filter-title' }, (isOpen ? '▼ ' : '► ') + title),
    isOpen && React.createElement('div', { className: 'filter-options' },
      items.map(item =>
        React.createElement('label', { key: item, className: 'filter-label' },
          React.createElement('input', { type: 'checkbox', checked: selectedItems.includes(item), onChange: () => onFilterChange(item) }),
          item
        )
      )
    )
  );
};

const SortOptions = ({ sortBy, sortOrder, onSortChange }) => {
  return React.createElement('div', { className: 'sort-options filter-group' },
    React.createElement('h3', { className: 'filter-title' }, '排序方式'),
    React.createElement('div', { className: 'sort-by-group' },
      React.createElement('label', null,
        React.createElement('input', { type: 'radio', name: 'sort-by', value: 'title', checked: sortBy === 'title', onChange: (e) => onSortChange('sortBy', e.target.value) }),
        '名称'
      ),
      React.createElement('label', null,
        React.createElement('input', { type: 'radio', name: 'sort-by', value: 'dateAdded', checked: sortBy === 'dateAdded', onChange: (e) => onSortChange('sortBy', e.target.value) }),
        '加入时间'
      ),
      React.createElement('label', null,
        React.createElement('input', { type: 'radio', name: 'sort-by', value: 'size', checked: sortBy === 'size', onChange: (e) => onSortChange('sortBy', e.target.value) }),
        '大小'
      )
    ),
    React.createElement('div', { className: 'sort-order-group' },
      React.createElement('button', { className: `sort-order-btn ${sortOrder === 'asc' ? 'active' : ''}`, onClick: () => onSortChange('sortOrder', 'asc') }, '↑ 升序'),
      React.createElement('button', { className: `sort-order-btn ${sortOrder === 'desc' ? 'active' : ''}`, onClick: () => onSortChange('sortOrder', 'desc') }, '↓ 降序')
    )
  );
};

const Sidebar = ({ 
  filters, onFilterChange, 
  sortOptions, onSortChange,
  onRefresh, onNavigateToSettings, isActionInProgress
}) => {
  return React.createElement('div', { className: 'sidebar' },
    React.createElement('div', { className: 'sidebar-main-controls' },
      React.createElement('h2', null, '浏览选项'),
      React.createElement('button', { className: 'refresh-btn', onClick: onRefresh }, '刷新')
    ),
    React.createElement('div', { className: 'filter-groups' },
      React.createElement(SortOptions, { sortBy: sortOptions.sortBy, sortOrder: sortOptions.sortOrder, onSortChange }),
      React.createElement(FilterGroup, { title: '筛选 - 类型', items: ALL_TYPES, selectedItems: filters.type, onFilterChange: (type) => onFilterChange('type', type) }),
      React.createElement(FilterGroup, { title: '筛选 - 年龄分级', items: ALL_RATINGS, selectedItems: filters.rating, onFilterChange: (rating) => onFilterChange('rating', rating) })
    ),
    React.createElement('div', { className: 'sidebar-footer' },
      React.createElement('button', { 
        className: 'settings-btn', 
        onClick: onNavigateToSettings,
        disabled: isActionInProgress
      }, '⚙️ 设置')
    )
  );
};



// 新的“常用工具”设置组件
const CommonToolsSettings = ({ settings, onSettingsChange, showNotification }) => {
  const handleBandizipPathChange = (e) => {
    onSettingsChange({ ...settings, bandizipPath: e.target.value });
  };

  const handleBandizipBrowse = async () => {
    const result = await ipcRenderer.invoke('open-exe-dialog');
    if (result.success) {
      onSettingsChange({ ...settings, bandizipPath: result.path });
      showNotification('Bandizip 路径已更新。');
    }
  };

  const handleCheatEnginePathChange = (e) => {
    onSettingsChange({ ...settings, cheatEnginePath: e.target.value });
  };

  const handleCheatEngineBrowse = async () => {
    const result = await ipcRenderer.invoke('open-exe-dialog');
    if (result.success) {
      onSettingsChange({ ...settings, cheatEnginePath: result.path });
      showNotification('Cheat Engine 路径已更新。');
    }
  };
  
  const handleLaunchCheatEngine = () => {
    showNotification('正在尝试启动 Cheat Engine...');
    ipcRenderer.invoke('launch-tool', 'cheat-engine').then(result => {
      if (!result.success) {
        showNotification(result.error, true);
      }
    });
  };

  const handleWallpaperEnginePathChange = (e) => {
    onSettingsChange({ ...settings, wallpaperEnginePath: e.target.value });
  };

  const handleWallpaperEngineBrowse = async () => {
    const result = await ipcRenderer.invoke('open-exe-dialog');
    if (result.success) {
      onSettingsChange({ ...settings, wallpaperEnginePath: result.path });
      showNotification('Wallpaper Engine 路径已更新。');
    }
  };

  return React.createElement('div', { className: 'common-tools-settings' },
    React.createElement('h3', null, '常用工具'),
    // Wallpaper Engine Section
    React.createElement('div', { className: 'setting-item-column' },
      React.createElement('label', { htmlFor: 'wallpaper-engine-path' }, 'Wallpaper Engine (wallpaper64.exe) 路径:'),
      React.createElement('div', { className: 'custom-path-controls' },
        React.createElement('input', {
          id: 'wallpaper-engine-path',
          type: 'text',
          value: settings.wallpaperEnginePath || '',
          onChange: handleWallpaperEnginePathChange,
          placeholder: '例如 C:\\Program Files (x86)\\Steam\\steamapps\\common\\wallpaper_engine\\wallpaper64.exe',
          style: { flexGrow: 1 }
        }),
        React.createElement('button', { onClick: handleWallpaperEngineBrowse, className: 'primary' }, '浏览...')
      )
    ),
    // Bandizip Section
    React.createElement('div', { className: 'setting-item-column' },
      React.createElement('label', { htmlFor: 'bandizip-path' }, 'Bandizip (bz.exe) 路径:'),
      React.createElement('div', { className: 'custom-path-controls' },
        React.createElement('input', {
          id: 'bandizip-path',
          type: 'text',
          value: settings.bandizipPath || '',
          onChange: handleBandizipPathChange,
          placeholder: '例如 C:\\Program Files\\Bandizip\\bz.exe',
          style: { flexGrow: 1 }
        }),
        React.createElement('button', { onClick: handleBandizipBrowse, className: 'primary' }, '浏览...')
      )
    ),
    // Cheat Engine Section
    React.createElement('div', { className: 'setting-item-column' },
      React.createElement('label', { htmlFor: 'cheat-engine-path' }, 'Cheat Engine 路径:'),
      React.createElement('div', { className: 'custom-path-controls' },
        React.createElement('input', {
          id: 'cheat-engine-path',
          type: 'text',
          value: settings.cheatEnginePath || '',
          onChange: handleCheatEnginePathChange,
          placeholder: '例如 C:\\Program Files\\Cheat Engine\\Cheat Engine.exe',
          style: { flexGrow: 1 }
        }),
        React.createElement('button', { onClick: handleCheatEngineBrowse, className: 'primary' }, '浏览...'),
        React.createElement('button', { onClick: handleLaunchCheatEngine, className: 'success' }, '启动 Cheat Engine')
      )
    )
  );
};

const DebugView = ({ settings, onSettingsChange, showNotification, onDatabaseCleared }) => {
  const handleClearDatabase = () => {
    const isConfirmed = window.confirm('你确定要清空并初始化整个数据库吗？此操作不可逆！');
    if (isConfirmed) {
      ipcRenderer.invoke('clear-database').then(result => {
        if (result.success) {
          showNotification('数据库已成功清除和初始化。');
          onDatabaseCleared();
        } else {
          showNotification('数据库清除失败。');
        }
      });
    }
  };

  return React.createElement('div', { className: 'settings-section' }, // Use a more generic class
    React.createElement('h3', null, '调试工具'),
    
    React.createElement('h4', { style: { marginTop: '20px' } }, '重置数据库'),
    React.createElement('p', null, '将数据库重置为初始状态。所有虚拟文件夹和元数据都将被删除。'),
    React.createElement('button', { className: 'danger', onClick: handleClearDatabase }, '清空并初始化数据库')
  );
};

const HealthCheckView = ({ showNotification }) => {
  const [report, setReport] = React.useState(null);
  const [isLoading, setIsLoading] = React.useState(false);

  const handleStartCheck = async () => {
    setIsLoading(true);
    setReport(null);
    const result = await ipcRenderer.invoke('check-wallpapers-health');
    setIsLoading(false);
    if (result.success) {
      setReport(result.report);
      const totalProblems = result.report.missingMetadata.length;
      const totalFixed = result.report.fixedMetadata.length;
      showNotification(`检查完成，发现 ${totalProblems} 个问题，自动修复了 ${totalFixed} 个。`);
    } else {
      showNotification(`健康检查失败: ${result.error}`, true);
    }
  };

  const handleOpenFolder = (folderPath) => {
    ipcRenderer.invoke('open-folder', folderPath);
  };

  const ReportSection = ({ title, items, isError }) => {
    if (!items || items.length === 0) return null;
    return React.createElement('div', { className: 'report-section' },
      React.createElement('h4', null, `${title} (${items.length})`),
      React.createElement('ul', { className: 'report-list' },
        items.map(item =>
          React.createElement('li', { key: item.id, className: 'report-item' },
            React.createElement('div', { className: 'report-item-info' },
              React.createElement('strong', null, `ID: ${item.id}`),
              React.createElement('span', null, ` - ${item.reason}`)
            ),
            // Only show the button for items that have a path and are errors
            isError && item.path && React.createElement('button', { className: 'primary', onClick: () => handleOpenFolder(item.path) }, '打开文件夹')
          )
        )
      )
    );
  };

  return React.createElement('div', { className: 'health-check-view' },
    React.createElement('h3', null, '壁纸库健康检查'),
    React.createElement('p', null, '此工具将扫描并修复缺失的壁纸元数据。'),
    React.createElement('button', { className: 'primary', onClick: handleStartCheck, disabled: isLoading },
      isLoading ? '正在检查...' : '开始检查'
    ),
    isLoading && React.createElement('p', null, '正在扫描，请稍候...'),
    report && React.createElement('div', { className: 'health-report' },
      (report.missingMetadata.length === 0 && report.fixedMetadata.length === 0)
        ? React.createElement('p', { className: 'report-success' }, '恭喜！未发现任何问题。')
        : React.createElement(React.Fragment, null,
            React.createElement(ReportSection, { title: '已自动修复的项目', items: report.fixedMetadata, isError: false }),
            React.createElement(ReportSection, { title: '无法修复的问题', items: report.missingMetadata, isError: true })
          )
    )
  );
};

const PathSettings = ({ settings, onSettingsChange, showNotification }) => {
  const [newLibName, setNewLibName] = React.useState('');
  const [newLibPath, setNewLibPath] = React.useState('');
  const [editingLib, setEditingLib] = React.useState(null); // Will store { name, path }
  const [isVerifying, setIsVerifying] = React.useState(false);
  
  const wallpaperLibraries = settings.wallpaperLibraries || [];
  const activeLibraryPath = settings.customPath;

  const handleBrowse = async (setter) => {
    const result = await ipcRenderer.invoke('open-path-dialog');
    if (result.success) {
      setter(result.path);
    }
  };

  const handleCreateLibrary = async () => {
    if (!newLibName || !newLibPath) {
      showNotification('名称和路径不能为空。', true);
      return;
    }
    if (wallpaperLibraries.some(lib => lib.path === newLibPath)) {
      showNotification('该路径的壁纸库已存在。', true);
      return;
    }
    
    setIsVerifying(true);
    const result = await ipcRenderer.invoke('validate-and-set-custom-path', newLibPath);
    setIsVerifying(false);

    if (result.success) {
      const newLibraries = [...wallpaperLibraries, { name: newLibName, path: newLibPath }];
      onSettingsChange({ ...settings, wallpaperLibraries: newLibraries });
      showNotification(`壁纸库 "${newLibName}" 已创建。`);
      setNewLibName('');
      setNewLibPath('');
    } else {
      showNotification(`路径验证失败: ${result.error}`, true);
    }
  };
  
  const handleApplyLibrary = async (path) => {
    if (activeLibraryPath === path) {
      showNotification('该壁纸库已在应用中。');
      return;
    }
    
    setIsVerifying(true);
    const result = await ipcRenderer.invoke('validate-and-set-custom-path', path);
    setIsVerifying(false);

    if (result.success) {
      onSettingsChange({ ...settings, customPath: path });
      showNotification('壁纸库已应用，正在重新加载...');
    } else {
      showNotification(`路径验证失败: ${result.error}`, true);
    }
  };

  const handleDeleteLibrary = (pathToDelete) => {
    const isConfirmed = window.confirm('您确定要删除这个壁纸库吗？这不会删除物理文件。');
    if (isConfirmed) {
      const newLibraries = wallpaperLibraries.filter(lib => lib.path !== pathToDelete);
      const newSettings = { ...settings, wallpaperLibraries: newLibraries };
      // If the deleted library was the active one, clear the customPath
      if (settings.customPath === pathToDelete) {
        newSettings.customPath = '';
      }
      onSettingsChange(newSettings);
      showNotification('壁纸库已删除。');
    }
  };

  const handleStartEditing = (library) => {
    setEditingLib({ ...library });
  };
  
  const handleCancelEditing = () => {
    setEditingLib(null);
  };

  const handleSaveEdit = async () => {
    if (!editingLib || !editingLib.name || !editingLib.path) {
      showNotification('名称和路径不能为空。', true);
      return;
    }
    
    const originalLib = wallpaperLibraries.find(lib => lib.path === editingLib.originalPath);
    
    // Check if the path is being changed and if the new path already exists
    if (editingLib.path !== editingLib.originalPath && wallpaperLibraries.some(lib => lib.path === editingLib.path)) {
      showNotification('新的路径已被另一个壁纸库使用。', true);
      return;
    }

    setIsVerifying(true);
    const result = await ipcRenderer.invoke('validate-and-set-custom-path', editingLib.path);
    setIsVerifying(false);

    if (result.success) {
      const newLibraries = wallpaperLibraries.map(lib => 
        lib.path === editingLib.originalPath ? { name: editingLib.name, path: editingLib.path } : lib
      );
      const newSettings = { ...settings, wallpaperLibraries: newLibraries };
      // If the edited library was the active one, update customPath as well
      if (settings.customPath === editingLib.originalPath) {
        newSettings.customPath = editingLib.path;
      }
      onSettingsChange(newSettings);
      showNotification('壁纸库已更新。');
      setEditingLib(null);
    } else {
      showNotification(`新路径验证失败: ${result.error}`, true);
    }
  };

  const renderLibraryCard = (library) => {
    const isEditing = editingLib && editingLib.originalPath === library.path;
    const isActive = activeLibraryPath === library.path;
    const cardClassName = `library-card ${isActive ? 'active-glow' : ''}`;
    
    if (isEditing) {
      return React.createElement('div', { key: library.path, className: 'library-card editing' },
        React.createElement('div', { className: 'library-card-inputs' },
          React.createElement('input', {
            type: 'text',
            value: editingLib.name,
            placeholder: '壁纸库名称',
            onChange: (e) => setEditingLib({ ...editingLib, name: e.target.value })
          }),
          React.createElement('div', { className: 'path-input-group' },
            React.createElement('input', {
              type: 'text',
              value: editingLib.path,
              placeholder: '壁纸库路径',
              onChange: (e) => setEditingLib({ ...editingLib, path: e.target.value })
            }),
            React.createElement('button', { className: 'primary', onClick: () => handleBrowse((p) => setEditingLib({ ...editingLib, path: p })) }, '浏览...')
          )
        ),
        React.createElement('div', { className: 'library-card-actions' },
          React.createElement('button', { className: 'success', onClick: handleSaveEdit }, '保存'),
          React.createElement('button', { onClick: handleCancelEditing }, '取消')
        )
      );
    }

    return React.createElement('div', { key: library.path, className: cardClassName },
      React.createElement('div', { className: 'library-card-info' },
        React.createElement('strong', null, library.name),
        React.createElement('span', { className: 'library-path' }, library.path)
      ),
      React.createElement('div', { className: 'library-card-actions' },
        React.createElement('button', { className: 'success', onClick: () => handleApplyLibrary(library.path), disabled: isActive || isVerifying }, isActive ? '已应用' : '应用'),
        React.createElement('button', { onClick: () => handleStartEditing({ ...library, originalPath: library.path }) }, '编辑'),
        React.createElement('button', { className: 'danger', onClick: () => handleDeleteLibrary(library.path) }, '删除')
      )
    );
  };
  
  return React.createElement('div', { className: 'path-settings' },
    React.createElement('h3', null, '壁纸库管理'),
    // Add New Library Card
    React.createElement('div', { className: 'add-library-card' },
      React.createElement('h4', null, '添加新壁纸库'),
      React.createElement('div', { className: 'name-input-container' },
        React.createElement('input', {
          type: 'text',
          placeholder: '壁纸库名称',
          value: newLibName,
          onChange: (e) => setNewLibName(e.target.value),
          className: 'library-input'
        })
      ),
      React.createElement('div', { className: 'path-input-group' },
        React.createElement('input', {
          type: 'text',
          placeholder: '壁纸库路径',
          value: newLibPath,
          onChange: (e) => setNewLibPath(e.target.value),
          className: 'library-input'
        }),
        React.createElement('button', { className: 'primary', onClick: () => handleBrowse(setNewLibPath) }, '浏览...')
      ),
      React.createElement('div', { className: 'add-library-actions' },
        React.createElement('button', {
          onClick: handleCreateLibrary,
          disabled: !newLibName || !newLibPath || isVerifying,
          className: 'primary'
        }, isVerifying ? '验证中...' : '创建壁纸库')
      )
    ),

    // Library List
    React.createElement('div', { className: 'library-list' },
      wallpaperLibraries.length > 0
        ? wallpaperLibraries.map(renderLibraryCard)
        : React.createElement('p', null, '暂无壁纸库，请在上方添加。')
    )
  );
};

const GeneralSettings = ({ settings, onSettingsChange }) => {
  // This component is now "controlled" by the parent. It doesn't hold its own state.
  // It receives the current settings and a function to call when a setting changes.

  const handleLimitChange = (e) => {
    const newLimit = parseInt(e.target.value, 10);
    // Allow empty input for typing, but don't save if it's not a valid number
    if (!isNaN(newLimit) && newLimit > 0) {
      onSettingsChange({ ...settings, openInExplorerLimit: newLimit });
    } else if (e.target.value === '') {
       // Handle case where user deletes the number
       onSettingsChange({ ...settings, openInExplorerLimit: '' }); // Pass empty string to parent
    }
  };

  const handleAutoHideChange = (e) => {
    onSettingsChange({ ...settings, autoHideAdultContent: e.target.checked });
  };

  const handleVfsDisabledChange = (e) => {
    onSettingsChange({ ...settings, vfsDisabled: e.target.checked });
  };

  const handleBatchMoveChange = (e) => {
    onSettingsChange({ ...settings, enableBatchMove: e.target.checked });
  };

  return React.createElement('div', { className: 'general-settings' },
    React.createElement('h3', null, '常规设置'),
    React.createElement('div', { className: 'setting-item' },
      React.createElement('label', { htmlFor: 'explorer-limit' }, '“在资源管理器中显示”数量阈值'),
      React.createElement('input', {
        id: 'explorer-limit',
        type: 'number',
        // Use settings from props directly
        value: settings.openInExplorerLimit,
        onChange: handleLimitChange,
        min: '1'
      })
    ),
    React.createElement('div', { className: 'setting-item' },
      React.createElement('label', { htmlFor: 'auto-hide-adult' }, '自动隐藏成人内容'),
      React.createElement('input', {
        id: 'auto-hide-adult',
        type: 'checkbox',
        // Use settings from props directly
        checked: settings.autoHideAdultContent,
        onChange: handleAutoHideChange
      })
    ),
    React.createElement('div', { className: 'setting-item' },
      React.createElement('label', { htmlFor: 'vfs-disabled' }, '关闭vfs（虚拟文件夹）功能'),
      React.createElement('input', {
        id: 'vfs-disabled',
        type: 'checkbox',
        checked: settings.vfsDisabled || false,
        onChange: handleVfsDisabledChange
      })
    ),
    React.createElement('p', { className: 'settings-info-box' }, '勾选后，壁纸将以无文件夹的扁平列表形式展示。'),
    React.createElement('div', { className: 'setting-item' },
        React.createElement('label', { htmlFor: 'enable-batch-move' }, '（实验性）开启批量转移功能'),
        React.createElement('input', {
            id: 'enable-batch-move',
            type: 'checkbox',
            checked: settings.enableBatchMove || false,
            onChange: handleBatchMoveChange
        })
    ),
    React.createElement('p', { className: 'settings-info-box' }, '勾选后，右键菜单将出现“批量转移”选项，用于物理移动文件。')
    // The save button is removed as changes are now handled in real-time by the parent.
  );
};

const SettingsHeader = ({ onGoBack, activeTab, onTabChange }) => {
  return React.createElement('div', { className: 'settings-header' },
    React.createElement('div', { className: 'settings-header-left' },
      React.createElement('button', { className: 'settings-back-btn', onClick: onGoBack }, '←'),
      React.createElement('h2', { className: 'settings-title' }, '设置')
    ),
    React.createElement('div', { className: 'settings-nav' },
      React.createElement('button', {
        className: `settings-nav-btn ${activeTab === 'general' ? 'active' : ''}`,
        onClick: () => onTabChange('general')
      }, '常规'),
      React.createElement('button', {
        className: `settings-nav-btn ${activeTab === 'path' ? 'active' : ''}`,
        onClick: () => onTabChange('path')
      }, '壁纸库管理'),
      React.createElement('button', {
        className: `settings-nav-btn ${activeTab === 'debug' ? 'active' : ''}`,
        onClick: () => onTabChange('debug')
      }, '调试'),
      React.createElement('button', {
        className: `settings-nav-btn ${activeTab === 'health' ? 'active' : ''}`,
        onClick: () => onTabChange('health')
      }, '健康检查')
    )
  );
};

const SettingsPage = ({ onGoBack, showNotification, onDatabaseCleared, settings, onSettingsChange }) => {
  const [activeTab, setActiveTab] = React.useState('general');

  const handleFolderClick = (path) => {
    onGoBack(path);
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'general':
        return React.createElement(React.Fragment, null,
          React.createElement(GeneralSettings, { settings, onSettingsChange, showNotification }),
          React.createElement(CommonToolsSettings, { settings, onSettingsChange, showNotification })
        );
      case 'path':
        return React.createElement(PathSettings, { settings, onSettingsChange, showNotification });
      case 'debug':
        return React.createElement(DebugView, { settings, onSettingsChange, showNotification, onDatabaseCleared });
      case 'health':
        return React.createElement(HealthCheckView, { showNotification });
      default:
        return null;
    }
  };

  return React.createElement('div', { className: 'settings-page' },
    React.createElement(SettingsHeader, { onGoBack: () => onGoBack(), activeTab, onTabChange: setActiveTab }),
    React.createElement('div', { className: 'settings-content' },
      renderContent()
    )
  );
};

const App = () => {
  const [allItems, setAllItems] = React.useState([]);
  const [filteredItems, setFilteredItems] = React.useState([]);
  // State will be initialized from settings
  const [filters, setFilters] = React.useState(null);
  const [sortOptions, setSortOptions] = React.useState(null);
  const [viewMode, setViewMode] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [playingVideoInfo, setPlayingVideoInfo] = React.useState(null);
  const [notifications, setNotifications] = React.useState([]);
  const [contextMenu, setContextMenu] = React.useState(null);
  const [browserConfig, setBrowserConfig] = React.useState({ isVisible: false });
  const [isDecompressionModalVisible, setDecompressionModalVisible] = React.useState(false);
  const [fileToDecompress, setFileToDecompress] = React.useState(null);
  const [runningApps, setRunningApps] = React.useState(new Set());
  const [currentVPath, setCurrentVPath] = React.useState("./");
  const [isCreatingFolder, setIsCreatingFolder] = React.useState(false);
  const [movingItem, setMovingItem] = React.useState(null);
  const [currentView, setCurrentView] = React.useState('grid'); // 'grid' or 'settings'
  const [selectedItems, setSelectedItems] = React.useState(new Set());
  const [settings, setSettings] = React.useState(null);
  const [isInitialScanComplete, setIsInitialScanComplete] = React.useState(false);
  const [commonPasswords, setCommonPasswords] = React.useState([]);
  const [lastUsedPassword, setLastUsedPassword] = React.useState('');
  const [isSearchModeActive, setIsSearchModeActive] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [detailsModal, setDetailsModal] = React.useState({ isVisible: false, item: null });
  const [isImportModalVisible, setImportModalVisible] = React.useState(false);

  const mainContentRef = React.useRef(null);
  const scrollPositions = React.useRef({});

  // Effect to handle global keyboard shortcuts
  React.useEffect(() => {
    const handleKeyDown = (event) => {
      // F12 to toggle developer tools
      if (event.key === 'F12') {
        event.preventDefault(); // Prevent default browser action
        ipcRenderer.send('toggle-dev-tools');
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    // Cleanup the event listener on component unmount
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []); // Empty dependency array means this effect runs once on mount

  // Effect to dynamically load/unload CSS for the ImportModal
  React.useEffect(() => {
    const styleId = 'import-modal-style';
    if (isImportModalVisible) {
      if (document.getElementById(styleId)) return;

      const link = document.createElement('link');
      link.id = styleId;
      link.rel = 'stylesheet';
      link.href = 'components/css/import-modal.css'; // Path relative to index.html
      document.head.appendChild(link);
    }

    return () => {
      // The cleanup function runs when the component unmounts or the dependency changes.
      const linkElement = document.getElementById(styleId);
      if (linkElement) {
        document.head.removeChild(linkElement);
      }
    };
  }, [isImportModalVisible]); // Dependency on the modal's visibility

  // Effect to dynamically load/unload CSS for the VideoPlayer
  React.useEffect(() => {
    const styleId = 'video-player-style';
    if (playingVideoInfo) {
      if (document.getElementById(styleId)) return;

      const link = document.createElement('link');
      link.id = styleId;
      link.rel = 'stylesheet';
      link.href = 'components/css/video-player.css';
      document.head.appendChild(link);
    }

    return () => {
      const linkElement = document.getElementById(styleId);
      if (linkElement) {
        document.head.removeChild(linkElement);
      }
    };
  }, [playingVideoInfo]);

  React.useEffect(() => {
    const styleId = 'search-component-style';
    if (isSearchModeActive) {
      // If the style already exists, do nothing.
      if (document.getElementById(styleId)) return;

      const link = document.createElement('link');
      link.id = styleId;
      link.rel = 'stylesheet';
      link.href = 'components/css/Search.css'; // Path relative to index.html
      document.head.appendChild(link);
    }

    // Return a cleanup function
    return () => {
      if (isSearchModeActive) {
        const linkElement = document.getElementById(styleId);
        if (linkElement) {
          // console.log('Unloading Search.css');
          document.head.removeChild(linkElement);
        }
      }
    };
  }, [isSearchModeActive]);

  // This is the single source of truth for updating and saving settings.
  const handleSettingsChange = (newSettings) => {
    // Check if a setting that requires a data refresh has changed
    const vfsToggled = settings && settings.vfsDisabled !== newSettings.vfsDisabled;

    // Update the local state immediately for a responsive UI
    setSettings(newSettings);
    
    // Persist the changes to the backend
    ipcRenderer.invoke('save-settings', newSettings)
      .then(() => {
        // If the VFS setting was toggled, we need to reload the items
        if (vfsToggled) {
          // console.log('[前端] VFS 设置已更改，正在重新加载项目...');
          fetchItems(currentVPath);
        }
      })
      .catch(err => {
        console.error("Failed to save settings:", err);
        showNotification("设置保存失败!", true);
        // Optional: Revert to old settings on failure.
      });
  };

  const fetchItems = (vpath) => {
    // console.log(`[前端] fetchItems: 开始从虚拟路径 "${vpath}" 加载项目。`);
    setLoading(true);
    ipcRenderer.invoke('get-items', vpath).then(data => {
      // console.log(`[前端] fetchItems: 从后端接收到 ${data.length} 个项目。`);
      data.forEach(item => {
        if (item.previewMissing) {
          // console.warn(`壁纸 "${item.title}" (ID: ${item.id}) 未找到封面，已使用占位符。`);
        }
      });
      setAllItems(data);
      setLoading(false);
    }).catch(err => { console.error("获取项目失败:", err); setLoading(false); });
  };

  const refreshItems = () => {
    setLoading(true);
    showNotification('正在刷新壁纸库...'); 
    // This now ONLY triggers the refresh. The 'scan-complete' listener is responsible
    // for fetching the data afterwards. This is a more robust, event-driven approach.
    ipcRenderer.invoke('refresh-wallpapers').then(result => {
      if (result.success) {
        // The success notification is now implicitly handled by the UI updating
        // and the 'scan-complete' event potentially showing its own message.
        // We can show a simple "triggered" message.
        console.log('[前端] 后端刷新已成功触发。等待 scan-complete 事件。');
      } else {
        showNotification('触发刷新失败!', true);
        setLoading(false);
      }
    }).catch(err => {
      console.error("触发刷新失败:", err);
      showNotification('触发刷新失败!', true);
      setLoading(false);
    });
  };

  // Effect for one-time setup on component mount
  React.useEffect(() => {
    // Setup force-refresh listener
    const handleForceRefresh = () => {
      // console.log('[前端] 接收到 force-refresh 事件，正在刷新...');
      refreshItems();
    };
    document.addEventListener('force-refresh', handleForceRefresh);

    // 1. Load settings and apply one-time logic
    ipcRenderer.invoke('get-settings').then(loadedSettings => {
      setSettings(loadedSettings);
      setViewMode(loadedSettings.viewMode);
      setSortOptions(loadedSettings.sortOptions);
      setCommonPasswords(loadedSettings.commonPasswords || []);
      
      let activeFilters = { ...loadedSettings.filters };
      // This logic now correctly runs only once on startup
      if (loadedSettings.autoHideAdultContent && !isInitialScanComplete) {
        console.log('[前端] 启动时检测到自动隐藏成人内容，正在调整当前会话的过滤器。');
        activeFilters.rating = ['everyone'];
      }
      setFilters(activeFilters);
    });

    // 2. Set up scan completion listener
    const handleScanComplete = (event, success) => {
      console.log(`[前端] 收到 "scan-complete" 事件，成功: ${success}。正在为当前路径 "${currentVPath}" 获取项目。`);
      if (success) {
        // This now handles ALL scans, initial and manual.
        fetchItems(currentVPath);
        if (isInitialScanComplete) { // Only show for manual refreshes
          showNotification('壁纸库刷新完成！');
        }
      } else {
        showNotification('扫描或刷新失败。', true);
        setLoading(false);
      }
      
      // Ensure the initial loading screen is only hidden once.
      if (!isInitialScanComplete) {
        setIsInitialScanComplete(true);
      }
    };
    ipcRenderer.on('scan-complete', handleScanComplete);

    // 3. Notify backend that renderer is ready
    console.log('[前端] 发送 "renderer-ready" 事件到后端。');
    ipcRenderer.send('renderer-ready');

    // 4. Cleanup listener on unmount
    return () => {
      ipcRenderer.removeListener('scan-complete', handleScanComplete);
      document.removeEventListener('force-refresh', handleForceRefresh);
    };
  }, []); // Empty dependency array ensures this runs only once

  // Effect to show the "Initial Scan Complete" message exactly once.
  React.useEffect(() => {
    if (isInitialScanComplete) {
      // This effect runs when isInitialScanComplete changes from false to true.
      // We use a timeout to ensure it appears after the main UI is visible.
      setTimeout(() => showNotification('首次扫描完成！'), 100);
    }
  }, [isInitialScanComplete]);

  // Effect to save UI state (filters, sort, view mode) whenever it changes
  React.useEffect(() => {
    // Don't save until all states are initialized
    if (!settings || !filters || !sortOptions || !viewMode) {
      return;
    }
    
    // Create a new settings object with the latest UI state
    const newSettings = {
      ...settings,
      filters,
      sortOptions,
      viewMode,
    };

    // Only save if there's an actual change to prevent write loops
    // Note: This is a shallow comparison, but sufficient here.
    if (JSON.stringify(newSettings) !== JSON.stringify(settings)) {
      handleSettingsChange(newSettings);
    }
  }, [filters, sortOptions, viewMode]);

  React.useEffect(() => {
    // This effect now only fetches items when the scan is complete or the path changes.
    if (isInitialScanComplete) {
      fetchItems(currentVPath);
    }
  }, [isInitialScanComplete, currentVPath]);

  React.useEffect(() => {
    const handleAppStarted = (event, wallpaperId) => {
      setRunningApps(prev => new Set(prev).add(wallpaperId));
    };
    const handleAppStopped = (event, wallpaperId) => {
      setRunningApps(prev => {
        const newSet = new Set(prev);
        newSet.delete(wallpaperId);
        return newSet;
      });
    };

    ipcRenderer.on('app-started', handleAppStarted);
    ipcRenderer.on('app-stopped', handleAppStopped);

    return () => {
      ipcRenderer.removeListener('app-started', handleAppStarted);
      ipcRenderer.removeListener('app-stopped', handleAppStopped);
    };
  }, []);

  React.useEffect(() => {
    if (!filters) return;

    let itemsToProcess = [...allItems];

    // Step 0: Search if active. This runs before other filters.
    if (isSearchModeActive && searchQuery) {
      // Note: This searches only within the current folder view.
      itemsToProcess = searchWallpapers(searchQuery, itemsToProcess);
    }
    
    // Step 1: Filter by type and rating
    const filteredForDisplay = itemsToProcess.filter(item => {
      if (item.itemType === 'folder') {
        // Hide folders when searching, otherwise show them.
        return !isSearchModeActive;
      }
      const typeMatch = filters.type.length === 0 || (item.type && filters.type.includes(item.type.toLowerCase()));
      let rating = (item.rating || 'everyone').toLowerCase();
      if (rating === 'adult') rating = 'mature';
      const ratingMatch = filters.rating.length === 0 || filters.rating.includes(rating);
      return typeMatch && ratingMatch;
    });

    // Step 2: Sort
    const folders = filteredForDisplay.filter(item => item.itemType === 'folder');
    const wallpapers = filteredForDisplay.filter(item => item.itemType !== 'folder');
    const order = sortOptions.sortOrder === 'asc' ? 1 : -1;

    const sortFunction = (a, b) => {
      switch (sortOptions.sortBy) {
        case 'size':
          return ((a.size || 0) - (b.size || 0)) * order;
        case 'dateAdded':
           // Folders don't have dateAdded, so we sort them by title in this case
          if (a.itemType === 'folder') {
            return a.title.localeCompare(b.title) * order;
          }
          return ((a.dateAdded || 0) - (b.dateAdded || 0)) * order;
        case 'title':
        default:
          return a.title.localeCompare(b.title) * order;
      }
    };

    folders.sort(sortFunction);
    wallpapers.sort(sortFunction);

    setFilteredItems([...folders, ...wallpapers]);
  }, [filters, allItems, sortOptions, isSearchModeActive, searchQuery]);

  React.useEffect(() => {
    // Restore scroll position when items are loaded or view changes
    if ((currentView === 'grid' || currentView === 'list') && mainContentRef.current) {
        const scrollKey = `${viewMode}-${currentVPath}`;
        const savedPosition = scrollPositions.current[scrollKey] || 0;
        // Use a timeout to ensure the DOM has been updated before scrolling
        setTimeout(() => {
            if (mainContentRef.current) {
                mainContentRef.current.scrollTop = savedPosition;
            }
        }, 0);
    }
  }, [filteredItems, currentView, viewMode]);
  
  React.useEffect(() => {
    const handleClick = (e) => {
      // Always close context menu on any click
      setContextMenu(null);

      // Clear selection if clicking outside of a selectable item, but not on the select-all button
      if (selectedItems.size > 0 && !e.target.closest('.wallpaper-item, .wallpaper-list-item, .select-all-btn')) {
        setSelectedItems(new Set());
      }
    };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [selectedItems]);

  const showNotification = (message) => {
    const id = notificationIdCounter++;
    setNotifications(prev => [...prev, { id, message }]);
    setTimeout(() => setNotifications(prev => prev.filter(note => note.id !== id)), 3000);
  };

  const handleFilterChange = (filterGroup, value) => {
    const newFilters = { 
      ...filters, 
      [filterGroup]: filters[filterGroup].includes(value) 
        ? filters[filterGroup].filter(i => i !== value) 
        : [...filters[filterGroup], value] 
    };
    setFilters(newFilters);
    // The useEffect for saving will pick this change up.
  };

  const handleSortChange = (key, value) => {
    setSortOptions(prev => ({ ...prev, [key]: value }));
  };

  const handleWallpaperClick = (item, event) => {
    if (event.ctrlKey) {
      // Multi-select logic
      setSelectedItems(prev => {
        const newSelection = new Set(prev);
        if (newSelection.has(item.id)) {
          newSelection.delete(item.id);
        } else {
          newSelection.add(item.id);
        }
        return newSelection;
      });
      return; // Prevent default action
    }

    // Clear selection if not holding ctrl
    setSelectedItems(new Set());

    if (runningApps.has(item.id)) {
      showNotification(`"${item.title}" 正在运行中`);
      return;
    }

    const itemType = item.type.toLowerCase();

    if (itemType === 'application') {
      if (item.appPath) {
        const fullPath = item.folderPath + item.appPath;
        ipcRenderer.invoke('launch-app', item.id, fullPath);
      } else {
        showNotification('请先右键点击 "定位可执行文件"');
      }
    } else if (itemType === 'video' && item.video) {
      setPlayingVideoInfo({ src: item.video, title: item.title });
    } else if (itemType === 'scene') {
      // Find the project.json path
      const projectJsonPath = `${item.folderPath}\\project.json`;
      showNotification(`正在尝试预览场景: ${item.title}`);
      ipcRenderer.invoke('preview-scene', projectJsonPath).then(result => {
        if (!result.success && result.error) {
           showNotification(`预览失败: ${result.error}`, true);
        }
      });
    } else {
      showNotification(`"${item.type}" 类型不支持预览`);
    }
  };

  const handleFolderClick = (folder) => {
    setCurrentVPath(folder.vpath);
  };

  const handleContextMenu = (e, item) => {
    e.preventDefault();
    if (item.itemType === 'wallpaper' && runningApps.has(item.id)) return;

    // If right-clicking an item that is not part of the current selection,
    // clear the selection and select only the clicked item.
    if (!selectedItems.has(item.id)) {
      setSelectedItems(new Set([item.id]));
      setContextMenu({ x: e.clientX, y: e.clientY, item, isMultiSelect: false });
    } else {
      // If right-clicking an item that is part of the selection, show multi-select menu.
      setContextMenu({ x: e.clientX, y: e.clientY, item, isMultiSelect: true });
    }
  };

  const handleContextMenuAction = async (action, data) => {
    // Prioritize the item from the details modal (`data`) if it exists.
    const itemToProcess = data || (contextMenu ? contextMenu.item : null);
    if (!itemToProcess) return;

    // isMultiSelect is only true if the context menu was open for multiple items.
    const isMultiSelect = contextMenu ? contextMenu.isMultiSelect : false;
    
    // Always close the context menu if it was open.
    if (contextMenu) {
      setContextMenu(null);
    }

    switch (action) {
      case 'show-details':
        setDetailsModal({ isVisible: true, item: itemToProcess });
        break;
      case 'launch': // The 'launch' action now shares the same logic as 'preview'.
      case 'preview':
        // The click handler contains all the logic, just call it.
        handleWallpaperClick(itemToProcess, {});
        break;
      case 'locate':
        setBrowserConfig({
          isVisible: true,
          title: `为 "${itemToProcess.title}" 定位可执行文件`,
          rootPath: itemToProcess.folderPath,
          targetExtensions: ['.exe', '.bat'],
          onFileSelected: (selectedFilePath) => {
            handleFileSelected(selectedFilePath, itemToProcess);
            setBrowserConfig({ isVisible: false }); // Close browser
          }
        });
        break;
      case 'decompress':
        console.log('[前端] "浏览并解压" 功能启动，配置 LocalFileBrowser...');
        setBrowserConfig({
          isVisible: true,
          title: `为 "${itemToProcess.title}" 选择要解压的文件`,
          rootPath: itemToProcess.folderPath,
          targetExtensions: ['.zip', '.7z', '.rar', '.part1.rar', '.7z.001', '.z01'],
          onFileSelected: (selectedFilePath) => {
            console.log(`[前端] LocalFileBrowser 返回已选文件: ${selectedFilePath}`);
            const fileName = selectedFilePath.split(/[\\/]/).pop();
            setFileToDecompress({ path: selectedFilePath, name: fileName });
            setDecompressionModalVisible(true);
            setBrowserConfig({ isVisible: false });
          }
        });
        break;
      case 'show-notification': showNotification(data, true); break;
      case 'cleanup-zip':
        setBrowserConfig({
          isVisible: true,
          title: `选择要清理的压缩文件 (位于 "${itemToProcess.title}" 项目中)`,
          rootPath: itemToProcess.folderPath,
          targetExtensions: ['.zip', '.7z', '.rar', '.001', '.002', '.003', '.004', '.005', '.006', '.007', '.008', '.009', '.010'],
          onFileSelected: async (selectedFilePath) => {
            const fileName = selectedFilePath.split(/[\\/]/).pop();
            const isConfirmed = window.confirm(`您确定要将文件 "${fileName}" 移动到回收站吗？`);
            if (isConfirmed) {
              console.log(`[SENSITIVE ACTION] Requesting to delete file: ${selectedFilePath}`);
              const result = await ipcRenderer.invoke('delete-file-to-recycle-bin', selectedFilePath);
              if (result.success) {
                showNotification(`文件 "${fileName}" 已移至回收站。`);
              } else {
                showNotification(`删除失败: ${result.error}`, true);
              }
            }
            // Always close the browser after action
            setBrowserConfig({ isVisible: false });
          },
          onCancel: () => setBrowserConfig({ isVisible: false })
        });
        break;
      case 'open': ipcRenderer.invoke('open-folder', itemToProcess.folderPath); break;
      case 'open-in-workshop': ipcRenderer.invoke('open-in-workshop', itemToProcess.id); break;
      case 'delete': {
        console.log(`[SENSITIVE ACTION] Requesting to delete wallpaper: ${itemToProcess.title} (ID: ${itemToProcess.id})`);
        const result = await ipcRenderer.invoke('delete-folder', itemToProcess.folderPath, itemToProcess.id);
        if (result.success) {
          showNotification(`"${itemToProcess.title}" 已移至回收站`);
          fetchItems(currentVPath); // 轻量级刷新
        } else if (!result.cancelled) {
          showNotification(`删除失败: ${result.error}`);
        }
        break;
      }
      case 'move-wallpaper':
      case 'move-folder':
        setMovingItem(itemToProcess);
        break;
      case 'delete-folder': {
        // This is not a sensitive action as it only affects the database, so no log is needed.
        const deleteResult = await ipcRenderer.invoke('delete-virtual-folder', itemToProcess.vpath);
        if (deleteResult.success) {
          showNotification(`文件夹 "${itemToProcess.title}" 已删除`);
          fetchItems(currentVPath); // 轻量级刷新
        } else {
          showNotification(`删除失败: ${deleteResult.error}`);
        }
        break;
      }
      case 'move-multiple': {
        const firstSelectedItem = allItems.find(i => selectedItems.has(i.id));
        if (firstSelectedItem) {
          // We create a generic item for the move dialog
          setMovingItem({ 
            title: `${selectedItems.size} 个项目`, 
            isMultiple: true,
            ids: Array.from(selectedItems), // Pass the selected IDs
            // The following properties are needed to prevent crashes, but won't be used directly
            itemType: 'multiple', 
            id: 'multiple'
          });
        }
        break;
      }
      case 'open-multiple': {
        const selectedWallpapers = allItems.filter(i => selectedItems.has(i.id));
        for (const wallpaper of selectedWallpapers) {
          ipcRenderer.invoke('open-folder', wallpaper.folderPath);
        }
        break;
      }
      case 'batch-move': {
        const itemsToMove = isMultiSelect 
          ? allItems.filter(i => selectedItems.has(i.id))
          : [itemToProcess];
        const folderPaths = itemsToMove.map(i => i.folderPath);
        ipcRenderer.invoke('batch-move-folders', folderPaths).then(result => {
          if (result.success) {
            showNotification(`${result.movedCount} 个项目已成功移动。正在刷新...`);
            refreshItems();
          } else if (result.error) {
            showNotification(`移动失败: ${result.error}`, true);
          }
          // If cancelled, do nothing.
        });
        break;
      }
      case 'delete-multiple': {
        const isConfirmed = window.confirm(`你确定要删除选中的 ${selectedItems.size} 个项目吗？此操作不可逆！`);
        if (isConfirmed) {
          const itemsToDelete = allItems.filter(i => selectedItems.has(i.id));
          const idsToDelete = itemsToDelete.map(i => i.id);
          const folderPathsToDelete = itemsToDelete.map(i => i.folderPath);
          
          console.log(`[SENSITIVE ACTION] Requesting to delete multiple items. Count: ${idsToDelete.length}, IDs: ${idsToDelete.join(', ')}`);
          const result = await ipcRenderer.invoke('delete-multiple-folders', folderPathsToDelete, idsToDelete);
          if (result.success) {
            showNotification(`${result.deletedCount} 个项目已移至回收站`);
            fetchItems(currentVPath); // 轻量级刷新
            setSelectedItems(new Set());
          } else {
            showNotification(`删除失败: ${result.error}`);
          }
        }
        break;
      }
    }
  };

  const handleCreateFolder = (folderName) => {
    ipcRenderer.invoke('create-virtual-folder', folderName, currentVPath).then(result => {
      if (result.success) {
        showNotification(`文件夹 "${folderName}" 创建成功`);
        fetchItems(currentVPath); // 轻量级刷新
      } else {
        showNotification(`创建失败: ${result.error}`);
      }
      setIsCreatingFolder(false);
    });
  };

  const handleMoveItem = (targetVPath) => {
    if (!movingItem) return;

    const idsToMove = movingItem.isMultiple ? movingItem.ids : [movingItem.id];
    
    ipcRenderer.invoke('move-item', idsToMove, targetVPath).then(result => {
      if (result.success) {
        const message = `${result.movedCount || 0} 个项目移动成功`;
        showNotification(message);
        fetchItems(currentVPath); // 轻量级刷新
        if (movingItem.isMultiple) {
          setSelectedItems(new Set());
        }
      } else {
        showNotification(`移动失败: ${result.error}`);
      }
      setMovingItem(null);
    });
  };

  const handleFileSelected = (fullExePath, wallpaper) => {
    const relativePath = fullExePath.replace(wallpaper.folderPath, '');
    ipcRenderer.invoke('save-app-path', wallpaper.id, relativePath, wallpaper.type).then(() => {
      showNotification(`已为 "${wallpaper.title}" 定位成功`);
      // No need for a full refresh here, a simple fetch should suffice if the backend updates the cache.
      // However, a full refresh is safer if the type changes, so we'll keep it.
      refreshItems();
    });
  };

  // console.log(`[前端] App Render: allItems=${allItems.length}, filteredItems=${filteredItems.length}, loading=${loading}, initialScanComplete=${isInitialScanComplete}`);

  if (!isInitialScanComplete || !settings || !filters) {
    return React.createElement('h1', { style: { textAlign: 'center' } }, '正在扫描壁纸库...');
  }

  const handleNavigateToSettings = () => {
    if (mainContentRef.current) {
      const scrollKey = `${viewMode}-${currentVPath}`;
      scrollPositions.current[scrollKey] = mainContentRef.current.scrollTop;
    }
    setCurrentView('settings');
  };

  const handleGoBackFromSettings = (path) => {
    if (path && typeof path === 'string') {
      setCurrentVPath(path);
    }
    setCurrentView('grid');
    // Scroll restoration will be handled by the useEffect hook
  };

  const handleDatabaseCleared = () => {
    // Go back to root and refresh
    setCurrentVPath('./');
    refreshItems();
  };

  const handleSelectAll = () => {
    const allItemIds = new Set(filteredItems.filter(i => i.itemType !== 'folder').map(i => i.id));
    setSelectedItems(allItemIds);
  };

  const handleDeselectAll = () => {
    setSelectedItems(new Set());
  };

  const handleBatchMove = () => {
    if (selectedItems.size > 0) {
      setMovingItem({
        title: `${selectedItems.size} 个项目`,
        isMultiple: true,
        ids: Array.from(selectedItems),
        itemType: 'multiple',
        id: 'multiple'
      });
    }
  };

  const handleConfirmDecompression = async (filePath, password, deleteOriginal) => {
      const fileName = filePath.split(/[\\/]/).pop();
      showNotification(`正在开始解压 ${fileName}...`);
      setDecompressionModalVisible(false);
      setFileToDecompress(null);

      if (deleteOriginal) {
          console.log(`[SENSITIVE ACTION] Decompressing with delete option for: ${filePath}`);
      }

      const result = await ipcRenderer.invoke('decompress-archive', filePath, password, deleteOriginal);

      if (result.success) {
          showNotification('解压成功！正在刷新文件列表...');
          setLastUsedPassword(password);
          if (password && !commonPasswords.includes(password)) {
              ipcRenderer.invoke('add-common-password', password).then(res => {
                  if (res.success) setCommonPasswords(res.passwords);
              });
          }
          if (result.warning) {
              showNotification(result.warning, true);
          }
          refreshItems();
      } else {
          showNotification(`解压失败: ${result.error}`, true);
      }
  };

  const handleCloseDetailsModal = () => {
    setDetailsModal({ isVisible: false, item: null });
  };

  const handleSaveDetails = (id, data) => {
    // console.log(`[前端] 正在保存 ID: ${id} 的详细信息, 数据:`, data);
    ipcRenderer.invoke('save-wallpaper-details', id, data).then(result => {
      if (result.success) {
        showNotification('详细信息已保存。');
        // Optimistically update the item in the local state
        setAllItems(prevItems =>
          prevItems.map(item => (item.id === id ? { ...item, ...data } : item))
        );
        // Close the modal after a successful save
        handleCloseDetailsModal();
      } else {
        showNotification(`保存失败: ${result.error}`, true);
      }
    });
  };

  const renderMainView = () => {
    if (currentView === 'settings') {
      return React.createElement(SettingsPage, { 
        onGoBack: handleGoBackFromSettings, 
        showNotification,
        onDatabaseCleared: handleDatabaseCleared,
        settings: settings,
        onSettingsChange: handleSettingsChange
      });
    }

    const mainViewComponent = viewMode === 'grid'
      ? React.createElement(WallpaperGrid, { items: filteredItems, onWallpaperClick: handleWallpaperClick, onFolderClick: handleFolderClick, onContextMenu: handleContextMenu, runningApps: runningApps, selectedItems: selectedItems })
      : React.createElement(WallpaperList, { items: filteredItems, onWallpaperClick: handleWallpaperClick, onFolderClick: handleFolderClick, onContextMenu: handleContextMenu, runningApps: runningApps, selectedItems: selectedItems });

    return React.createElement(React.Fragment, null, 
      React.createElement(Header, { 
        currentVPath: currentVPath, 
        onNavigate: setCurrentVPath, 
        onNewFolder: () => setIsCreatingFolder(true),
        viewMode: viewMode,
        onViewModeChange: setViewMode,
        onSelectAll: handleSelectAll,
        onDeselectAll: handleDeselectAll,
        numItems: filteredItems.filter(i => i.itemType !== 'folder').length,
        numSelected: selectedItems.size,
        isSearchModeActive: isSearchModeActive,
        onSearchToggle: () => setIsSearchModeActive(!isSearchModeActive),
        searchQuery: searchQuery,
        onSearchQueryChange: setSearchQuery,
        onBatchMove: handleBatchMove,
        onImportWallpaper: () => setImportModalVisible(true)
      }),
      mainViewComponent
    );
  };
  
  const isOverlayActive = movingItem || browserConfig.isVisible || isDecompressionModalVisible || detailsModal.isVisible || isImportModalVisible;

  return React.createElement(React.Fragment, null,
    React.createElement('div', { className: 'app-container' },
      React.createElement(Sidebar, { 
        filters, 
        onFilterChange: handleFilterChange, 
        sortOptions,
        onSortChange: handleSortChange,
        onRefresh: refreshItems, 
        onNavigateToSettings: handleNavigateToSettings,
        isActionInProgress: !!movingItem
      }),
      React.createElement('div', { 
        className: 'main-content', 
        ref: mainContentRef,
        onScroll: (e) => {
            if (currentView === 'grid' || currentView === 'list') {
                const scrollKey = `${viewMode}-${currentVPath}`;
                scrollPositions.current[scrollKey] = e.target.scrollTop;
            }
        }
      }, renderMainView()),
      // Overlays are now rendered here, outside the main content flow
      isOverlayActive && React.createElement('div', { className: 'overlay-container' },
        movingItem && React.createElement(VirtualFolderBrowser, { itemToMove: movingItem, onMoveConfirm: handleMoveItem, onCancel: () => setMovingItem(null) }),
        browserConfig.isVisible && React.createElement(LocalFileBrowser, {
            title: browserConfig.title,
            rootPath: browserConfig.rootPath,
            targetExtensions: browserConfig.targetExtensions,
            onFileSelected: browserConfig.onFileSelected,
            onCancel: browserConfig.onCancel || (() => setBrowserConfig({ isVisible: false }))
        }),
        isDecompressionModalVisible && React.createElement(DecompressionModal, {
            file: fileToDecompress,
            onConfirm: handleConfirmDecompression,
            onCancel: () => {
                setDecompressionModalVisible(false);
                setFileToDecompress(null);
            },
            commonPasswords: commonPasswords,
            lastUsedPassword: lastUsedPassword
        }),
        detailsModal.isVisible && React.createElement(DetailsModal, {
            item: detailsModal.item,
            onClose: handleCloseDetailsModal,
            onSave: handleSaveDetails,
            onAction: handleContextMenuAction,
            settings: settings // Pass settings down to the modal
        }),
        isImportModalVisible && React.createElement(ImportModal, {
            onClose: () => setImportModalVisible(false),
            onImportSuccess: () => {
                setImportModalVisible(false);
                refreshItems();
            }
        })
      )
    ),
    isCreatingFolder && React.createElement(NewFolderModal, { onConfirm: handleCreateFolder, onCancel: () => setIsCreatingFolder(false) }),
    React.createElement(VideoPlayer, {
      src: playingVideoInfo ? playingVideoInfo.src : null,
      title: playingVideoInfo ? playingVideoInfo.title : null,
      onClose: () => setPlayingVideoInfo(null),
      showNotification: showNotification
    }),
    React.createElement(NotificationContainer, { notifications: notifications }),
    React.createElement(ContextMenu, { menu: contextMenu, onAction: handleContextMenuAction, selectedItems: selectedItems, settings: settings })
  );
};

const rootElement = document.getElementById('root');
const root = createRoot(rootElement);
root.render(React.createElement(App));
