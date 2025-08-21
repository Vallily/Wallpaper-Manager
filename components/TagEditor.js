const React = require('react');

// --- 标签预设选择器组件 (内部使用) ---
const TagPresetPicker = ({ presetTags, onTagSelect, onClose }) => {
  if (!presetTags || presetTags.length === 0) {
    return null;
  }

  const [activeGroup, setActiveGroup] = React.useState(presetTags[0]?.groupName);
  const pickerRef = React.useRef(null);

  React.useEffect(() => {
    const handleClickOutside = (event) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  const handleTagClick = (tag) => {
    onTagSelect(tag);
  };

  return React.createElement('div', { ref: pickerRef, className: 'tag-preset-picker' },
    React.createElement('div', { className: 'tag-preset-header' },
      presetTags.map(group =>
        React.createElement('button', {
          type: 'button', // 防止表单提交
          key: group.groupName,
          className: `tag-preset-group-btn ${activeGroup === group.groupName ? 'active' : ''}`,
          onClick: () => setActiveGroup(group.groupName)
        }, group.groupName)
      )
    ),
    React.createElement('div', { className: 'tag-preset-body' },
      (presetTags.find(g => g.groupName === activeGroup)?.tags || []).map(tag =>
        React.createElement('div', {
          key: tag.name,
          className: 'tag-item',
          style: { backgroundColor: tag.color },
          onClick: () => handleTagClick(tag)
        },
          React.createElement('span', null, tag.name)
        )
      )
    )
  );
};

// --- 可复用的标签编辑器组件 ---
const TagEditor = ({ tags, presetTags, onTagsChange }) => {
  const [isPresetPickerVisible, setIsPresetPickerVisible] = React.useState(false);
  const presetTagsFlat = React.useMemo(() => (presetTags || []).flatMap(group => group.tags), [presetTags]);

  const getRandomColor = () => {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
  };

  const handleAddTag = (tag) => {
    const tagName = typeof tag === 'string' ? tag : tag.name;
    if (tagName && !tags.some(t => t.name === tagName)) {
      let newTag;
      if (typeof tag === 'object' && tag.name && tag.color) {
        newTag = tag;
      } else {
        const preset = presetTagsFlat.find(p => p.name === tagName);
        newTag = {
          name: tagName,
          color: preset ? preset.color : getRandomColor()
        };
      }
      onTagsChange([...tags, newTag]);
    }
  };

  const handleRemoveTag = (tagToRemove) => {
    onTagsChange(tags.filter(tag => tag.name !== tagToRemove.name));
  };

  return React.createElement('div', { className: 'tags-input-wrapper' },
    isPresetPickerVisible && React.createElement(TagPresetPicker, {
      presetTags: presetTags,
      onTagSelect: (tag) => handleAddTag(tag),
      onClose: () => setIsPresetPickerVisible(false)
    }),
    React.createElement('div', { className: 'tags-container' },
      tags.map(tag =>
        React.createElement('div', { key: tag.name, className: 'tag-item', style: { backgroundColor: tag.color } },
          React.createElement('span', null, tag.name),
          React.createElement('button', { type: 'button', className: 'tag-remove-btn', onClick: () => handleRemoveTag(tag) }, '×')
        )
      ),
      React.createElement('input', {
        type: 'text',
        placeholder: '+ 添加标签',
        className: 'add-tag-input',
        onKeyDown: (e) => {
          if (e.key === 'Enter' && e.target.value.trim()) {
            e.preventDefault(); // 阻止回车键的默认行为（如提交表单）
            handleAddTag(e.target.value.trim());
            e.target.value = '';
          }
        }
      })
    ),
    React.createElement('button', {
      type: 'button', // 关键修复：防止按钮作为 submit 类型触发表单提交
      className: 'tag-preset-toggle-btn-embedded',
      onClick: () => setIsPresetPickerVisible(!isPresetPickerVisible)
    })
  );
};

module.exports = { TagEditor };
