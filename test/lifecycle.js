
const ASSERT = require("assert");
const PATH = require("path");
const EXEC = require("child_process").exec;
const REQUEST = require("request");


describe("lifecycle", function() {

    this.timeout(10 * 1000);

    describe("clean", function() {

        var config = null;

        it("status", function(done) {
            return call(["status"], function(err, stdout) {
                if (err) return done(err);
                var ids = JSON.parse(stdout);
                if (ids) {
                    return done(new Error("Process running at beginning of test!"));
                }
                return done();
            });
        });

        it("config", function(done) {
            return call(["config"], function(err, stdout) {
                if (err) return done(err);
                config = JSON.parse(stdout);
                ASSERT.equal(config.pinf.io.port, null);
                return done();
            });
        });

        it("start", function(done) {
            return call(["start"], function(err, stdout) {
                if (err) return done(err);
                return done();
            });
        });

        it("status", function(done) {
            return call(["status"], function(err, stdout) {
                if (err) return done(err);
                var ids = JSON.parse(stdout);
                ASSERT.equal(typeof ids, "object");
                ASSERT.equal(Array.isArray(ids[Object.keys(ids)[0]]), true);
                return done();
            });
        });

        it("config", function(done) {
            return call(["config"], function(err, stdout) {
                if (err) return done(err);
                config = JSON.parse(stdout);
                ASSERT.equal(typeof config.pinf.io.port, "number");
                return done();
            });
        });

        it("make request", function(done) {
            return REQUEST("http://127.0.0.1:" + config.pinf.io.port + "/", function (err, res, body) {
                if (err) return done(err);
                ASSERT.equal(body, "Hello World");
                return done();
            });
        });

        it("stop", function(done) {
            return call(["stop"], function(err, stdout) {
                if (err) return done(err);
                return done();
            });
        });

        it("status", function(done) {
            return call(["status"], function(err, stdout) {
                if (err) return done(err);
                var ids = JSON.parse(stdout);
                if (ids) {
                    return done(new Error("Process running at end of test!"));
                }
                return done();
            });
        });

        it("config", function(done) {
            return call(["config"], function(err, stdout) {
                if (err) return done(err);
                var config = JSON.parse(stdout);
                ASSERT.equal(config.pinf.io.port, null);
                return done();
            });
        });
    });

    function call(args, callback) {
        var env = {};
        for (var name in process.env) {
            env[name] = process.env[name];
        }
        env.PINF_PROGRAM = PATH.join(__dirname, "program.json");
        env.PINF_RUNTIME = PATH.join(__dirname, ".rt/program.rt.json");
        return EXEC("node " + PATH.join(__dirname, "assets/io") + " " + args.join(" "), {
            env: env
        }, function (err, stdout, stderr) {
//console.log("STDOUT", stdout);
            if (err) return callback(err);
            return callback(null, stdout);
        });
    }

});
