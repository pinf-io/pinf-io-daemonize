
require("../../io").forModule(module, {
	name: "test",
	// This config should express all config options of the module in a format
	// as similar to the naming and convenions used in the packages it abstracts.
	defaultConfig: {
        "httpd": {
            "port": null
        }
    },
    // Convert the module-specific format to our universal one.
    toStandardConfig: function(config) {
    	return {
	        "io": {
	            "port": (config && config.httpd.port) || null
	        }
	    };
	},
    // Convert our universal format to the module-specific format.
	fromStandardConfig: function(config) {
		return {
            "httpd": {
                "port": config.io.port
            }
        };
    },
    getLaunchScript: function($pinf, config, options) {
        var args = [
            "node",
            $pinf.config.scriptPath
        ];
        args = args.concat([
            ">", options.stdoutPath,
            "2>", options.stderrPath
        ]);
		return [
			"#!/bin/sh",
			"export PORT=" + config.httpd.port,
			args.join(" ")
		].join("\n");
    }
});
