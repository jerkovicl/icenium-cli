///<reference path="../.d.ts"/>

"use strict";

import util = require("util");
import path = require("path");
import helpers = require("../helpers");
import hostInfo = require("../common/host-info");

export class EditConfigurationCommandParameter implements ICommandParameter {
	constructor(private $errors: IErrors,
		private $templatesService: ITemplatesService,
		private $project: Project.IProject) { }

	mandatory = true;

	validate(validationValue: string): IFuture<boolean> {
		return (() => {
			var template = _.findWhere(this.$project.projectConfigFiles, { template: validationValue });
			if(!template) {
				if(validationValue) {
					this.$errors.fail("There is no matching configuration file for: %s", validationValue);
				}
				else {
					this.$errors.fail("You must choose which configuration file to edit!");
				}
			}

			return true;
		}).future<boolean>()();
	}
}

export class EditConfigurationCommand implements ICommand {
	constructor(private $logger: ILogger,
		private $fs: IFileSystem,
		private $errors: IErrors,
		private $opener: IOpener,
		private $project: Project.IProject,
		private $templatesService: ITemplatesService) {
	}

	allowedParameters = [new EditConfigurationCommandParameter(this.$errors, this.$templatesService, this.$project)];

	execute(args: string[]): IFuture<void> {
		var file = args[0];
		var template = _.findWhere(this.$project.projectConfigFiles, { template: file });
		return this.executeImplementation(template);
	}

	private executeImplementation(template: Project.IConfigurationFile): IFuture<void> {
		return (() => {
			this.$project.ensureProject();
			var projectPath = this.$project.getProjectDir().wait();
			var filepath = path.join(projectPath, template.filepath);
			var directory = path.dirname(filepath);
			if (!this.$fs.exists(filepath).wait()) {
				this.$logger.info("Creating configuration file: " + filepath);
				var templateFilePath = path.join(this.$templatesService.itemTemplatesDir, template.templateFilepath);
				this.$fs.unzip(templateFilePath, directory).wait();

				//delete extra file in template zip
				this.$fs.deleteFile(path.join(directory, "server.vstemplate")).wait();
				if (hostInfo.isWindows()) {
					var contents = this.$fs.readText(filepath).wait();
					contents = helpers.stringReplaceAll(contents, "\n", "\r\n");
					this.$fs.writeFile(filepath, contents).wait();
				}
			}

			this.$logger.info("Opening configuration file: " + filepath);
			this.$opener.open(filepath);
		}).future<void>()();
	}
}
$injector.registerCommand("edit-configuration", EditConfigurationCommand);