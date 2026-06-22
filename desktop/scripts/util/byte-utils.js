const crypto = require('crypto');

module.exports = {
    readXoredValue: function readXoredValue(val) {
        const data = Buffer.from(val.data);
        const salt = Buffer.from(val.salt);

        if (typeof val.data.fill === 'function') {
            val.data.fill(0);
        }
        if (typeof val.salt.fill === 'function') {
            val.salt.fill(0);
        }

        for (let i = 0; i < data.length; i++) {
            data[i] ^= salt[i];
        }

        return data;
    },

    makeXoredValue: function makeXoredValue(val) {
        const data = Buffer.from(val);
        const salt = crypto.randomBytes(data.length);
        for (let i = 0; i < data.length; i++) {
            data[i] ^= salt[i];
        }
        const result = { data: new Uint8Array(data), salt: new Uint8Array(salt) };
        data.fill(0);
        salt.fill(0);

        val.fill(0);

        setTimeout(() => {
            result.data.fill(0);
            result.salt.fill(0);
        }, 0);

        return result;
    }
};
