import EventEmitter from 'events';

class Events extends EventEmitter {
    constructor() {
        super();
        this.setMaxListeners(1000);
    }

    off(event, listener) {
        return this.removeListener(event, listener);
    }
}

const instance = new Events();

export { instance as Events };
