import { Launcher } from 'comp/launcher';
import { Logger } from 'util/logger';
import { noop } from 'util/fn';
import { StringFormat } from 'util/formatting/string-format';

const logger = new Logger('transport');

const Transport = {
    cacheFilePath(fileName) {
        return Launcher.getTempPath(fileName);
    },

    httpGet(config) {
        const ea = window.electronAPI;
        let tmpFile;
        if (config.file) {
            const baseTempPath = Launcher.getTempPath();
            if (config.cleanupOldFiles) {
                const allFiles = ea.fsReaddirSync(baseTempPath);
                for (const file of allFiles) {
                    if (
                        file !== config.file &&
                        StringFormat.replaceVersion(file, '0') ===
                            StringFormat.replaceVersion(config.file, '0')
                    ) {
                        ea.fsUnlinkSync(Launcher.joinPath(baseTempPath, file));
                    }
                }
            }
            tmpFile = Launcher.joinPath(baseTempPath, config.file);
            if (ea.fsExistsSync(tmpFile)) {
                try {
                    if (config.cache && ea.fsStatSync(tmpFile).size > 0) {
                        logger.info('File already downloaded ' + config.url);
                        return config.success(tmpFile);
                    } else {
                        ea.fsUnlinkSync(tmpFile);
                    }
                } catch (e) {
                    ea.fsUnlink(tmpFile, noop);
                }
            }
        }
        logger.info('GET ' + config.url);

        ea.httpGetBuffer(
            config.url,
            { text: config.text, json: config.json, noRedirect: config.noRedirect },
            (data) => {
                if (tmpFile) {
                    ea.fsWriteFile(tmpFile, ea.bufferFrom(data), () => config.success(tmpFile));
                } else {
                    config.success(data);
                }
            },
            (err) => config.error(err)
        );
    }
};

export { Transport };
