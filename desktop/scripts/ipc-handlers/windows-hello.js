const { ipcMain, BrowserWindow } = require('electron');
const { readXoredValue, makeXoredValue } = require('../util/byte-utils');
const { reqNative } = require('../util/req-native');

const keyTag = 'net.antelle.keeweb.windows-hello-key';

function assertMainFrame(e) {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (!mainWindow || e.sender !== mainWindow.webContents) {
        throw new Error('Access denied: not main frame');
    }
}

ipcMain.handle('windowsHelloEncrypt', async (e, value, salt) => {
    assertMainFrame(e);
    const wh = reqNative('windows-hello');
    const data = readXoredValue({ data: value, salt });
    const res = await wh.protect(keyTag, data);
    data.fill(0);
    return makeXoredValue(res);
});

ipcMain.handle('windowsHelloDecrypt', async (e, value, salt, message) => {
    assertMainFrame(e);
    const wh = reqNative('windows-hello');
    const data = readXoredValue({ data: value, salt });
    const res = await wh.unprotect(keyTag, data, message);
    data.fill(0);
    return makeXoredValue(res);
});

ipcMain.handle('windowsHelloDeleteKey', async (e) => {
    assertMainFrame(e);
    const wh = reqNative('windows-hello');
    await wh.deleteKey(keyTag);
});

ipcMain.handle('windowsHelloIsAvailable', async () => {
    const wh = reqNative('windows-hello');
    return wh.isAvailable();
});
