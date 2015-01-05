///<reference path="./../.d.ts"/>
"use strict";

import util = require("util");
import frameworkProjectBasePath = require("./framework-project-base");

export class NativeScriptProject extends frameworkProjectBasePath.FrameworkProjectBase implements Project.IFrameworkProject {

	constructor(private $config: IConfiguration,
		resources: IResourceLoader) {
		super(resources);
	}

	public get defaultTemplateName(): string {
		return this.$config.DEFAULT_NATIVESCRIPT_PROJECT_TEMPLATE;
	}

	public getTemplateFileName(name: string): string {
		return util.format("Telerik.Mobile.%s.%s.zip", "NativeScript", name);
	}

	public projectTemplatesString(): string {
		return this.projectTemplatesString(/.*Telerik\.Mobile\.NativeScript\.(.+)\.zip/);
	}
}
$injector.register("nativeScriptProject", NativeScriptProject);