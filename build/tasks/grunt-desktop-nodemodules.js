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

            // Try symlink first (works on Unix, may require admin on Windows)
            try {
                if (process.platform !== 'win32') {
                    fs.symlinkSync(srcModules, destModules, 'dir');
                    grunt.log.writeln('Created node_modules symlink in ' + targetDir);
                    done();
                    return;
                }

                // On Windows, try junction (may still require admin)
                fs.symlinkSync(srcModules, destModules, 'junction');
                grunt.log.writeln('Created node_modules junction in ' + targetDir);
                done();
                return;
            } catch (e) {
                grunt.log.warn('Symlink failed (' + e.message + '), falling back to package copy');
            }

            // Fallback: copy only required packages
            try {
                fs.mkdirSync(destModules, { recursive: true });

                // Packages required by desktop/main.js and desktop/native-module-host.js
                // These match the dependencies in desktop/package.json
                const requiredPkgs = [
                    '@electron/remote',
                    '@keeweb/keeweb-native-modules',
                    'node-fetch',
                    'keytar'
                ];

                // Optional packages (only copy if available in root)
                const optionalPkgs = [];

                for (const pkg of requiredPkgs) {
                    const src = path.join(srcModules, pkg);
                    if (!fs.existsSync(src)) {
                        grunt.warn('Required package not found: ' + pkg);
                        continue;
                    }

                    // Handle scoped packages (e.g. @electron/remote)
                    let dest;
                    if (pkg.startsWith('@')) {
                        const parts = pkg.split('/');
                        const scopeDir = path.join(destModules, parts[0]);
                        fs.mkdirSync(scopeDir, { recursive: true });
                        dest = path.join(scopeDir, parts[1]);
                    } else {
                        dest = path.join(destModules, pkg);
                    }

                    fsExtra.copySync(src, dest);
                    grunt.log.writeln('Copied ' + pkg);
                }

                for (const pkg of optionalPkgs) {
                    const src = path.join(srcModules, pkg);
                    if (fs.existsSync(src)) {
                        const dest = path.join(destModules, pkg);
                        fsExtra.copySync(src, dest);
                        grunt.log.writeln('Copied ' + pkg);
                    }
                }

                grunt.log.writeln('Desktop node_modules prepared in ' + targetDir);
            } catch (e) {
                grunt.warn('Failed to prepare node_modules: ' + e.message);
            }

            done();
        }
    );
};
