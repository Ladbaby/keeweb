const fs = require('fs');
const path = require('path');
const fsExtra = require('fs-extra');

module.exports = function (grunt) {
    grunt.registerMultiTask(
        'desktop-nodemodules',
        'Copy required node_modules packages for desktop app build',
        function () {
            const done = this.async();
            const targetDir = this.flags[0] || 'tmp/desktop/app';

            const srcModules = path.resolve('node_modules');
            const destModules = path.resolve(targetDir, 'node_modules');

            if (!fs.existsSync(srcModules)) {
                grunt.warn('Root node_modules not found. Run npm install first.');
                done();
                return;
            }

            // Remove existing node_modules in target if present
            if (fs.existsSync(destModules)) {
                try {
                    fsExtra.removeSync(destModules);
                } catch (e) {
                    grunt.warn('Failed to remove existing node_modules: ' + e.message);
                    done();
                    return;
                }
            }

            // Try symlink first on Unix; on Windows, electron-packager
            // cannot follow junctions into the asar, so do a full recursive copy.
            if (process.platform !== 'win32') {
                try {
                    fs.symlinkSync(srcModules, destModules, 'dir');
                    grunt.log.writeln('Created node_modules symlink in ' + targetDir);
                    done();
                    return;
                } catch (e) {
                    grunt.log.warn(
                        'Symlink failed (' + e.message + '), falling back to full copy'
                    );
                    fsExtra.copySync(srcModules, destModules);
                    grunt.log.writeln('Copied full node_modules to ' + targetDir);
                    done();
                    return;
                }
            } else {
                grunt.log.writeln('Windows: copying full node_modules to ' + targetDir);
                fsExtra.copySync(srcModules, destModules);
                done();
                return;
            }
        }
    );
};
