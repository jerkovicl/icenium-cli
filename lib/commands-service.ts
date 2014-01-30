///<reference path=".d.ts"/>
"use strict";

import _ = require("underscore");

export class CommandsService implements ICommandsService {
	constructor(
		private $errors: IErrors
		) {}

	private commands = {
		"config-reset": this.makeCommand("config", "reset"),
		"config-apply": this.makeCommand("config", "apply"),
	};

	public executeCommand(commandName: string, commandArguments: string[]): boolean {
		return this.$errors.beginCommand(() => {
			var command = this.commands[commandName];
			if (command) {
				command().apply(null, commandArguments);
				return true;
			}

			command = $injector.resolveCommand(commandName);
			if (command) {
				command.execute(commandArguments);
				return true;
			}

			return false;
		}, () => {
			this.executeCommand("help", [commandName]);
		});
	}

	public completeCommand() {
		var tabtab = require("tabtab");
		tabtab.complete("ab", (err, data) => {
			if (err || !data) {
				return;
			}

			var deviceSpecific = ["build", "deploy"];
			var propertyCommands = ["prop-cat", "prop-set", "prop-add", "prop-del"];

			if (data.last.startsWith("--")) {
				return tabtab.log(Object.keys(require("./options").knownOpts), data, "--");
			} else if (deviceSpecific.contains(data.prev)) {
				return tabtab.log(["ios", "android"], data);
			} else {
				var propSchema = require("./helpers").getProjectFileSchema();
				if (propertyCommands.contains(data.prev)) {
					return tabtab.log(Object.keys(propSchema), data);
				} else if (_.some(propertyCommands, (cmd) => {
					return data.line.indexOf(" " + cmd + " ") >= 0;
				})) {
					var parseResult = /prop-[^ ]+ ([^ ]+) /.exec(data.line);
					if (parseResult) {
						var propName = parseResult[1];
						if (propName && propSchema[propName]) {
							var range = propSchema[propName].range;
							if (range) {
								if (!_.isArray(range)) {
									var helpers = require("./helpers");
									range = _.map(range, (value: { input }, key) => {
										return value.input || key;
									});
								}
								return tabtab.log(range, data);
							}
						}
					}
				}
				return tabtab.log(this.getAvailableCommands(), data);
			}
		});

		return true;
	}

	private getAvailableCommands(): string[] {
		var legacyCommandsNames = <_.List<string>>_.keys(this.commands);
		var commandsNames = <_.List<string>>$injector.getRegisteredCommandsNames();

		return _.union(legacyCommandsNames, commandsNames);
	}

	private makeCommand(module, command) {
		return () => {
			return require("./" + module)[command];
		};
	}
}
$injector.register("commandsService", CommandsService);
