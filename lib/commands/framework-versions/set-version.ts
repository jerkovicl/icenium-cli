///<reference path="../../.d.ts"/>
"use strict";

import projectTypes = require("../../project-types");

export class SetFrameworkVersionCommand implements ICommand {
	constructor(private $cordovaMigrationService: ICordovaMigrationService,
		private $project: Project.IProject) { }

	public execute(args: string[]): IFuture<void> {
		return (() => {
			this.$project.onFrameworkVersionChanging(args[0]).wait();
			this.$project.projectData["FrameworkVersion"] = args[0];
			this.$project.saveProject().wait();
		}).future<void>()();
	}

	public allowedParameters: ICommandParameter[] = [$injector.resolve(MobileFrameworkCommandParameter)];
}
$injector.registerCommand("mobileframework|set", SetFrameworkVersionCommand);

export class MobileFrameworkCommandParameter implements ICommandParameter {
	private static VERSION_REGEX = new RegExp("^(\\d+\\.){2}\\d+$");

	constructor(private $cordovaMigrationService: ICordovaMigrationService,
		private $project: Project.IProject,
		private $errors: IErrors) { }

	public mandatory = true;

	public validate(value: string, errorMessage?: string): IFuture<boolean> {
		return (() => {
			this.$project.ensureCordovaProject();

			if(value.match(MobileFrameworkCommandParameter.VERSION_REGEX)) {
				var supportedVersions = this.$cordovaMigrationService.getSupportedVersions().wait();
				if(_.contains(supportedVersions, value)) {
					return true;
				}

				this.$errors.fail("The value %s is not a supported version. Supported versions are: %s", value, supportedVersions);
			}

			this.$errors.fail("Version is not in correct format. Correct format is <Major>.<Minor>.<Patch>, for example '3.5.0'.");
		}).future<boolean>()();
	}
}