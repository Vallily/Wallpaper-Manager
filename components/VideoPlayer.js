const React = require('react');
const { useState, useRef, useEffect } = React;
const { ipcRenderer } = require('electron');
const { PlaylistSidebar } = require('./PlaylistSidebar');

// Helper function to format time from seconds to HH:MM:SS or MM:SS
const formatTime = (timeInSeconds) => {
  if (isNaN(timeInSeconds)) {
    return '00:00';
  }
  const date = new Date(null);
  date.setSeconds(timeInSeconds);
  const timeString = date.toISOString().substr(11, 8);
  // Don't show hours if the video is less than an hour long
  return timeString.startsWith('00:') ? timeString.substr(3) : timeString;
};

const VideoPlayer = ({ src, onClose, title, showNotification }) => {
  const [isPlaying, setIsPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [playMode, setPlayMode] = useState('sequence'); // 'sequence', 'loop', 'random'
  const [playlist, setPlaylist] = useState(null);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isPlaylistVisible, setIsPlaylistVisible] = useState(false);
  
  const videoRef = useRef(null);
  const playerContainerRef = useRef(null);
  const controlsTimeoutRef = useRef(null);
  const isInitialMount = useRef(true);
  const animationFrameRef = useRef(null);
  const keydownIntervalRef = useRef(null); // For long-press fast forward/rewind
  const pressedKeys = useRef(new Set()); // To track currently pressed keys
  const playlistIdRef = useRef(null); // To store the identifier of the current playlist

  useEffect(() => {
    // Show notification when a new playlist starts playing
    if (Array.isArray(src) && showNotification && title) {
        // Use the first item's path as a unique ID for the playlist
        const currentPlaylistId = src.length > 0 ? src[0] : null;
        if (currentPlaylistId && playlistIdRef.current !== currentPlaylistId) {
            showNotification(`正在播放视频合集: ${title}`);
            playlistIdRef.current = currentPlaylistId;
        }
    } else {
        // Reset when not playing a playlist
        playlistIdRef.current = null;
    }
  }, [src, title, showNotification]);

  // Effect for loading and saving volume and play mode
  useEffect(() => {
    // Load volume
    ipcRenderer.invoke('get-video-player-volume').then(savedVolume => {
        if (typeof savedVolume === 'number') {
            setVolume(savedVolume);
            if (videoRef.current) {
                videoRef.current.volume = savedVolume;
            }
        }
    });
    // Load play mode
    ipcRenderer.invoke('get-video-play-mode').then(savedPlayMode => {
        if (savedPlayMode) {
            setPlayMode(savedPlayMode);
        }
    });
  }, []); // Empty dependency array, runs only once on mount

  useEffect(() => {
    // Don't save on the initial render, only on subsequent user changes.
    if (isInitialMount.current) {
        // This ref is now only for volume, as playMode has its own effect.
        // Let's keep it simple and let both settings save on first change.
    }
    // On subsequent volume changes, save it to the main process
    ipcRenderer.send('set-video-player-volume', volume);
  }, [volume]); // Runs whenever the volume state changes

  useEffect(() => {
    // Save play mode when it changes
    // Don't save on initial mount
    if (isInitialMount.current) {
      // We can use the same ref to prevent initial save for both
      isInitialMount.current = false;
      return;
    }
    ipcRenderer.send('set-video-play-mode', playMode);
  }, [playMode]);

  // Effect to update video properties when playMode changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.loop = playMode === 'loop';
  }, [playMode, src]); // Also depends on src to re-apply on video change

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Determine the source URL based on whether src is a playlist or single file
    let currentSrc;
    if (Array.isArray(src)) {
      // If it's the first time for this playlist, set it up
      if (playlist !== src) {
        setPlaylist(src);
        setCurrentTrackIndex(0);
        currentSrc = src[0];
      } else {
        // Otherwise, use the current track in the existing playlist
        currentSrc = src[currentTrackIndex];
      }
    } else {
      // If it's a single file, reset the playlist
      if (playlist !== null) {
        setPlaylist(null);
      }
      currentSrc = src;
    }

    // Set the source only if it has actually changed
    if (video.src !== currentSrc && currentSrc) {
        video.src = currentSrc;
    }
    
    // --- New requestAnimationFrame Logic ---
    const updateProgress = () => {
      if (!video.paused) {
        const currentProgress = video.duration > 0 ? (video.currentTime / video.duration) * 100 : 0;
        setCurrentTime(video.currentTime);
        setProgress(currentProgress);
        animationFrameRef.current = requestAnimationFrame(updateProgress);
      }
    };

    const startProgressLoop = () => {
      cancelAnimationFrame(animationFrameRef.current); // Ensure no duplicates
      animationFrameRef.current = requestAnimationFrame(updateProgress);
      setIsPlaying(true);
    };

    const stopProgressLoop = () => {
      cancelAnimationFrame(animationFrameRef.current);
      // Only set isPlaying to false if not looping
      if (!video.loop) {
          setIsPlaying(false);
      }
    };

    const handleEnded = () => {
        stopProgressLoop();
        // If it's a playlist and in sequence mode, play the next track
        if (playMode === 'sequence' && playlist && playlist.length > 1) {
            handlePlayNext();
        }
    };
    
    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      // Reset times for new video
      setCurrentTime(0);
      setProgress(0);
      // Autoplay the video once metadata is loaded
      video.play().catch(error => {
          console.error("Autoplay was prevented on load:", error);
          setIsPlaying(false);
      });
    };

    // Replace the old timeupdate with the new RAF loop handlers
    video.addEventListener('play', startProgressLoop);
    video.addEventListener('pause', stopProgressLoop);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    
    // We must re-apply the loop property here in case the video element
    // has been re-created when the src changes.
    video.loop = playMode === 'loop';

    return () => {
      // Cleanup all listeners and the animation frame
      stopProgressLoop();
      video.removeEventListener('play', startProgressLoop);
      video.removeEventListener('pause', stopProgressLoop);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [src, currentTrackIndex]);

  // Controls auto-hide logic
  useEffect(() => {
    const container = playerContainerRef.current;
    if (!container) {
      return;
    }

    const showControls = () => {
        if (controlsTimeoutRef.current) {
            clearTimeout(controlsTimeoutRef.current);
        }
        container.classList.remove('hide-controls');
        controlsTimeoutRef.current = setTimeout(() => {
            container.classList.add('hide-controls');
        }, 3000);
    };

    container.addEventListener('mousemove', showControls);
    showControls();

    return () => {
      if (container) {
        container.removeEventListener('mousemove', showControls);
      }
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [src]);

  // Effect to handle fullscreen UI behavior
  useEffect(() => {
    const handleFullscreenChange = () => {
      const container = playerContainerRef.current;
      if (!container) return;

      const isFullscreen = document.fullscreenElement === container;
      if (isFullscreen) {
        container.classList.add('hide-controls');
      } else {
        container.classList.remove('hide-controls');
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const togglePlayPause = React.useCallback((e) => {
    if (e) e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, [videoRef]);

  const handlePlayTrack = (index) => {
    if (!playlist || index < 0 || index >= playlist.length) return;
    // Setting the index will trigger the main useEffect to change the source
    setCurrentTrackIndex(index);
  };

  const handlePlayNext = () => {
    if (!playlist) return;
    const nextIndex = (currentTrackIndex + 1) % playlist.length;
    handlePlayTrack(nextIndex);
  };

  const handlePlayPrevious = () => {
    if (!playlist) return;
    const prevIndex = (currentTrackIndex - 1 + playlist.length) % playlist.length;
    handlePlayTrack(prevIndex);
  };

  // Effect for handling keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Prevent handling if a modifier key is pressed or if it's already pressed
      if (e.metaKey || e.ctrlKey || e.altKey || pressedKeys.current.has(e.code)) {
        return;
      }
      pressedKeys.current.add(e.code);

      const video = videoRef.current;
      if (!video) return;

      const seek = (seconds) => {
        const newTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds));
        const newProgress = video.duration > 0 ? (newTime / video.duration) * 100 : 0;
        video.currentTime = newTime;
        setCurrentTime(newTime);
        setProgress(newProgress);
      };

      switch (e.code) {
        case 'ArrowLeft':
        case 'ArrowRight':
          // Seek once immediately
          seek(e.code === 'ArrowRight' ? 5 : -5);
          // Then start interval for continuous seek
          if (keydownIntervalRef.current) clearInterval(keydownIntervalRef.current);
          keydownIntervalRef.current = setInterval(() => {
            seek(e.code === 'ArrowRight' ? 5 : -5);
          }, 200);
          break;
        case 'ArrowUp':
        case 'ArrowDown':
          e.preventDefault(); // Prevent page scroll
          const rates = [0.5, 1.0, 1.5, 2.0];
          const currentIndex = rates.indexOf(playbackRate);
          let nextIndex;
          if (e.code === 'ArrowUp') {
            nextIndex = (currentIndex + 1) % rates.length;
          } else {
            nextIndex = (currentIndex - 1 + rates.length) % rates.length;
          }
          handlePlaybackRateChange(rates[nextIndex]);
          break;
        case 'Space':
            e.preventDefault(); // Prevent page scroll
            togglePlayPause(e);
            break;
      }
    };

    const handleKeyUp = (e) => {
      pressedKeys.current.delete(e.code);
      switch (e.code) {
        case 'ArrowLeft':
        case 'ArrowRight':
          if (keydownIntervalRef.current) {
            clearInterval(keydownIntervalRef.current);
            keydownIntervalRef.current = null;
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
      // Clear any interval if the component unmounts while a key is pressed
      if (keydownIntervalRef.current) {
        clearInterval(keydownIntervalRef.current);
      }
    };
  }, [playbackRate, togglePlayPause]); // Dependency on playbackRate to get the current value

  const handleProgressChange = (e) => {
    e.stopPropagation();
    const newProgress = parseFloat(e.target.value);
    const newTime = (newProgress / 100) * duration;
    
    if (isFinite(newTime)) {
      videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
      setProgress(newProgress);
    }
  };

  const handleVolumeChange = (e) => {
    e.stopPropagation();
    const newVolume = parseFloat(e.target.value);
    videoRef.current.volume = newVolume;
    setVolume(newVolume);
    if (newVolume > 0) {
      setIsMuted(false);
      videoRef.current.muted = false;
    }
  };

  const toggleMute = (e) => {
    e.stopPropagation();
    const video = videoRef.current;
    video.muted = !video.muted;
    setIsMuted(video.muted);
    if (!video.muted) {
        if (video.volume === 0) {
            video.volume = 0.5;
            setVolume(0.5);
        }
    }
  };

  const toggleFullScreen = (e) => {
    e.stopPropagation();
    const container = playerContainerRef.current;
    if (!document.fullscreenElement) {
      container.requestFullscreen().catch(err => {
        alert(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  const handlePlaybackRateChange = (rate) => {
    videoRef.current.playbackRate = rate;
    setPlaybackRate(rate);
  };

  const togglePlaybackSpeed = (e) => {
    e.stopPropagation();
    const rates = [0.5, 1.0, 1.5, 2.0];
    const currentIndex = rates.indexOf(playbackRate);
    const nextIndex = (currentIndex + 1) % rates.length;
    handlePlaybackRateChange(rates[nextIndex]);
  };

  const togglePlayMode = (e) => {
    e.stopPropagation();
    const modes = ['sequence', 'loop', 'random'];
    const currentIndex = modes.indexOf(playMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    setPlayMode(modes[nextIndex]);
  };

  const handleOverlayClick = (e) => {
      if (e.target === playerContainerRef.current) {
          onClose();
      }
  };

  if (!src) {
    return null;
  }

  return React.createElement('div', {
      className: 'video-player-overlay',
      onClick: handleOverlayClick,
      ref: playerContainerRef
    },
    React.createElement(PlaylistSidebar, {
        isVisible: isPlaylistVisible,
        playlist: playlist,
        currentIndex: currentTrackIndex,
        onTrackSelect: handlePlayTrack,
        onClose: () => setIsPlaylistVisible(false)
    }),
    React.createElement('video', {
      ref: videoRef,
      className: 'video-player',
      // src is now set by useEffect
      onClick: togglePlayPause
    }),
    
    React.createElement('div', { className: 'video-controls-container', onClick: e => e.stopPropagation() },
        React.createElement('input', {
            type: 'range',
            min: '0',
            max: '100',
            step: '0.1',
            value: progress,
            className: 'progress-bar',
            onChange: handleProgressChange
        }),

        React.createElement('div', { className: 'bottom-controls' },
            React.createElement('div', { className: 'controls-left' },
                React.createElement('button', { className: 'control-btn', onClick: togglePlayPause }, isPlaying ? '❚❚' : '►'),
                React.createElement('div', { className: 'volume-container' },
                  React.createElement('button', { className: 'control-btn', onClick: toggleMute }, isMuted || volume === 0 ? '🔇' : '🔊'),
                  React.createElement('input', {
                    type: 'range',
                    min: '0',
                    max: '1',
                    step: '0.05',
                    value: isMuted ? 0 : volume,
                    className: 'volume-slider',
                    onChange: handleVolumeChange
                  })
                ),
                React.createElement('span', { className: 'time-display' }, `${formatTime(currentTime)} / ${formatTime(duration)}`)
            ),
            React.createElement('div', { className: 'controls-right' },
                React.createElement('button', { className: 'control-btn speed-btn', onClick: togglePlaybackSpeed, title: '播放速度' },
                    `${playbackRate}X`
                ),
                React.createElement('button', { className: 'control-btn', onClick: togglePlayMode, title: `播放模式: ${playMode}` },
                    playMode === 'loop' ? '🔄' : (playMode === 'random' ? '🔀' : '➡️')
                ),
                playlist && React.createElement('button', { 
                    className: 'control-btn playlist-btn', 
                    onClick: () => setIsPlaylistVisible(true),
                    title: '播放列表'
                }, '☰'),
                React.createElement('button', { className: 'control-btn', onClick: toggleFullScreen }, '⛶')
            )
        )
    )
  );
};

module.exports = { VideoPlayer };
