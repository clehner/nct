#!/usr/bin/env nodejs

var namecoind = require("namecoin-rpc");
var pkg = require("./package");
// var Pinentry = require("pinentry");
var ini = require("node-ini");

var client;
var minExpires = 5000;

var commands = {
	list: function() {
		client.cmd("name_list", function (err, result) {
			if (err) throw err;
			console.log(result.map(function (data) {
				return data.name + "\t" + data.address + "\t" +data.expires_in;
			}).join("\n"));
		});
	},

	info: function (name) {
		client.cmd("name_show", name, function (err, result) {
			if (err) throw err;
			console.log(result);
		});
	},

	cat: function (name) {
		client.cmd("name_show", name, function (err, result) {
			if (err) throw err;
			if (result.value) {
				try {
					var value = JSON.parse(result.value);
					console.log(JSON.stringify(value, null, 3));
				} catch(e) {
					console.log(value);
				}
			}
		});
	},

	edit: function (name) {
		console.log("edit", name);
	},

	"update-expiring": function () {
		client.cmd("name_list", function (err, result) {
			if (err) throw err;
			var batch = result.filter(function (data) {
				return data.expires_in < minExpires;
			}).map(function (data) {
				return {
					method: "name_update",
					params: [data.name, data.value]
				};
			});
			if (batch.length) {
				var i = 0;
				client.cmd(batch, function(err, result) {
					if (err) return console.log(err);
					var name = batch[i++].params[0];
					console.log(name, result);
				});
			}
		});
	}
};

var fn = commands[process.argv[2]];
if (!fn) {
	console.log([
		"Usage: " + pkg.name + " <command> [arguments]",
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
	user: conf.rpcuser || process.env.user,
	pass: conf.rpcpassword || "",
	port: conf.rpcport || 8336,
	host: conf.rpcconnet || "127.0.0.1",
	ssl: !!conf.rpcssl
});

fn.apply(this, process.argv.slice(3));
