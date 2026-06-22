const { contextBridge, ipcRenderer } = require('electron');
const remote = require('@electron/remote');
const fs = require('fs');
const path = require('path');
const http = require('http');

let watcherIdCounter = 0;
const watchers = new Map();
let oauthServer = null;

function httpGetOne(url, config, onSuccess, onError) {
    const proto = require(url.startsWith('https') ? 'https' : 'http');
    const parsedUrl = new URL(url);
    const opts = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || undefined,
        path: parsedUrl.pathname + parsedUrl.search,
        protocol: parsedUrl.protocol,
        headers: { 'User-Agent': navigator.userAgent }
    };

    function doRequest(opts) {
        proto
            .get(opts, (res) => {
                if (res.statusCode === 200) {
                    const chunks = [];
                    res.on('data', (chunk) => {
                        chunks.push(chunk);
                    });
                    res.on('end', () => {
                        let data = Buffer.concat(chunks);
                        if (config.text || config.json) {
                            data = data.toString('utf8');
                        }
                        if (config.json) {
                            try {
                                data = JSON.parse(data);
                            } catch (e) {
                                return onError('Error parsing JSON: ' + e.message);
                            }
                        }
                        onSuccess(data);
                    });
                } else if ([301, 302].includes(res.statusCode)) {
                    if (config.noRedirect) {
                        return onError('Too many redirects');
                    }
                    httpGetOne(
                        res.headers.location,
                        Object.assign({}, config, { noRedirect: true }),
                        onSuccess,
                        onError
                    );
                } else {
                    onError('HTTP status ' + res.statusCode);
                }
            })
            .on('error', onError);
    }

    remote.app
        .getMainWindow()
        .webContents.session.resolveProxy(url)
        .then((proxyStr) => {
            const match = /^proxy\s+([\w\.]+):(\d+)+\s*/i.exec(proxyStr);
            if (match && match[1]) {
                opts.headers.Host =
                    parsedUrl.hostname + (parsedUrl.port ? ':' + parsedUrl.port : '');
                opts.hostname = match[1];
                opts.port = +match[2];
                opts.path = url;
            }
            doRequest(opts);
        })
        .catch(() => {
            doRequest(opts);
        });
}

contextBridge.exposeInMainWorld('electronAPI', {
    isElectron: true,
    platform: process.platform,
    arch: process.arch,
    electronVersion: process.versions.electron,
    cwd() {
        return process.cwd();
    },

    ipcInvoke(channel, ...args) {
        return ipcRenderer.invoke(channel, ...args);
    },
    ipcSend(channel, ...args) {
        return ipcRenderer.send(channel, ...args);
    },
    ipcOn(channel, listener) {
        ipcRenderer.on(channel, (event, ...args) => {
            listener(...args);
        });
    },

    shellOpenExternal(url) {
        return require('electron').shell.openExternal(url);
    },

    clipboardWriteText(text) {
        require('electron').clipboard.writeText(text);
    },
    clipboardReadText() {
        return require('electron').clipboard.readText();
    },
    clipboardClear() {
        const clipboard = require('electron').clipboard;
        clipboard.clear();
        if (process.platform === 'linux') {
            clipboard.clear('selection');
        }
    },

    remoteAppGetPath(name) {
        return remote.app.getPath(name);
    },
    remoteAppGetAppPath() {
        return remote.app.getAppPath();
    },
    remoteAppGetName() {
        return remote.app.getName();
    },
    remoteAppLoadConfig(name) {
        return remote.app.loadConfig(name);
    },
    remoteAppSaveConfig(name, data) {
        return remote.app.saveConfig(name, data);
    },
    remoteAppQuit() {
        remote.app.quit();
    },
    remoteAppMinimizeApp(opts) {
        remote.app.minimizeApp(opts);
    },
    remoteAppSetAboutPanelOptions(opts) {
        remote.app.setAboutPanelOptions(opts);
    },
    remoteAppSetHookBeforeQuitEvent(val) {
        remote.app.setHookBeforeQuitEvent(val);
    },
    remoteAppOn(event, listener) {
        remote.app.on(event, listener);
    },
    remoteAppRestartAndUpdate(filePath) {
        remote.app.restartAndUpdate(filePath);
    },
    remoteAppShowAndFocusMainWindow() {
        remote.app.showAndFocusMainWindow();
    },
    remoteAppSetGlobalShortcuts(settings) {
        remote.app.setGlobalShortcuts(settings);
    },
    remoteAppHttpRequest(config, logCb, resultCb) {
        remote.app.httpRequest(config, logCb, resultCb);
    },
    remoteAppHide() {
        remote.app.hide();
    },
    remoteAppMinimizeThenHideIfInTray() {
        remote.app.minimizeThenHideIfInTray();
    },
    remoteAppResolveProxy(url) {
        return remote.app.getMainWindow().webContents.session.resolveProxy(url);
    },
    remoteAppShowSaveDialog(options) {
        return require('electron').dialog.showSaveDialog(options);
    },
    remoteGetCurrentWindow() {
        return remote.getCurrentWindow();
    },
    remoteBrowserWindowGetFocusedWindow() {
        return remote.BrowserWindow.getFocusedWindow();
    },

    openDevTools() {
        remote.getCurrentWindow().webContents.openDevTools({ mode: 'bottom' });
    },
    isAppFocused() {
        return !!remote.BrowserWindow.getFocusedWindow();
    },

    mainWindowMinimize() {
        remote.app.getMainWindow().minimize();
    },
    mainWindowMaximize() {
        remote.app.getMainWindow().maximize();
    },
    mainWindowRestore() {
        remote.app.getMainWindow().restore();
    },
    mainWindowIsMaximized() {
        return remote.app.getMainWindow().isMaximized();
    },

    fsWriteFile(filePath, data, callback) {
        fs.writeFile(filePath, data, callback);
    },
    fsReadFile(filePath, encoding, callback) {
        fs.readFile(filePath, encoding, callback);
    },
    fsAccess(filePath, mode, callback) {
        fs.access(filePath, mode, callback);
    },
    fsUnlink(filePath, callback) {
        fs.unlink(filePath, callback);
    },
    fsStat(filePath, callback) {
        fs.stat(filePath, (err, stats) => {
            if (err) {
                callback(err, null);
            } else {
                callback(null, {
                    dev: stats.dev,
                    mode: stats.mode,
                    size: stats.size,
                    mtime: stats.mtime,
                    atime: stats.atime,
                    ctime: stats.ctime,
                    birthtime: stats.birthtime,
                    mtimeMs: stats.mtimeMs,
                    atimeMs: stats.atimeMs,
                    ctimeMs: stats.ctimeMs,
                    birthtimeMs: stats.birthtimeMs,
                    isFile: stats.isFile(),
                    isDirectory: stats.isDirectory(),
                    isSymbolicLink: stats.isSymbolicLink()
                });
            }
        });
    },
    fsMkdir(filePath, callback) {
        fs.mkdir(filePath, callback);
    },
    fsAccessExists(filePath, callback) {
        fs.access(filePath, fs.constants.F_OK, (err) => {
            callback(!err);
        });
    },
    fsExists(filePath, callback) {
        fs.access(filePath, fs.constants.F_OK, (err) => {
            callback(!err);
        });
    },
    fsExistsSync(filePath) {
        return fs.existsSync(filePath);
    },
    fsMkdirSync(filePath) {
        fs.mkdirSync(filePath);
    },
    fsAccessSync(filePath, mode) {
        fs.accessSync(filePath, mode);
    },
    fsReaddirSync(dirPath) {
        return fs.readdirSync(dirPath);
    },
    fsUnlinkSync(filePath) {
        fs.unlinkSync(filePath);
    },
    fsStatSync(filePath) {
        const stats = fs.statSync(filePath);
        return {
            dev: stats.dev,
            mode: stats.mode,
            size: stats.size,
            mtime: stats.mtime,
            atime: stats.atime,
            ctime: stats.ctime,
            birthtime: stats.birthtime,
            mtimeMs: stats.mtimeMs,
            atimeMs: stats.atimeMs,
            ctimeMs: stats.ctimeMs,
            birthtimeMs: stats.birthtimeMs,
            isFile: stats.isFile(),
            isDirectory: stats.isDirectory(),
            isSymbolicLink: stats.isSymbolicLink()
        };
    },
    fsReadFileSync(filePath, encoding) {
        return fs.readFileSync(filePath, encoding);
    },

    fsWatch(filePath) {
        const id = ++watcherIdCounter;
        const watcher = fs.watch(filePath, { persistent: false });
        watchers.set(id, watcher);
        return id;
    },
    fsWatcherOn(id, event, callback) {
        const watcher = watchers.get(id);
        if (watcher) {
            watcher.on(event, (...args) => {
                callback(...args);
            });
        }
    },
    fsWatcherClose(id) {
        const watcher = watchers.get(id);
        if (watcher) {
            watcher.close();
            watchers.delete(id);
        }
    },

    pathJoin(...parts) {
        return path.join(...parts);
    },
    pathDirname(filePath) {
        return path.dirname(filePath);
    },
    pathBasename(filePath) {
        return path.basename(filePath);
    },

    bufferFrom(data) {
        const buf = Buffer.from(data);
        return new Uint8Array(buf.buffer, buf.byteOffset, buf.length);
    },
    bufferFromHex(hex) {
        const buf = Buffer.from(hex, 'hex');
        return new Uint8Array(buf.buffer, buf.byteOffset, buf.length);
    },
    bufferConcat(list) {
        const bufs = [];
        for (let i = 0; i < list.length; i++) {
            bufs.push(Buffer.from(list[i]));
        }
        return Buffer.concat(bufs);
    },

    httpGetBuffer(url, config, onSuccess, onError) {
        httpGetOne(url, config, onSuccess, onError);
    },

    startOAuthListener(storageName, callbacks) {
        if (oauthServer) {
            oauthServer.close();
            oauthServer = null;
        }
        const port = 48149;
        const redirectUri = 'http://localhost:' + port + '/oauth-result/' + storageName + '.html';

        const server = http.createServer((req, resp) => {
            resp.writeHead(200, 'OK', { 'Content-Type': 'text/html; charset=UTF-8' });
            resp.end(
                '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>OAuth Complete</title></head><body><h1>Authorization complete</h1><p>You can close this window.</p></body></html>'
            );

            const url = new URL(req.url, redirectUri);
            if (url.origin + url.pathname === redirectUri) {
                const state = url.searchParams.get('state');
                const code = url.searchParams.get('code');
                callbacks.result({ state, code });
            }
            server.close();
            oauthServer = null;
        });

        server.on('listening', () => {
            oauthServer = server;
            callbacks.ready();
        });
        server.on('error', (err) => {
            callbacks.error('Failed to start OAuth listener: ' + err);
            server.close();
        });

        server.listen(port);
        return redirectUri;
    },

    stopOAuthListener() {
        if (oauthServer) {
            oauthServer.close();
            oauthServer = null;
        }
    }
});
