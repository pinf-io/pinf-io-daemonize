
const PINF_MAIN = require("pinf-for-nodejs/lib/main").main;
const IO = require("./io");

exports.forModule = function(module, moduleOverlays) {

	module.exports.main = function(options, request, callback) {

		return PINF_MAIN(function(options, callback) {

			// Only proceed if we are enabled.
			if (!options.$pinf.config.enable) {
				return callback(null);
			}

			IO.forModule({
				exports: IO
			}, moduleOverlays);

			return IO.for(options.$pinf, function(err, IO) {
				if (err) return callback(err);

				function returnStatus(callback) {
					return IO.isRunning(function(err, running) {
						if (err) return callback(err);
						if (!running) {
							return callback(null, {
								running: false,
								pid: null,
								port: null
							});
						}
						return IO.config(function(err, config) {
							if (err) return callback(err);
							return callback(null, {
								running: true,
								pid: running,
								port: config.pinf.io.port
							});
						});
					});
				}

				if (request.event === "pinf/0/runtime/control/0#events/start") {
					return IO.isRunning(function(err, running) {
						if (err) return callback(err);
						if (running) {
							return returnStatus(callback);
						}
						return IO.start(function(err) {
							if (err) return callback(err);
							return returnStatus(callback);
						});
					});
				} else
				if (request.event === "pinf/0/runtime/control/0#events/stop") {
					return IO.isRunning(function(err, running) {
						if (err) return callback(err);
						if (!running) {
							return returnStatus(callback);
						}
						return IO.stop(function(err) {
							if (err) return callback(err);
							return returnStatus(callback);
						});
					});
				}
				return callback(new Error("Event '" + request.event + "' not supported!"));

			});

		}, module, options, callback);
	}
}
