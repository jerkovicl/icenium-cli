///<reference path="../.d.ts"/>
"use strict";
import path = require("path");

require("./../bootstrap");
import fiberBootstrap = require("./../fiber-bootstrap");
import commonHelpers = require("./../common/helpers");
fiberBootstrap.run(() => {
	$injector.require("typeScriptCompilationService", "./common/services/typescript-compilation-service");

	var project: Project.IProject = $injector.resolve("project");
	project.ensureProject();
	var projectFiles = commonHelpers.enumerateFilesInDirectorySync(project.getProjectDir().wait());

	var typeScriptFiles = _.filter(projectFiles, file => path.extname(file) === ".ts");
	var definitionFiles = _.filter(typeScriptFiles, file => _.endsWith(file, ".d.ts"));

	if(typeScriptFiles.length > definitionFiles.length) { // We need this check because some of non-typescript templates(for example KendoUI.Strip) contain typescript definition files
		var typeScriptCompilationService = $injector.resolve("typeScriptCompilationService");
		typeScriptCompilationService.initialize(typeScriptFiles);
		typeScriptCompilationService.compileAllFiles().wait();
	}
});
