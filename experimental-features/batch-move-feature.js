const { dialog } = require('electron');
const fs = require('fs');
const path = require('path');

/**
 * Moves a file or directory, handling cross-device operations gracefully.
 * Uses fs.rename for same-device moves (fast) and a copy-then-delete
 * strategy for cross-device moves.
 * 
 * @param {string} source The source path of the file or directory.
 * @param {string} destination The destination path.
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function moveFileOrDirectory(source, destination) {
  console.log(`[移动] 开始移动: ${path.basename(source)}`);
  console.log(`[移动] 源路径: ${source}`);
  console.log(`[移动] 目标路径: ${destination}`);
  
  try {
    const isSameDevice = path.parse(path.resolve(source)).root === path.parse(path.resolve(destination)).root;

    if (isSameDevice) {
      console.log('[移动] 检测到同盘移动，使用快速重命名。');
      await fs.promises.rename(source, destination);
      console.log('[移动] 重命名成功。');
    } else {
      console.log('[移动] 检测到跨盘移动，使用“先复制后删除”策略。');
      
      console.log('[移动] 开始复制...');
      await fs.promises.cp(source, destination, { recursive: true });
      console.log('[移动] 复制成功。');
      
      console.log('[移动] 开始删除源文件...');
      await fs.promises.rm(source, { recursive: true, force: true });
      console.log('[移动] 源文件删除成功。');
    }
    
    console.log(`[移动] 成功移动 ${path.basename(source)}。`);
    return { success: true };
  } catch (error) {
    console.error(`[移动] 从 ${source} 移动到 ${destination} 失败:`, error);
    return { success: false, error: error.message };
  }
}

async function batchMove(mainWindow, sourceFolderPaths) {
  if (!sourceFolderPaths || sourceFolderPaths.length === 0) {
    return { success: false, error: '没有提供要移动的文件夹路径。' };
  }

  const dialogResult = await dialog.showOpenDialog(mainWindow, {
    title: '选择目标文件夹',
    properties: ['openDirectory']
  });

  if (dialogResult.canceled || dialogResult.filePaths.length === 0) {
    return { success: false, cancelled: true, error: '用户取消了操作。' };
  }

  const targetPath = dialogResult.filePaths[0];

  const confirmResult = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    buttons: ['确认移动', '取消'],
    defaultId: 0,
    cancelId: 1,
    title: '确认物理转移',
    message: `您确定要将 ${sourceFolderPaths.length} 个壁纸文件夹物理移动到以下位置吗？`,
    detail: `目标路径: ${targetPath}\n\n此操作会直接修改您硬盘上的文件，且不可撤销。`
  });

  if (confirmResult.response === 1) {
    return { success: false, cancelled: true, error: '用户取消了操作。' };
  }

  let movedCount = 0;
  const errors = [];
  const totalItems = sourceFolderPaths.length;

  for (const [index, sourcePath] of sourceFolderPaths.entries()) {
    const folderName = path.basename(sourcePath);
    // 向渲染器进程发送进度更新
    mainWindow.webContents.send('batch-move-progress', {
      current: index + 1,
      total: totalItems,
      fileName: folderName,
    });

    try {
      const destinationPath = path.join(targetPath, folderName);
      
      if (fs.existsSync(destinationPath)) {
        const warning = `目标路径 ${destinationPath} 已存在，跳过移动 ${sourcePath}`;
        console.warn(warning);
        errors.push(warning);
        continue;
      }

      // 使用稳健的移动函数
      const moveResult = await moveFileOrDirectory(sourcePath, destinationPath);
      if (moveResult.success) {
        movedCount++;
      } else {
        throw new Error(moveResult.error);
      }
    } catch (err) {
      console.error(`移动文件夹 ${sourcePath} 到 ${targetPath} 失败:`, err);
      errors.push(`移动文件 "${folderName}" 时出错: ${err.message}`);
    }
  }

  if (errors.length > 0) {
      return { success: false, error: errors.join('\n'), movedCount };
  }
  
  return { success: true, movedCount };
}

module.exports = {
  batchMove,
  moveFileOrDirectory, // Export the utility function
};
