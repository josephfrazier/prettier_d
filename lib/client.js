"use strict";

const fs = require("fs");
const net = require("net");
const portfile = require("./portfile");

exports.connect = connect;
function connect(callback) {
  const data = portfile.read();
  if (!data) {
    return callback(new Error("Not running"));
  }
  net
    .connect(
      data.port,
      "127.0.0.1",
      function() {
        callback(null, this, data.token);
      }
    )
    .on("error", () => {
      callback(new Error("Could not connect"));
    });
}

exports.stop = function(callback) {
  connect((err, socket, token) => {
    if (err) {
      process.stdout.write(err + "\n");
      return;
    }
    socket.end(token + " stop", () => {
      if (typeof callback === "function") {
        callback();
      }
    });
  });
};

exports.status = function() {
  connect((err, socket) => {
    if (err) {
      process.stdout.write(err + "\n");
      return;
    }
    socket.end(() => {
      process.stdout.write("Running\n");
    });
  });
};

exports.lint = function(args, text) {
  function lint(socket, token) {
    let buf = "";
    socket.on("data", chunk => {
      buf += chunk;
      const p = buf.lastIndexOf("\n");
      if (p !== -1) {
        process.stdout.write(buf.slice(0, Math.max(0, p + 1)));
        buf = buf.slice(Math.max(0, p + 1));
      }
    });
    socket.on("end", () => {
      if (buf) {
        if (buf === "# exit 1") {
          process.exitCode = 1;
        } else {
          const { stdout, stderr, status, write } = JSON.parse(buf);

          process.stdout.write(stdout);
          process.stderr.write(stderr);

          write.forEach(({ filename, content }) =>
            fs.writeFileSync(filename, content)
          );

          process.exit(status);
        }
      }
    });
    socket.end(
      token +
        " " +
        JSON.stringify({
          cwd: process.cwd(),
          args,
          text
        })
    );
  }
  connect((err, socket, token) => {
    if (err) {
      launcher(() => {
        connect((err, socket, token) => {
          if (err) {
            process.stdout.write(err + "\n");
          } else {
            lint(socket, token);
          }
        });
      });
    } else {
      lint(socket, token);
    }
  });
};

function check(callback) {
  connect((err, socket, token) => {
    if (socket) {
      socket.end();
    }
    callback(err, socket, token);
  });
}

function wait(callback) {
  check(err => {
    if (!err) {
      if (typeof callback === "function") {
        callback(null);
      }
    } else {
      setTimeout(() => {
        wait(callback);
      }, 100);
    }
  });
}

function launch(callback) {
  const {spawn} = require("child_process");
  const server = require.resolve("../lib/server");
  const child = spawn("node", [server], {
    detached: true,
    stdio: ["ignore", "ignore", "ignore"]
  });
  child.unref();
  setTimeout(() => {
    wait(callback);
  }, 100);
}

exports.launcher = launcher;
function launcher(callback) {
  check(err => {
    if (!err) {
      process.stdout.write("Already running\n");
    } else {
      launch(callback);
    }
  });
}
