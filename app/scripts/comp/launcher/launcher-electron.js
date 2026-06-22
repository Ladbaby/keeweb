import { Events } from 'framework/events';
import { StartProfiler } from 'comp/app/start-profiler';
import { RuntimeInfo } from 'const/runtime-info';
import { Locale } from 'util/locale';
import { Logger } from 'util/logger';
import { noop } from 'util/fn';

const logger = new Logger('launcher');

const ea = window.electronAPI;

const Launcher = {
    name: 'electron',
    version: ea.electronVersion,
    autoTypeSupported: true,
    thirdPartyStoragesSupported: true,
    clipboardSupported: true,
    platform() {
        return ea.platform;
    },
    arch() {
        return ea.arch;
    },
    openLink(href) {
        if (/^(http|https|ftp|sftp|mailto):/i.test(href)) {
            ea.shellOpenExternal(href);
        }
    },
    devTools: true,
    openDevTools() {
        ea.openDevTools();
    },
    getSaveFileName(defaultPath, callback) {
        if (defaultPath) {
            const homePath = ea.remoteAppGetPath('userDesktop');
            defaultPath = ea.pathJoin(homePath, defaultPath);
        }
        ea.remoteAppShowSaveDialog({
            title: Locale.launcherSave,
            defaultPath,
            filters: [{ name: Locale.launcherFileFilter, extensions: ['kdbx'] }]
        }).then((res) => callback(res.filePath));
    },
    getUserDataPath(fileName) {
        if (!this.userDataPath) {
            this.userDataPath = ea.remoteAppGetPath('userData');
        }
        return ea.pathJoin(this.userDataPath, fileName || '');
    },
    getTempPath(fileName) {
        let tempPath = ea.pathJoin(ea.remoteAppGetPath('temp'), 'KeeWeb');
        if (!ea.fsExistsSync(tempPath)) {
            ea.fsMkdirSync(tempPath);
        }
        if (fileName) {
            tempPath = ea.pathJoin(tempPath, fileName);
        }
        return tempPath;
    },
    getDocumentsPath(fileName) {
        return ea.pathJoin(ea.remoteAppGetPath('documents'), fileName || '');
    },
    getAppPath(fileName) {
        const appPath = ea.remoteAppGetAppPath();
        const dir = ea.pathDirname(appPath);
        return ea.pathJoin(dir, fileName || '');
    },
    getWorkDirPath(fileName) {
        return ea.pathJoin(ea.cwd(), fileName || '');
    },
    joinPath(...parts) {
        return ea.pathJoin(...parts);
    },
    writeFile(path, data, callback) {
        ea.fsWriteFile(path, ea.bufferFrom(data), callback);
    },
    readFile(path, encoding, callback) {
        ea.fsReadFile(path, encoding, (err, contents) => {
            const data = typeof contents === 'string' ? contents : new Uint8Array(contents);
            callback(data, err);
        });
    },
    fileExists(path, callback) {
        ea.fsAccessExists(path, (exists) => {
            callback(exists);
        });
    },
    fileExistsSync(path) {
        try {
            ea.fsAccessSync(path);
            return true;
        } catch (e) {
            return false;
        }
    },
    deleteFile(path, callback) {
        ea.fsUnlink(path, callback || noop);
    },
    statFile(path, callback) {
        ea.fsStat(path, (err, stats) => callback(stats, err));
    },
    mkdir(dir, callback) {
        const stack = [];

        const collect = function (dir, stack, callback) {
            ea.fsExists(dir, (exists) => {
                if (exists) {
                    return callback();
                }

                stack.unshift(dir);
                const newDir = ea.pathDirname(dir);
                if (newDir === dir || !newDir || newDir === '.' || newDir === '/') {
                    return callback();
                }

                collect(newDir, stack, callback);
            });
        };

        const create = function (stack, callback) {
            if (!stack.length) {
                return callback();
            }

            ea.fsMkdir(stack.shift(), (err) => (err ? callback(err) : create(stack, callback)));
        };

        collect(dir, stack, () => create(stack, callback));
    },
    parsePath(fileName) {
        return {
            path: fileName,
            dir: ea.pathDirname(fileName),
            file: ea.pathBasename(fileName)
        };
    },
    createFsWatcher(filePath) {
        return ea.fsWatch(filePath);
    },
    fsWatcherOn(id, event, callback) {
        ea.fsWatcherOn(id, event, callback);
    },
    fsWatcherClose(id) {
        ea.fsWatcherClose(id);
    },
    loadConfig(name) {
        return ea.remoteAppLoadConfig(name);
    },
    saveConfig(name, data) {
        return ea.remoteAppSaveConfig(name, data);
    },
    preventExit(e) {
        e.returnValue = false;
        return false;
    },
    exit() {
        this.exitRequested = true;
        this.requestExit();
    },
    requestExit() {
        ea.remoteAppSetHookBeforeQuitEvent(false);
        if (this.pendingUpdateFile) {
            ea.remoteAppRestartAndUpdate(this.pendingUpdateFile);
        } else {
            ea.remoteAppQuit();
        }
    },
    requestRestartAndUpdate(updateFilePath) {
        this.pendingUpdateFile = updateFilePath;
        this.requestExit();
    },
    cancelRestart() {
        this.pendingUpdateFile = undefined;
    },
    setClipboardText(text) {
        ea.clipboardWriteText(text);
    },
    getClipboardText() {
        return ea.clipboardReadText();
    },
    clearClipboardText() {
        ea.clipboardClear();
    },
    quitOnRealQuitEventIfMinimizeOnQuitIsEnabled() {
        return !!this.pendingUpdateFile;
    },
    minimizeApp() {
        ea.remoteAppMinimizeApp({
            restore: Locale.menuRestoreApp.replace('{}', 'KeeWeb'),
            quit: Locale.menuQuitApp.replace('{}', 'KeeWeb')
        });
    },
    canDetectOsSleep() {
        return ea.platform !== 'linux';
    },
    updaterEnabled() {
        return ea.platform !== 'linux';
    },
    getMainWindow() {
        return null;
    },
    resolveProxy(url, callback) {
        ea.remoteAppResolveProxy(url).then((proxy) => {
            const match = /^proxy\s+([\w\.]+):(\d+)+\s*/i.exec(proxy);
            proxy = match && match[1] ? { host: match[1], port: +match[2] } : null;
            callback(proxy);
        });
    },
    hideApp() {
        if (ea.platform === 'darwin') {
            ea.remoteAppHide();
        } else {
            ea.remoteAppMinimizeThenHideIfInTray();
        }
    },
    isAppFocused() {
        return ea.isAppFocused();
    },
    showMainWindow() {
        ea.remoteAppShowAndFocusMainWindow();
    },
    spawn(config) {
        const ts = logger.ts();
        let { complete } = config;
        delete config.complete;
        ea.ipcInvoke('spawnProcess', config)
            .then((res) => {
                if (res.err) {
                    logger.error('spawn error: ' + config.cmd + ', ' + logger.ts(ts), res.err);
                    complete?.(res.err);
                } else {
                    const code = res.code;
                    const stdout = res.stdout || '';
                    const stderr = res.stderr || '';
                    const msg = 'spawn ' + config.cmd + ': ' + code + ', ' + logger.ts(ts);
                    if (code !== 0) {
                        logger.error(msg + '\n' + stdout + '\n' + stderr);
                    } else {
                        logger.info(msg + (stdout && !config.noStdOutLogging ? '\n' : ''));
                    }
                    complete?.(code !== 0 ? 'Exit code ' + code : null, stdout, code);
                }
                complete = null;
            })
            .catch((err) => {
                complete?.(err);
            });
    },
    checkOpenFiles() {
        this.readyToOpenFiles = true;
        if (this.pendingFileToOpen) {
            this.openFile(this.pendingFileToOpen);
            delete this.pendingFileToOpen;
        }
    },
    openFile(file) {
        if (this.readyToOpenFiles) {
            Events.emit('launcher-open-file', file);
        } else {
            this.pendingFileToOpen = file;
        }
    },
    setGlobalShortcuts(appSettings) {
        ea.remoteAppSetGlobalShortcuts(appSettings);
    },
    minimizeMainWindow() {
        ea.mainWindowMinimize();
    },
    maximizeMainWindow() {
        ea.mainWindowMaximize();
    },
    restoreMainWindow() {
        ea.mainWindowRestore();
    },
    mainWindowMaximized() {
        return ea.mainWindowIsMaximized();
    }
};

Events.on('launcher-exit-request', () => {
    setTimeout(() => Launcher.exit(), 0);
});
Events.on('launcher-minimize', () => setTimeout(() => Events.emit('app-minimized'), 0));
Events.on('launcher-maximize', () => setTimeout(() => Events.emit('app-maximized'), 0));
Events.on('launcher-unmaximize', () => setTimeout(() => Events.emit('app-unmaximized'), 0));
Events.on('launcher-started-minimized', () => setTimeout(() => Launcher.minimizeApp(), 0));
Events.on('start-profile', (data) => StartProfiler.reportAppProfile(data));

window.launcherOpen = (file) => Launcher.openFile(file);
if (window.launcherOpenedFile) {
    logger.info('Open file request', window.launcherOpenedFile);
    Launcher.openFile(window.launcherOpenedFile);
    delete window.launcherOpenedFile;
}
Events.on('app-ready', () =>
    setTimeout(() => {
        Launcher.checkOpenFiles();
        ea.remoteAppSetAboutPanelOptions({
            applicationVersion: RuntimeInfo.version,
            version: RuntimeInfo.commit
        });
    }, 0)
);

if (ea.platform === 'darwin') {
    ea.remoteAppSetHookBeforeQuitEvent(true);
}

ea.remoteAppOn('remote-app-event', (e) => {
    if (window.debugRemoteAppEvents) {
        logger.debug('remote-app-event', e.name);
    }
    Events.emit(e.name, e.data);
});

export { Launcher };
