module.exports = function (grunt) {
    grunt.registerMultiTask('electron', 'Package Electron app via @electron/packager', function () {
        const done = this.async();
        const { packager } = require('@electron/packager');

        const globalOpts = this.options();
        const targetOpts = this.data.options || {};
        const merged = { ...globalOpts, ...targetOpts };

        // Map legacy electron-packager option names to @electron/packager API
        if (merged['version-string']) {
            merged.win32metadata = { ...merged['version-string'] };
            delete merged['version-string'];
        }
        if (merged['build-version']) {
            merged.buildVersion = merged['build-version'];
            delete merged['build-version'];
        }
        if (merged['app-copyright']) {
            merged.appCopyright = merged['app-copyright'];
            delete merged['app-copyright'];
        }
        if (merged['app-version']) {
            merged.appVersion = merged['app-version'];
            delete merged['app-version'];
        }

        // Inverted boolean options (grunt-electron used no-* prefix)
        if (merged.noPrune !== undefined) {
            merged.prune = !merged.noPrune;
            delete merged.noPrune;
        }
        if (merged.noDerefSymlinks !== undefined) {
            merged.derefSymlinks = !merged.noDerefSymlinks;
            delete merged.noDerefSymlinks;
        }
        if (merged.noJunk !== undefined) {
            merged.junk = !merged.noJunk;
            delete merged.noJunk;
        }

        // Remove options that @electron/packager doesn't support
        delete merged.enableRemoteModule;

        // appCategoryType and extendInfo are supported by @electron/packager for macOS
        // No mapping needed - they use the same names

        packager(merged)
            .then((appPaths) => {
                appPaths.forEach((p) => grunt.log.writeln('Packaged:', p));
                done();
            })
            .catch((err) => {
                grunt.warn('@electron/packager error: ' + err.message);
                done(false);
            });
    });
};
