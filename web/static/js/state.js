const _initialState = {
  presets: [],
  selectedPresetIdx: null,
  selectedCharacterIdx: null,
  currentGameState: null,
  commandHistory: [],
  historyIndex: -1,
  confirmResolve: null,
  storyCustomized: false,
  activeMenuIndex: -1,
  toastTimer: null,
  debugPollInterval: null,
};

let _state = { ..._initialState };
const _listeners = new Set();

export function getState() {
  return _state;
}

export function subscribe(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

export function updateState(partial) {
  _state = { ..._state, ...partial };
  for (const [k, v] of Object.entries(partial)) {
    window[k] = v;
  }
  _listeners.forEach(fn => fn(_state));
}

export function resetState() {
  updateState(_initialState);
}