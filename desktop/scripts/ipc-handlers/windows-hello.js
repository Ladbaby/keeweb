const { ipcMain } = require('electron');
const { readXoredValue, makeXoredValue } = require('../util/byte-utils');
const { reqNative } = require('../util/req-native');

const keyTag = 'net.antelle.keeweb.windows-hello-key';

ipcMain.handle('windowsHelloEncrypt', async (e, value) => {
    const wh = reqNative('windows-hello');
    const data = readXoredValue(value);
    const res = await wh.protect(keyTag, data);
    data.fill(0);
    return makeXoredValue(res);
});

ipcMain.handle('windowsHelloDecrypt', async (e, value) => {
    const wh = reqNative('windows-hello');
    const data = readXoredValue(value);
    const res = await wh.unprotect(keyTag, data);
    data.fill(0);
    return makeXoredValue(res);
});

ipcMain.handle('windowsHelloDeleteKey', async () => {
    const wh = reqNative('windows-hello');
    await wh.deleteKey(keyTag);
});

ipcMain.handle('windowsHelloIsAvailable', async () => {
    const wh = reqNative('windows-hello');
    return wh.isAvailable();
});
