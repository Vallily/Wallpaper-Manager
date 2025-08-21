const React = require('react');

const PlaylistSidebar = ({
  isVisible,
  playlist,
  currentIndex,
  onTrackSelect,
  onClose
}) => {
  if (!isVisible) {
    return null;
  }

  const overlayClass = `playlist-sidebar-overlay ${isVisible ? 'visible' : ''}`;

  // Helper to extract just the filename from a path, removing URL queries
  const getFileName = (path) => {
    if (typeof path !== 'string') return '';
    const fileNameWithQuery = path.split(/[\\/]/).pop();
    return decodeURIComponent(fileNameWithQuery.split('?')[0]);
  };

  return React.createElement('div', { className: overlayClass, onClick: onClose },
    React.createElement('div', { className: 'playlist-sidebar', onClick: e => e.stopPropagation() },
      React.createElement('div', { className: 'playlist-header' },
        React.createElement('h3', null, '播放列表'),
        React.createElement('button', { className: 'close-btn', onClick: onClose }, '✕')
      ),
      React.createElement('ul', { className: 'playlist-items' },
        playlist.map((track, index) => {
          const isActive = index === currentIndex;
          return React.createElement('li', {
            key: index,
            className: `playlist-item ${isActive ? 'active' : ''}`,
            onDoubleClick: () => onTrackSelect(index)
          }, getFileName(track));
        })
      )
    )
  );
};

module.exports = { PlaylistSidebar };
