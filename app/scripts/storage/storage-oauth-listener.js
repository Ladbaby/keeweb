import EventEmitter from 'events';
import { Logger } from 'util/logger';
const logger = new Logger('storage-oauth-listener');

const StorageOAuthListener = {
    server: null,

    listen(storageName) {
        if (this.server) {
            this.stop();
        }

        const listener = {};
        Object.keys(EventEmitter.prototype).forEach((key) => {
            listener[key] = EventEmitter.prototype[key];
        });

        listener.redirectUri = window.electronAPI.startOAuthListener(storageName, {
            ready: () => {
                this.server = true;
                listener.emit('ready');
            },
            error: (err) => {
                this.server = null;
                logger.error('Failed to start OAuth listener', err);
                listener.emit('error', err);
            },
            result: (result) => {
                this.stop();
                const url = new URL(
                    '?state=' +
                        encodeURIComponent(result.state) +
                        '&code=' +
                        encodeURIComponent(result.code),
                    listener.redirectUri
                );
                const state = url.searchParams.get('state');
                const code = url.searchParams.get('code');
                listener.emit('result', { state, code });
            }
        });

        return listener;
    },

    stop() {
        if (this.server) {
            window.electronAPI.stopOAuthListener();
            this.server = null;
        }
    }
};

export { StorageOAuthListener };
