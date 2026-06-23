const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

module.exports = function (grunt) {
    grunt.registerMultiTask(
        'desktop-npm-install',
        'Install desktop runtime dependencies into tmp/desktop/app via npm',
        function () {
            const done = this.async();
            const targetDir = this.flags[0] || 'tmp/desktop/app';

            const packageJson = path.resolve(targetDir, 'package.json');
            if (!fs.existsSync(packageJson)) {
                grunt.warn(
                    'Desktop package.json not found at ' +
                        packageJson +
                        '. Ensure copy:desktop-app-content runs before this task.'
                );
                done();
                return;
            }

            const npmCli = path.join(
                path.dirname(process.execPath),
                'node_modules',
                'npm',
                'bin',
                'npm-cli.js'
            );
            if (!fs.existsSync(npmCli)) {
                grunt.warn('npm CLI not found at ' + npmCli);
                done(false);
                return;
            }

            const args = [
                npmCli,
                'install',
                '--prefix',
                targetDir,
                '--omit=dev',
                '--no-save',
                '--no-audit',
                '--no-fund',
                '--no-package-lock',
                '--ignore-scripts'
            ];

            grunt.log.writeln('Installing desktop deps into ' + targetDir);
            const child = spawn(process.execPath, args, { stdio: 'inherit' });
            child.on('error', (err) => {
                grunt.warn('Failed to start npm: ' + err.message);
                done(false);
            });
            child.on('close', (code) => {
                if (code !== 0) {
                    grunt.warn('npm install for desktop deps failed (exit ' + code + ')');
                    done(false);
                    return;
                }
                done();
            });
        }
    );
};
