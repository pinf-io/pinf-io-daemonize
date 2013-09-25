
const ASSERT = require("assert");
const PATH = require("path");
const FS = require("fs");
const COMMANDER = require("commander");
const SPAWN = require("child_process").spawn;
const EXEC = require("child_process").exec;
const PINF_MAIN = require("pinf-for-nodejs/lib/main").main;
const PINF_IO_UTIL = require("pinf-io-util");
const REQUEST = require("request");


exports.forModule = function(module, moduleOverlays) {

    module.exports.for = function($pinf, callback) {

        ASSERT.equal(typeof moduleOverlays, "object");
        ASSERT.equal(typeof moduleOverlays.name, "string");
        ASSERT.equal(typeof moduleOverlays.defaultConfig, "object");
        ASSERT.equal(typeof moduleOverlays.toStandardConfig, "function");
        ASSERT.equal(typeof moduleOverlays.fromStandardConfig, "function");
        ASSERT.equal(typeof moduleOverlays.getLaunchScript, "function");

        var exports = {};

        var monLogPath = $pinf.makePath("log", "mon.log");
        var stdoutPath = $pinf.makePath("log", moduleOverlays.name + ".stdout.log");
        var stderrPath = $pinf.makePath("log", moduleOverlays.name + ".stderr.log");
        var launcherPath = $pinf.makePath("tmp", "launcher.sh");

        var config = null;
        function syncConfig() {
            config = {};
            for (var name in $pinf.config) {
                config[name] = $pinf.config[name];
            }
            // Derive pinf io standard config from custom module config.
            config.pinf = moduleOverlays.toStandardConfig(config[moduleOverlays.name]);
        }
        $pinf.on("config.changed", syncConfig);
        // Declare all config options and defaults.
        $pinf.ensureDefaultConfig(moduleOverlays.name, moduleOverlays.defaultConfig);
        syncConfig();

        function getMonPath() {
            return PATH.join(__dirname, ".sm/bin/mon");
        }

        function resetConfig(callback) {
            return $pinf.clearRuntimeConfig(moduleOverlays.name, callback);
        }

        function ensureConfig(callback) {
            return PINF_IO_UTIL.getFreePort(function (err, port) {
                if (err) return callback(err);

                return $pinf.updateRuntimeConfig(moduleOverlays.name, moduleOverlays.fromStandardConfig({
                    io: {
                        port: port
                    }
                }), function(err) {
                    if (err) return callback(err);
                    return FS.writeFile(launcherPath, moduleOverlays.getLaunchScript($pinf, config[moduleOverlays.name], {
                        stdoutPath: stdoutPath,
                        stderrPath: stderrPath
                    }), function(err) {
                        if (err) return callback(err);
                        return FS.chmod(launcherPath, 0755, callback);
                    });
                });
            });
        }

        function removeConfig(callback) {
            return resetConfig(function(err) {
                if (err) return callback(err);
                return FS.unlink(launcherPath, function(err) {
                    if (err) return callback(err);
                    return callback(null);
                });
            });
        }

        function waitUntil(running, done) {
            var callback = function() {
                clearTimeout(timeoutId);
                clearInterval(intervalId);
                return done.apply(null, arguments);
            };
            var timeoutId = setTimeout(function() {
                return callback(new Error("'" + moduleOverlays.name + "' did not start within time."));
            }, 7 * 1000);
            var checking = false;
            var intervalId = setInterval(function() {
                if (checking) return;
                checking = true;
                return exports.isRunning(function(err, status) {
                    checking = false;
                    if (err) return callback(err);
                    if (!!status === !!running) return callback(null, status);
                    // Nothing more to do in this interval.
                });
            }, 500);
        }

        function getProcessIDs(callback) {
            return EXEC("ps xj", function (err, stdout, stderr) {
                if (err) return callback(err);
                // Go through all processes and pick out the ones we manage.
                // We can find the mon and launcher processes by looking for `launcherPath` in the process title.
                var processes = {};
                var matchedProcesses = {};
                stdout.split("\n").forEach(function(line) {
                    var m = line.match(/^(\w+)\s+(\d+)\s+(\d+)\s+/);
                    if (!m) return;
                    processes[m[2]] = m[3];
                    if (line.indexOf(launcherPath) === -1) return;
                    matchedProcesses[m[2]] = true;
                });
                // Go through all matching processes and determine their hierarchy.
                var monProcesses = {};
                Object.keys(matchedProcesses).forEach(function(pid) {
                    if (matchedProcesses[processes[pid]]) {
                        // We found the mon process.
                        // Find the processes controlled by the launcher process.
                        var pids = [];
                        for (var _pid in processes) {
                            if (processes[_pid] === pid) {
                                pids.push(_pid);
                            }
                        }
                        monProcesses[processes[pid]] = [pid, pids];
                    }
                });
//                console.log("monProcesses", monProcesses);                
                return callback(null, monProcesses);
            });
        }

        function stopAllAndWait(callback) {
            return getProcessIDs(function(err, idChains) {
                if (err) return callback(err);
                var keys = Object.keys(idChains);
                if (keys.length > 0) {
                    keys.forEach(function(monPid) {
                        process.kill(monPid);
                    });
                    return waitUntil(false, callback);
                }
                return callback(null);
            });
        }

        exports.isRunning = function(callback) {
            function ensureConfig(continueCheck) {
                // If no port in config we terminate all processes
                if (
                    config &&
                    config.pinf &&
                    config.pinf.io &&
                    config.pinf.io.port
                ) {
                    return continueCheck(null);
                }
                return stopAllAndWait(function() {
                    return callback(null, false);
                });
            }
            return ensureConfig(function(err) {
                if (err) return callback(err);

                return getProcessIDs(function(err, idChains) {
                    if (err) return callback(err);
                    if (Object.keys(idChains).length === 0) {
                        return callback(null, false);
                    }
                    return REQUEST("http://127.0.0.1:" + config.pinf.io.port + "/", function (err, response, body) {
                        if (err) return callback(null, false);
                        if (response.statusCode > 0) {
                            return callback(null, idChains);
                        }
                        return callback(null, false);
                    });

                    return callback(null, idChains);
                });
            });
        }

        exports.config = function(callback) {
            return $pinf.reloadConfig(function(err) {
                if (err) return callback(err);
                return callback(null, config);
            });
        }

        exports.start = function (callback) {
            return exports.isRunning(function(err, running) {
                if (err) return callback(err);
                if (running) {
                    return callback(new Error("Cannot start. Already running!"));
                }
                return ensureConfig(function(err) {
                    if (err) return callback(err);
                    var child = SPAWN(getMonPath(), [
                        "--log", monLogPath,
                        "--daemonize",
                        launcherPath
                    ], {
                        detached: true,
                        stdio: [
                            "ignore",
                            FS.openSync($pinf.makePath("log", "mon.start.stdout.log"), "a"),
                            FS.openSync($pinf.makePath("log", "mon.start.stderr.log"), "a")
                        ]
                    });
                    child.unref();
                    return waitUntil(true, callback);
                });
            });
        }

        exports.stop = function (callback) {
            return exports.isRunning(function(err, running) {
                if (err) return callback(err);
                if (!running) {
                    return callback(new Error("Cannot stop. Not running!"));
                }
                return stopAllAndWait(function(err) {
                    if (err) return callback(err);
                    return removeConfig(callback);
                });
            });
        }

        return callback(null, exports);
    }


    PINF_MAIN(function(options, callback) {

        return module.exports.for(options.$pinf, function(err, exports) {
            if (err) return callback(err);

            var program = new COMMANDER.Command();

            program
                .version(JSON.parse(FS.readFileSync(PATH.join(__dirname, "package.json"))).version)
                .option("-v, --verbose", "Show verbose progress.");

            var acted = false;

            program
                .command("start")
                .description("Start")
                .action(function() {
                    acted = true;
                    return exports.start(function(err, status) {
                        if (err) return callback(err);
                        process.stdout.write(JSON.stringify(status, null, 4) + "\n");
                        return callback(null);
                    });
                });

            program
                .command("stop")
                .description("Stop")
                .action(function() {
                    acted = true;
                    return exports.stop(function(err, status) {
                        if (err) return callback(err);
                        process.stdout.write(JSON.stringify(status, null, 4) + "\n");
                        return callback(null);
                    });
                });

            program
                .command("config")
                .description("Config")
                .action(function() {
                    acted = true;
                    return exports.config(function(err, config) {
                        if (err) return callback(err);
                        process.stdout.write(JSON.stringify(config, null, 4) + "\n");
                        return callback(null);
                    });
                });

            program
                .command("status")
                .description("Status")
                .action(function() {
                    acted = true;
                    return exports.isRunning(function(err, running) {
                        if (err) return callback(err);
                        process.stdout.write(JSON.stringify(running, null, 4) + "\n");
                        return callback(null);
                    });
                });

            program.parse(process.argv);

            if (!acted) {
                console.error(("ERROR: Command '" + process.argv.slice(2).join(" ") + "' not found!").error);
                program.outputHelp();
                return callback(true);
            }
        });

    }, module);

}
