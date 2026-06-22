let Launcher;

if (window.electronAPI && window.electronAPI.isElectron) {
    Launcher = require('./launcher-electron').Launcher;
}

export { Launcher };
