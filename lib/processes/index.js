
/*
Copyright (c) 2014, Groupon, Inc.
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions
are met:

Redistributions of source code must retain the above copyright notice,
this list of conditions and the following disclaimer.

Redistributions in binary form must reproduce the above copyright
notice, this list of conditions and the following disclaimer in the
documentation and/or other materials provided with the distribution.

Neither the name of GROUPON nor the names of its contributors may be
used to endorse or promote products derived from this software without
specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS
IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED
TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A
PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED
TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
var async, concat, debug, ensureAppPort, ensureSeleniumListening, extend, findOpenPort, http, initProcesses, spawn, spawnApplication, spawnPhantom, spawnProxy, spawnSelenium;

spawn = require('child_process').spawn;

http = require('http');

async = require('async');

extend = require('lodash').extend;

concat = require('concat-stream');

debug = require('debug')('testium:processes');

findOpenPort = require('./port').findOpenPort;

spawnProxy = require('./proxy');

spawnPhantom = require('./phantom');

spawnSelenium = require('./selenium');

spawnApplication = require('./application');

ensureAppPort = function(config, done) {
  if (config.app.port === 0) {
    return findOpenPort(function(err, port) {
      if (err != null) {
        return done(err);
      }
      config.app.port = port;
      return done();
    });
  } else {
    return done();
  }
};

ensureSeleniumListening = function(driverUrl, callback) {
  var req;
  req = http.get("" + driverUrl + "/status", function(response) {
    var statusCode;
    statusCode = response.statusCode;
    if (statusCode !== 200) {
      callback(new Error("Selenium not healthy: status code " + statusCode));
    }
    response.setEncoding('utf8');
    response.pipe(concat(function(body) {
      var parseError, statusReport;
      try {
        statusReport = JSON.parse(body);
        if (statusReport.status !== 0) {
          return callback(new Error("Selenium not healthy: " + body));
        } else {
          return callback();
        }
      } catch (_error) {
        parseError = _error;
        return callback(parseError);
      }
    }));
    return callback(null, {
      driverUrl: driverUrl
    });
  });
  return req.on('error', function(error) {
    var oldStack;
    oldStack = error.stack;
    oldStack = oldStack.substr(oldStack.indexOf('\n') + 1);
    error.message = "Error: Failed to connect to existing selenium server\n       - url: " + driverUrl + "\n       - message: " + error.message;
    error.stack = "" + error.message + "\n" + oldStack;
    return callback(error);
  });
};

initProcesses = function() {
  var cached;
  cached = null;
  return {
    ensureRunning: function(config, callback) {
      if (cached != null) {
        debug('Returning cached processes');
        return process.nextTick(function() {
          return callback(cached.error, cached.results);
        });
      }
      debug('Launching processes');
      return async.auto({
        ensureAppPort: function(done) {
          return ensureAppPort(config, done);
        },
        selenium: function(done) {
          if (config.desiredCapabilities.browserName === 'phantomjs') {
            return spawnPhantom(config, done);
          } else {
            return spawnSelenium(config, done);
          }
        },
        seleniumReady: [
          'selenium', function(done, _arg) {
            var selenium;
            selenium = _arg.selenium;
            return ensureSeleniumListening(selenium.driverUrl, done);
          }
        ],
        proxy: [
          'ensureAppPort', function(done) {
            return spawnProxy(config, done);
          }
        ],
        application: [
          'ensureAppPort', function(done) {
            return spawnApplication(config, done);
          }
        ]
      }, function(error, results) {
        cached = {
          error: error,
          results: results
        };
        return callback(error, results);
      });
    }
  };
};

module.exports = extend(initProcesses, {
  spawnPhantom: spawnPhantom,
  spawnProxy: spawnProxy,
  spawnApplication: spawnApplication
});