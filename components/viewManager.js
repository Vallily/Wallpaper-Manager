const React = require('react');
const { ipcRenderer } = require('electron');
const { WallpaperGrid } = require('./mainPage.js');

// Helper function to find a node in the VFS tree, ensuring client-side navigation
const findNodeByVfsPath = (tree, vpath) => {
  if (!tree) return null;
  // Handle root case
  if (vpath === './' || vpath === '/') return tree;
  // Normalize path and split into parts
  const parts = vpath.replace(/^\.\//, '').replace(/\/$/, '').split('/').filter(Boolean);
  let currentNode = tree;
  for (const part of parts) {
    if (!part) continue;
    if (!currentNode || !currentNode.children) return null;
    const nextNode = currentNode.children.find(c => c.type === 'folder' && c.name === part);
    if (!nextNode) return null;
    currentNode = nextNode;
  }
  return currentNode;
};

const VirtualFolderBrowser = ({ itemToMove, onMoveConfirm, onCancel }) => {
  const [currentVPath, setCurrentVPath] = React.useState('./');
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [vfsTree, setVfsTree] = React.useState(null); // State for the full tree

  // Effect to load the full VFS tree once on mount
  React.useEffect(() => {
    setLoading(true);
    ipcRenderer.invoke('get-full-vfs-tree').then(tree => {
      setVfsTree(tree);
    }).catch(err => {
      console.error("Failed to load full VFS tree:", err);
      setVfsTree(null);
      setLoading(false);
    });
  }, []);

  // Effect to update displayed items when path or tree changes
  React.useEffect(() => {
    if (!vfsTree) return; // Wait for the tree to be loaded

    const currentNode = findNodeByVfsPath(vfsTree, currentVPath);
    let displayItems = [];

    if (currentNode && currentNode.children) {
      displayItems = currentNode.children
        .filter(child => child.type === 'folder')
        .map(child => ({
          id: `vfolder_${currentVPath}_${child.name}`,
          itemType: 'folder',
          title: child.name,
          vpath: (currentVPath === './' ? './' : currentVPath) + child.name + '/',
          size: child.size || 0
        }));
    }
    
    // Filter out the item being moved
    const filteredData = displayItems.filter(i => {
        if (itemToMove.itemType === 'folder') {
            return i.vpath !== itemToMove.vpath;
        }
        return true;
    });

    setItems(filteredData);
    setLoading(false);
  }, [currentVPath, vfsTree, itemToMove]);

  const handleFolderClick = (folder) => {
    setCurrentVPath(folder.vpath);
  };

  const handleMoveHere = () => {
    onMoveConfirm(currentVPath);
  };
  
  const pathParts = currentVPath.replace(/^\.\/|\/$/g, '').split('/').filter(p => p);
  const handlePathClick = (index) => {
    const newPath = './' + pathParts.slice(0, index + 1).join('/') + '/';
    setCurrentVPath(newPath);
  };
  const handleGoBack = () => {
    if (currentVPath === './') return;
    const parentPath = currentVPath.slice(0, -1).substring(0, currentVPath.slice(0, -1).lastIndexOf('/') + 1);
    setCurrentVPath(parentPath || './');
  };

  // Prevent moving a folder into itself or its children
  const isMoveDisabled = itemToMove.itemType === 'folder' && currentVPath.startsWith(itemToMove.vpath);

  return React.createElement('div', { className: 'file-browser' },
    React.createElement('div', { className: 'file-browser-header' },
      React.createElement('h2', null, `移动 "${itemToMove.title}"`),
      React.createElement('div', { style: { display: 'flex', gap: '10px' } },
        React.createElement('button', { onClick: handleMoveHere, disabled: isMoveDisabled, className: 'move-here-btn' }, '移动到这里'),
        React.createElement('button', { onClick: onCancel, className: 'modal-btn-cancel' }, '取消')
      )
    ),
    React.createElement('div', { className: 'file-browser-nav' },
       React.createElement('button', { onClick: handleGoBack, disabled: currentVPath === './' }, '↑'),
       React.createElement('div', { className: 'breadcrumbs' },
        React.createElement('span', { onClick: () => setCurrentVPath('./'), className: 'breadcrumb-part' }, '根目录'),
        pathParts.map((part, index) =>
          React.createElement(React.Fragment, { key: index },
            React.createElement('span', { className: 'breadcrumb-separator' }, '/'),
            React.createElement('span', { onClick: () => handlePathClick(index), className: 'breadcrumb-part' }, part)
          )
        )
      )
    ),
    React.createElement(WallpaperGrid, {
      items: items,
      onFolderClick: handleFolderClick,
      onWallpaperClick: () => {}, // No-op in browser mode
      onContextMenu: () => {}, // No-op in browser mode
      runningApps: new Set(),
      selectedItems: new Set(),
      isBrowserMode: true // Explicitly tell the grid to only show folders
    })
  );
};

const NewFolderModal = ({ onConfirm, onCancel }) => {
  const [folderName, setFolderName] = React.useState('');
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleConfirm = () => {
    if (folderName.trim()) {
      onConfirm(folderName.trim());
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleConfirm();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return React.createElement('div', { className: 'modal-overlay' },
    React.createElement('div', { className: 'modal-content' },
      React.createElement('h2', null, '新建文件夹'),
      React.createElement('p', null, '请输入新文件夹的名称:'),
      React.createElement('input', {
        ref: inputRef,
        type: 'text',
        value: folderName,
        onChange: (e) => setFolderName(e.target.value),
        onKeyDown: handleKeyDown,
        className: 'modal-input'
      }),
      React.createElement('div', { className: 'modal-actions' },
        React.createElement('button', { onClick: onCancel, className: 'modal-btn-cancel' }, '取消'),
        React.createElement('button', { onClick: handleConfirm, className: 'modal-btn-confirm' }, '创建')
      )
    )
  );
};

const DecompressionModal = ({ file, onConfirm, onCancel, commonPasswords, lastUsedPassword }) => {
  const [password, setPassword] = React.useState(lastUsedPassword || '');
  const [deleteOriginal, setDeleteOriginal] = React.useState(false);
  const [showSuggestions, setShowSuggestions] = React.useState(false);
  const inputRef = React.useRef(null);
  const wrapperRef = React.useRef(null);

  React.useEffect(() => {
    // Add event listener to handle clicks outside the component
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleConfirm = () => {
    onConfirm(file.path, password, deleteOriginal);
  };

  const handleSuggestionClick = (suggestedPassword) => {
    setPassword(suggestedPassword);
    setShowSuggestions(false);
    if (inputRef.current) {
      inputRef.current.blur(); // Change focus() to blur()
    }
  };

  return React.createElement('div', { className: 'modal-overlay' },
    React.createElement('div', { className: 'modal-content' },
      React.createElement('h2', null, '确认解压'),
      React.createElement('p', null, `你确定要将文件 "${file.name}" 解压到当前目录吗？`),
      
      React.createElement('div', { className: 'setting-item-column' },
        React.createElement('label', { htmlFor: 'decompression-password' }, '密码:'),
        React.createElement('div', { className: 'password-input-container', ref: wrapperRef },
          React.createElement('input', {
            ref: inputRef,
            id: 'decompression-password',
            className: 'password-input-beautified',
            type: 'text',
            value: password,
            onChange: (e) => setPassword(e.target.value),
            onFocus: () => setShowSuggestions(true),
            onKeyDown: (e) => {
              if (e.key === 'Enter') handleConfirm();
              if (e.key === 'Escape') onCancel();
            },
            placeholder: '输入密码或从建议中选择'
          }),
          React.createElement('div', { 
            className: `password-suggestions ${showSuggestions && commonPasswords && commonPasswords.length > 0 ? 'visible' : ''}` 
          },
            [...(commonPasswords || [])].reverse().map(p => 
              React.createElement('div', { 
                key: p, 
                className: 'suggestion-item',
                onClick: () => handleSuggestionClick(p)
              }, p)
            )
          )
        )
      ),

      React.createElement('div', { className: 'setting-item' },
        React.createElement('label', { htmlFor: 'delete-original-archive' }, '解压后删除源文件'),
        React.createElement('input', {
          id: 'delete-original-archive',
          type: 'checkbox',
          checked: deleteOriginal,
          onChange: (e) => setDeleteOriginal(e.target.checked)
        })
      ),
      deleteOriginal && React.createElement('p', { className: 'settings-warning' }, '警告：源文件将被移动到系统回收站。'),
      React.createElement('div', { className: 'modal-actions' },
        React.createElement('button', { onClick: onCancel, className: 'modal-btn-cancel' }, '取消'),
        React.createElement('button', { onClick: handleConfirm, className: 'modal-btn-confirm' }, '确认解压')
      )
    )
  );
};

module.exports = {
  VirtualFolderBrowser,
  NewFolderModal,
  DecompressionModal
};
