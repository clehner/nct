#!/usr/bin/env nodejs

var fs = require("fs");
var namecoind = require("namecoin-rpc");
var pkg = require("./package");
var Pinentry = require("pinentry");
var ini = require("node-ini");
var spawn = require("child_process").spawn;
var mktemp = require("mktemp");
var readline = require("readline");

var client;
var minExpires = 5000;
var unlockTime = 300;

function rpc(name, args, cb) {
	client.cmd(name, args, function (err, result) {
		if (err) {
			if (err.code == "ECONNREFUSED") {
				console.error("Unable to connect to namecoind");
				process.exit(1);
			}
		}
		cb(err, result);
	});
}

function fetchName(name, cb) {
	rpc("name_show", [name], function (err, result) {
		if (err) return cb(err);
		if (result.value) {
			var value = result.value;
			var json = true;
			try {
				value = JSON.stringify(JSON.parse(value), null, 3);
			} catch(e) {
				json = false;
			}
			cb(null, value, json);
		}
	});
}

function unlockWallet(cb, errorMsg) {
	new Pinentry().connect().getPin({
		prompt: "Unlock Namecoin wallet",
		desc: "Please enter the wallet passphrase",
		error: errorMsg
	}, function (err, pin) {
		this.close();
		if (err) {
			if (err instanceof Pinentry.OperationCancelledError) {
				return cb("passphrase");
			} else {
				return cb(err);
			}
		}

		if (!pin) {
			return unlockWallet(cb);
		}

		rpc("walletpassphrase", [pin, unlockTime], function (err) {
			if (err) {
				if (err.code == -14) {
					unlockWallet(cb,
						"The wallet passphrase entered was incorrect");
				} else {
					cb(err);
				}
			} else {
				cb(null);
			}
		});
	});
}

function saveName(name, data, cb) {
	rpc("name_update", [name, data], function (err, result) {
		if (err) {
			if (err.code == -13) {
				unlockWallet(function (err) {
					if (err) return cb(err, null);
					saveName(name, data, cb);
				});
			} else {
				cb(null, result);
			}
		} else {
			cb(err, null);
		}
	});
}

function saveJSON(name, path, data, cb) {
	var json;
	try {
		json = JSON.parse(data);
	} catch(e) {
		promptReEdit("Invalid JSON", function (resp) {
			switch (resp) {
				case "edit":
					return editName(name, path, data, true, cb);
				case "use":
					return saveName(name, data, cb);
				case "cancel":
					return cb("cancel", null);
			}
		});
		return;
	}
	data = JSON.stringify(json);
	saveName(name, data, cb);
}

function editName(name, path, oldData, asJSON, cb) {
	var data;
	openEditor(path, function (status) {
		if (status)
			return cb("exit");
		data = fs.readFileSync(path, {encoding: "utf8"});
		if (data == oldData) {
			promptReEdit("Data is unchanged", function (resp) {
				switch (resp) {
					case "edit":
						return editName(name, path, data, asJSON, cb);
					case "use":
						return next();
					case "cancel":
						return cb("cancel", null);
				}
			});
		} else {
			next();
		}
	});

	function next() {
		if (asJSON) {
			saveJSON(name, path, data, cb);
		} else if (data[0] == "{" || data[1] == "[") {
			promptYesNo("Is this JSON?", function (yes) {
				if (yes)
					saveJSON(name, path, data, cb);
				else
					saveName(name, data, cb);
			});
		} else {
			saveName(name, data, cb);
		}
	}
}

function openEditor(filename, cb) {
	spawn(process.env.EDITOR || "vi", [filename], {
		stdio: [0, 1, 2]
	}).on("close", cb);
}

function prompt(msg, cb) {
	var rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout
	});
	var answered;

	rl.on("close", function () {
		if (!answered) {
			process.stdout.write("\n");
			return cb("cancel");
		}
	});

	rl.question(msg + " ", function onAnswer(answer) {
		answered = true;
		if (cb(answer.toLowerCase()))
			rl.close();
		else
			rl.question(msg, onAnswer);
	});
}

function promptReEdit(msg, cb) {
	msg = (msg ? msg + ". " : "") +
		"[E]dit again, [u]se as-is, or [c]ancel?";
	prompt(msg, function (answer) {
		if (!answer)
			return false;
		for (var opt in {edit: 1, use: 1, cancel: 1}) {
			if (answer.indexOf(opt) === 0 || opt.indexOf(answer) === 0) {
				cb(opt);
				return true;
			}
		}
	});
}

function promptYesNo(msg, cb) {
	prompt(msg + " [Y/n]", function (answer) {
		if (!answer || answer[0] == 'y')
			cb(true);
		else if (answer == 'n')
			cb(false);
		else
			return false;
		return true;
	});
}

function updateNames(names, cb) {
	if (names.length === 0) return;
	var name = names.shift();
	saveName(name.name, name.value, function (err, result) {
		if (err == "passphrase") {
			cb(err);
		} else {
			cb(err, name, result);
			updateNames(names, cb);
		}
	});
}

var commands = {
	list: function() {
		rpc("name_list", [], function (err, result) {
			if (err) throw err;
			console.log(result.map(function (data) {
				return data.name + "\t" + data.address + "\t" +data.expires_in;
			}).join("\n"));
		});
	},

	info: function (name) {
		if (!name) {
			console.error("Usage: " + pkg.name + " edit <name>");
			process.exit(1);
		}

		rpc("name_show", [name], function (err, result) {
			if (err) throw err;
			console.log(result);
		});
	},

	cat: function (name) {
		if (!name) {
			console.error("Usage: " + pkg.name + " edit <name>");
			process.exit(1);
		}

		fetchName(name, function (err, data) {
			if (err) throw err;
			console.log(data);
		});
	},

	edit: function (name) {
		if (!name) {
			console.error("Usage: " + pkg.name + " edit <name>");
			process.exit(1);
		}

		fetchName(name, function (err, data, wasJSON) {
			if (err) {
				if (err.code == -4) {
					console.error("Name \"" + name + "\" does not exist");
					process.exit(1);
				} else {
					throw err;
				}
			}
			var template = "/tmp/nct-" + name.replace(/\//g, "-") +
				"-XXXXXXX" + (wasJSON ? ".json" : "");
			var path = mktemp.createFileSync(template);
			fs.writeFileSync(path, data);
			editName(name, path, data, wasJSON, function (err, tx) {
				fs.unlinkSync(path);
				if (err) {
					if (err == "cancel") {
						console.log("Update canceled");
					} else if (err == "passphrase") {
						console.log("Passphrase entry canceled");
					} else if (err == "exit") {
						console.log("Aborting because of non-zero " +
							"exit status");
					} else {
						throw err;
					}
					process.exit(1);
				} else {
					console.log("TX:", tx);
				}
			});
		});
	},

	"update-expiring": function () {
		rpc("name_list", [], function (err, result) {
			if (err) throw err;
			var names = result.filter(function (data) {
				return data.expires_in < minExpires;
			});

			if (names.length === 0) {
				console.log("All names are up to date");
				return;
			}

			console.log("Updating", names.length, "names");

			updateNames(names, function (err, name, tx) {
				if (err) {
					if (err == "passphrase") {
						console.log("Passphrase entry canceled");
					} else {
						console.log(name, err);
					}
				} else {
					console.log(name + ": " + tx);
				}
			});
		});
	},

	"-v": function () {
		console.log(pkg.version);
	}
};

var fn = commands[process.argv[2]];
if (!fn) {
	console.log([
		"Usage: nct <command> [arguments]",
		"Commands:",
		"    list",
		"    info <name>",
		"    cat <name>",
		"    edit <name>",
		"    update-expiring",
	].join("\n"));
	process.exit(process.argv.length == 2 ? 0 : 1);
}

var conf = ini.parseSync(process.env.HOME + "/.namecoin/namecoin.conf");
client = new namecoind.Client({
	user: conf.rpcuser || process.env.USER,
	pass: conf.rpcpassword || "",
	port: conf.rpcport || 8336,
	host: conf.rpcconnet || "127.0.0.1",
	ssl: !!conf.rpcssl
});

fn.apply(this, process.argv.slice(3));
