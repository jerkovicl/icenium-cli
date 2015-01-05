///<reference path="./../.d.ts"/>
"use strict";

import util = require("util");

import frameworkProjectBasePath = require("./framework-project-base");

export class CordovaProject extends frameworkProjectBasePath.FrameworkProjectBase implements Project.IFrameworkProject {

	constructor(private $config: IConfiguration,
		$resources: IResourceLoader) {
		super($resources);
	}

	public get defaultTemplateName(): string {
		return this.$config.DEFAULT_CORDOVA_PROJECT_TEMPLATE;
	}

	public getTemplateFileName(name: string): string {
		return util.format("Telerik.Mobile.%s.%s.zip", "Cordova", name);
	}

	public projectTemplatesString(): string {
		return this.projectTemplatesString(/.*Telerik\.Mobile\.Cordova\.(.+)\.zip/)
	}
}
$injector.register("cordovaProject", CordovaProject);