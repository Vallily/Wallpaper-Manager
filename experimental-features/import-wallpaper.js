const fs = require('fs').promises;
const path = require('path');

/**
 * 递归计算目录的总大小。
 * @param {string} dirPath - 目录路径。
 * @returns {Promise<number>} - 目录的总字节大小。
 */
async function getDirectorySize(dirPath) {
  let totalSize = 0;
  try {
    const items = await fs.readdir(dirPath, { withFileTypes: true });
    for (const item of items) {
      const itemPath = path.join(dirPath, item.name);
      if (item.isDirectory()) {
        totalSize += await getDirectorySize(itemPath);
      } else if (item.isFile()) {
        const stats = await fs.stat(itemPath);
        totalSize += stats.size;
      }
    }
  } catch (err) {
    console.error(`Error calculating size for ${dirPath}:`, err);
  }
  return totalSize;
}

/**
 * 递归地统计文件数量和类型。
 * @param {string} dirPath - 要扫描的目录路径。
 * @returns {Promise<{count: number, types: object}>} - 包含文件总数和类型计数的对象。
 */
async function countFilesAndTypesRecursively(dirPath) {
    let fileCount = 0;
    const typeCounts = { mp4: 0, pkg: 0, exe: 0, html: 0 };
    try {
        const items = await fs.readdir(dirPath, { withFileTypes: true });
        for (const item of items) {
            const fullPath = path.join(dirPath, item.name);
            if (item.isDirectory()) {
                const subDirResult = await countFilesAndTypesRecursively(fullPath);
                fileCount += subDirResult.count;
                Object.keys(typeCounts).forEach(key => {
                    typeCounts[key] += subDirResult.types[key];
                });
            } else if (item.isFile()) {
                fileCount++;
                const ext = path.extname(item.name).toLowerCase();
                if (ext === '.mp4') typeCounts.mp4++;
                else if (ext === '.pkg') typeCounts.pkg++;
                else if (ext === '.exe') typeCounts.exe++;
                else if (ext === '.html') typeCounts.html++;
            }
        }
    } catch (err) {
        console.error(`Error counting files in ${dirPath}:`, err);
    }
    return { count: fileCount, types: typeCounts };
}

/**
 * 为新壁纸生成一个唯一的 ID。
 * @param {string} sourcePath - 源文件夹的完整路径。
 * @param {object | null} projectData - 从 project.json 读取的数据，可能为 null。
 * @param {string[]} existingIds - 当前所有已存在的壁纸ID列表。
 * @returns {string} - 生成的唯一ID。
 */
function generateNewWallpaperId(sourcePath, projectData, existingIds) {
  // 防御性检查，确保 existingIds 是一个数组
  const safeExistingIds = existingIds || [];

  // 优先级 1: 检查 project.json 中的 workshopid
  if (projectData && projectData.workshopid) {
    const workshopId = String(projectData.workshopid).trim();
    if (/^\d+$/.test(workshopId) && !safeExistingIds.includes(workshopId)) {
      return workshopId;
    }
  }

  // 优先级 2: 检查文件夹名称是否为纯数字
  const folderName = path.basename(sourcePath);
  if (/^\d+$/.test(folderName) && !safeExistingIds.includes(folderName)) {
    return folderName;
  }

  // 优先级 3: 生成一个新的、以 '0' 开头的本地ID，以避免与创意工坊ID冲突
  const localGeneratedIds = safeExistingIds
    .filter(id => id.startsWith('0') && /^\d{10}$/.test(id)) // 仅筛选10位且以'0'开头的ID
    .map(id => parseInt(id, 10)) // 转换为数字以便排序和比较
    .sort((a, b) => a - b); // 排序是查找ID空洞的关键

  let newIdNumber = 1; // 从本地ID '1' (即 '0000000001') 开始查找

  // 遍历已排序的本地ID，找到第一个未被使用的ID（即“空洞”）
  for (const id of localGeneratedIds) {
    if (id === newIdNumber) {
      newIdNumber++; // 如果当前ID已被占用，则检查下一个
    } else {
      // 找到了第一个空洞 (例如，存在1, 3, 4，那么当id为3时，newIdNumber为2，循环中断)
      break;
    }
  }

  // 将找到的数字ID格式化为10位字符串，不足的前面补'0'
  return String(newIdNumber).padStart(10, '0');
}

/**
 * 扫描指定的导入文件夹，收集元数据信息。
 * @param {string} folderPath - 要扫描的文件夹路径。
 * @param {string[]} existingIds - 用于生成ID的现有ID列表。
 * @returns {Promise<object>} - 包含扫描信息的对象。
 */
async function scanImportFolder(folderPath, existingIds) {
  try {
    // 1. 读取 project.json (优先)
    let projectData = null;
    const projectJsonPath = path.join(folderPath, 'project.json');
    try {
      const content = await fs.readFile(projectJsonPath, 'utf-8');
      projectData = JSON.parse(content);
    } catch (error) {
      // 找不到或无法解析是正常情况
    }

    // 新增：验证预览文件是否存在
    if (projectData && projectData.preview) {
      const previewFullPath = path.join(folderPath, projectData.preview);
      try {
        await fs.access(previewFullPath); // 检查文件是否存在且可访问
      } catch (e) {
        console.warn(`[导入扫描] 在 "${folderPath}" 中找不到预览文件 "${projectData.preview}"，将忽略。`);
        projectData.preview = null; // 如果文件不存在，则清空预览信息
      }
    }

    // 2. 统计文件和大小
    const size = await getDirectorySize(folderPath);
    const fileStats = await countFilesAndTypesRecursively(folderPath);
    
    // 3. 生成最终 ID
    const id = generateNewWallpaperId(folderPath, projectData, existingIds);

    const result = {
      size,
      mtime: (await fs.stat(folderPath)).mtimeMs,
      fileCount: fileStats.count,
      typeCounts: fileStats.types,
      projectData,
      id,
    };

    return { success: true, data: result };
  } catch (error) {
    console.error(`Error scanning import folder "${folderPath}":`, error);
    return { success: false, error: `扫描文件夹失败: ${error.message}` };
  }
}

/**
 * 处理壁纸导入的核心流程。
 * @param {object} importData - 包含所有导入信息的对象。
 * @param {string} importData.sourcePath - 源文件夹路径。
 * @param {object} importData.metadata - 用户确认的元数据，其中应包含id。
 * @param {object} dependencies - 包含所有外部依赖的对象。
 * @returns {Promise<object>} - 包含成功状态和新壁纸ID的结果对象。
 */
async function processWallpaperImport(importData, dependencies) {
  const { sourcePath, metadata } = importData;
  const { wallpaperDir, vfsData, robustMove, writeVfsDb } = dependencies;
  
  const newWallpaperId = metadata.id; // 直接从元数据中获取最终确定的ID

  if (!newWallpaperId) {
    return { success: false, error: '导入数据中缺少壁纸ID。' };
  }

  try {
    // 1. 移动文件
    const targetPath = path.join(wallpaperDir, newWallpaperId);
    const moveResult = await robustMove(sourcePath, targetPath);
    if (!moveResult.success) {
      throw new Error(moveResult.error || '文件移动失败。');
    }

    // 2. 更新数据库，并严格保证字段顺序以保持数据一致性
    const newMeta = {
      mtime: Date.now(),
      size: metadata.size,
      title: metadata.title,
      type: metadata.type.toLowerCase(),
      rating: metadata.rating,
      preview: metadata.preview,
      tags: metadata.tags || [],
      notes: metadata.notes || "",
      description: metadata.description || ""
    };

    // 如果存在 file 字段（通常用于视频），则添加它
    if (metadata.file) {
      newMeta.file = metadata.file;
    }

    vfsData.wallpapers_meta[newWallpaperId] = newMeta;
    
    // 确保不重复添加
    if (!vfsData.vfs_tree.children.some(child => child.id === newWallpaperId)) {
        vfsData.vfs_tree.children.push({
            id: newWallpaperId,
            type: metadata.type.toLowerCase(),
        });
    }

    // 3. 写入数据库
    await writeVfsDb();

    return { success: true, wallpaperId: newWallpaperId };

  } catch (error) {
    console.error('处理壁纸导入时发生错误:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  scanImportFolder,
  processWallpaperImport,
};
